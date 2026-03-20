/**
 * Beacon Voice Tools — Account Lookup Handler (Placeholder)
 *
 * Looks up an account by phone number for internal agent context.
 * Caller: ElevenLabs voice agent (internal use only)
 * Status: Placeholder — will be connected to HTS API in Phase 2
 *
 * Current behavior: Returns a response indicating HTS API integration is pending.
 * The agent uses this to guide troubleshooting but NEVER shares results with the caller.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { validateApiKey, getCallerId } from './shared/auth';
import { logSuccess } from './shared/audit';

/**
 * Lambda handler for GET /accounts/lookup
 *
 * Query parameters:
 * - phone: The phone number to look up (defaults to caller ID if not provided)
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
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

    logSuccess(callerId, 'account_lookup', `Lookup for phone: ${phone}`);

    // ──────────────────────────────────────────────
    // Placeholder response
    // ──────────────────────────────────────────────
    // In Phase 2, this will query the HTS API.
    // For now, return a mock response indicating the feature is pending.
    return {
      statusCode: 200,
      body: JSON.stringify({
        found: false,
        message: 'HTS API integration pending (Phase 2)',
        note: 'In Phase 2, this will return account info for internal agent use',
      }),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Account lookup handler error:', errorMsg);

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
