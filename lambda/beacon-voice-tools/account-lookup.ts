/**
 * Beacon Voice Tools — Account Lookup Handler
 *
 * Looks up an account by phone number for internal agent context.
 * Caller: ElevenLabs voice agent (internal use only)
 *
 * Phase 2 Implementation Plan:
 * ────────────────────────────
 * This will connect to HTS API to resolve:
 * - Phone number → Account ID
 * - Account ID → Company/subdomain
 * - Account ID → Email address
 * - Account ID → Subscription status / integrations
 *
 * This data enables:
 * - Password reset (via discovered subdomain)
 * - Integration status checks
 * - Troubleshooting context for internal agents
 *
 * Current Status: Returns 501 Not Implemented with honest message.
 * The agent uses placeholder responses to guide troubleshooting but
 * NEVER shares raw data with the caller.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { validateApiKey, getCallerId, AuthError } from './shared/auth';
import { logSuccess, logError } from './shared/audit';

/**
 * Lambda handler for GET /accounts/lookup
 *
 * Query parameters:
 * - phone: The phone number to look up (defaults to caller ID if not provided)
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const requestId = event.requestContext?.requestId;

  try {
    // ──────────────────────────────────────────────
    // Authentication
    // ──────────────────────────────────────────────
    validateApiKey(event);
    const callerId = getCallerId(event);

    // ──────────────────────────────────────────────
    // Get phone parameter (defaults to caller ID)
    // ──────────────────────────────────────────────
    const phone = event.queryStringParameters?.phone || callerId;

    logSuccess(callerId, 'account_lookup', `[${requestId}] Lookup for phone: ${phone} — not yet implemented`);

    // ──────────────────────────────────────────────
    // Honest response: Account lookup not yet implemented
    // ──────────────────────────────────────────────
    return {
      statusCode: 501,
      body: JSON.stringify({
        available: false,
        message: 'Account lookup is not yet available. Our team is preparing this feature.',
        phase2_note: 'Phase 2 will implement HTS API integration for account resolution',
        request_id: requestId,
      }),
    };
  } catch (error) {
    // Handle authentication errors separately to return 400
    if (error instanceof AuthError) {
      console.error(`[${requestId}] Authentication error:`, error.message);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: error.message, request_id: requestId }),
      };
    }

    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[${requestId}] Account lookup handler error:`, errorMsg);

    try {
      const callerId = getCallerId(event);
      logError(callerId, 'account_lookup', `[${requestId}] ${errorMsg}`);
    } catch {
      // If we can't get caller ID, just log the error
      console.error(`[${requestId}] Could not log error to audit trail`);
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error', request_id: requestId }),
    };
  }
}
