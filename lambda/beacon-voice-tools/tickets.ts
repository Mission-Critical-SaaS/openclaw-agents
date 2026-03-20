/**
 * Beacon Voice Tools — Zendesk Tickets Handler
 *
 * Creates DRAFT support tickets in Zendesk as internal notes.
 * These tickets are NOT visible to customers — they appear only
 * in the agent dashboard for ops team review before any customer
 * response is sent.
 *
 * Draft behavior:
 * - Initial comment is an INTERNAL NOTE (public: false)
 * - No email notification is sent to the customer
 * - Ticket tagged with "draft", "ai-created", "pending-review"
 * - Subject prefixed with [DRAFT] for ops team visibility
 * - Status set to "new" (requires agent action)
 *
 * Caller: ElevenLabs voice agent
 * Parameters: subject, description, caller_phone, priority (optional)
 *
 * Security:
 * - Validates input parameters
 * - Associates ticket with caller's phone number
 * - Uses API token from Secrets Manager
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Buffer } from 'buffer';
import { validateApiKey, getCallerId } from './shared/auth';
import { getCredential } from './shared/secrets';
import { logSuccess, logError } from './shared/audit';

interface CreateTicketRequest {
  subject: string;
  description: string;
  requester_phone?: string;
  caller_phone?: string;  // Alias — ElevenLabs tool uses this name
  priority?: string;
  tags?: string[];
}

/**
 * Validate ticket creation request.
 */
function validateTicketRequest(body: unknown): { valid: boolean; error?: string } {
  if (typeof body !== 'object' || body === null) {
    return { valid: false, error: 'Request body must be a JSON object' };
  }

  const req = body as Record<string, unknown>;

  if (typeof req.subject !== 'string' || req.subject.length === 0) {
    return { valid: false, error: 'Parameter "subject" must be a non-empty string' };
  }

  if (typeof req.description !== 'string' || req.description.length === 0) {
    return { valid: false, error: 'Parameter "description" must be a non-empty string' };
  }

  if (req.subject.length > 200) {
    return { valid: false, error: 'Subject must be less than 200 characters' };
  }

  if (req.description.length > 5000) {
    return { valid: false, error: 'Description must be less than 5000 characters' };
  }

  // Optional: validate priority if provided
  if (req.priority && !['low', 'normal', 'high', 'urgent'].includes(String(req.priority))) {
    return { valid: false, error: 'Priority must be one of: low, normal, high, urgent' };
  }

  // Optional: validate tags if provided
  if (req.tags && !Array.isArray(req.tags)) {
    return { valid: false, error: 'Tags must be an array of strings' };
  }

  return { valid: true };
}

/**
 * Create a DRAFT ticket in Zendesk via REST API.
 *
 * Key design choices for draft mode:
 * - Uses `comment` with `public: false` instead of `description`
 *   so the initial note is INTERNAL ONLY (no customer email triggered)
 * - Prefixes subject with [DRAFT] for ops team filtering
 * - Tags with "draft" and "pending-review" for easy dashboard views
 * - Status remains "new" — requires human agent action before
 *   anything customer-facing happens
 */
async function createZendeskTicket(
  subdomain: string,
  apiToken: string,
  email: string,
  ticket: CreateTicketRequest
): Promise<number> {
  const zendeskUrl = `https://${subdomain}.zendesk.com/api/v2/tickets.json`;

  // Build the internal note body with call context
  const internalNote = [
    ticket.description,
    '',
    '---',
    `Source: Beacon AI Voice Agent`,
    `Caller phone: ${ticket.requester_phone || 'unknown'}`,
    `Created: ${new Date().toISOString()}`,
    '',
    '⚠️ This is an AI-generated draft. Please review before responding to the customer.',
  ].join('\n');

  const ticketPayload = {
    ticket: {
      subject: `[DRAFT] ${ticket.subject}`,
      // Use `comment` with public:false instead of `description`
      // This creates the ticket with an INTERNAL NOTE only —
      // no email notification is sent to the customer.
      comment: {
        body: internalNote,
        public: false,  // <-- This is the critical flag
      },
      // Set requester by phone so the ticket is associated
      // with the right customer, but no email is sent since
      // the comment is internal.
      requester: {
        phone: ticket.requester_phone,
      },
      priority: ticket.priority || 'normal',
      status: 'new',  // Requires agent action
      tags: [
        'draft',
        'ai-created',
        'voice-call',
        'pending-review',
        ...(ticket.tags || []),
      ],
    },
  };

  const authHeader = Buffer.from(`${email}/token:${apiToken}`).toString('base64');

  const response = await fetch(zendeskUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(ticketPayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Zendesk API error (${response.status}): ${errorText}`
    );
  }

  const result = (await response.json()) as { ticket?: { id?: number } };

  if (!result.ticket?.id) {
    throw new Error('No ticket ID in Zendesk response');
  }

  return result.ticket.id;
}

/**
 * Lambda handler for POST /tickets
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // ──────────────────────────────────────────────
    // Authentication
    // ──────────────────────────────────────────────
    validateApiKey(event);
    const callerId = getCallerId(event);

    // ──────────────────────────────────────────────
    // Parse request body
    // ──────────────────────────────────────────────
    let body: unknown;
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON in request body' }),
      };
    }

    // ──────────────────────────────────────────────
    // Validate parameters
    // ──────────────────────────────────────────────
    const validation = validateTicketRequest(body);
    if (!validation.valid) {
      logError(callerId, 'create_ticket', validation.error || 'Unknown validation error');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: validation.error }),
      };
    }

    const ticketReq = body as CreateTicketRequest;

    // Normalize phone field — accept caller_phone or requester_phone, fall back to x-caller-id
    ticketReq.requester_phone = ticketReq.requester_phone || ticketReq.caller_phone || callerId;

    // ──────────────────────────────────────────────
    // Get Zendesk credentials from Secrets Manager
    // ──────────────────────────────────────────────
    let subdomain: string;
    let apiToken: string;
    let apiEmail: string;
    try {
      subdomain = await getCredential('beacon/zendesk', 'subdomain');
      apiToken = await getCredential('beacon/zendesk', 'api_token');
      apiEmail = await getCredential('beacon/zendesk', 'api_email');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('Failed to retrieve Zendesk credentials:', errorMsg);
      logError(callerId, 'create_ticket', 'Failed to retrieve credentials');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Internal server error' }),
      };
    }

    // ──────────────────────────────────────────────
    // Create ticket
    // ──────────────────────────────────────────────
    const ticketId = await createZendeskTicket(
      subdomain,
      apiToken,
      apiEmail,
      ticketReq
    );

    logSuccess(callerId, 'create_ticket', `Draft ticket created: #${ticketId}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: `Support ticket #${ticketId} has been created. Our team will review it and follow up with you shortly.`,
        ticket_id: ticketId,
        draft: true,
      }),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Ticket handler error:', errorMsg);

    try {
      const callerId = getCallerId(event);
      logError(callerId, 'create_ticket', errorMsg);
    } catch {
      // If we can't get caller ID, just log the error
      console.error('Could not log error to audit trail');
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
