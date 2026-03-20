/**
 * Beacon Voice Tools — Integration Status Handler (Placeholder)
 *
 * Checks integration sync status for a customer account.
 * Caller: ElevenLabs voice agent (internal use only)
 * Status: Placeholder — will be connected to HTS API in Phase 2
 *
 * Current behavior: Returns a response indicating HTS API integration is pending.
 * The agent uses this to guide troubleshooting but NEVER shares raw data with the caller.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { validateApiKey, getCallerId } from './shared/auth';
import { logSuccess } from './shared/audit';

/**
 * Lambda handler for GET /accounts/{id}/integrations
 *
 * Path parameters:
 * - id: The account ID to check integrations for
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
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

    logSuccess(callerId, 'integration_status', `Status check for account: ${accountId}`);

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
        note: 'In Phase 2, this will return integration sync status for troubleshooting',
      }),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Integration status handler error:', errorMsg);

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
