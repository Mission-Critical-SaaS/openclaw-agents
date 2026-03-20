/**
 * Beacon Voice Tools — Integration Status Handler
 *
 * Checks integration sync status for a customer account.
 * Caller: ElevenLabs voice agent (internal use only)
 *
 * Phase 2 Implementation Plan:
 * ────────────────────────────
 * This will connect to HTS API to check:
 * - Payroll integration status (synced, pending, failed)
 * - Last sync time
 * - Any pending errors or warnings
 * - Integration health indicators
 *
 * This data helps the agent:
 * - Identify integration issues causing delays
 * - Guide troubleshooting steps
 * - Determine if escalation is needed
 *
 * Current Status: Returns 501 Not Implemented.
 * The agent uses this placeholder to guide troubleshooting but
 * NEVER shares raw integration data with the caller.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { validateApiKey, getCallerId, AuthError } from './shared/auth';
import { logSuccess, logError } from './shared/audit';

/**
 * Lambda handler for GET /accounts/{id}/integrations
 *
 * Path parameters:
 * - id: The account ID to check integrations for
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
    // Get account ID from path parameter
    // ──────────────────────────────────────────────
    const accountId = event.pathParameters?.id || 'unknown';

    logSuccess(callerId, 'integration_status', `[${requestId}] Status check for account: ${accountId} — not yet implemented`);

    // ──────────────────────────────────────────────
    // Honest response: Integration status not yet implemented
    // ──────────────────────────────────────────────
    return {
      statusCode: 501,
      body: JSON.stringify({
        available: false,
        message: 'Integration status check is not yet available. Our team is preparing this feature.',
        phase2_note: 'Phase 2 will implement HTS API integration for status checks',
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
    console.error(`[${requestId}] Integration status handler error:`, errorMsg);

    try {
      const callerId = getCallerId(event);
      logError(callerId, 'integration_status', `[${requestId}] ${errorMsg}`);
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
