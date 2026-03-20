/**
 * Beacon Voice Tools — Password Reset Handler (Placeholder)
 *
 * Triggers a password reset flow.
 * Caller: ElevenLabs voice agent
 * Status: Placeholder — will be connected to HTS API in Phase 2
 *
 * Current behavior: Returns a success response indicating that
 * a password reset email has been sent.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { validateApiKey, getCallerId } from './shared/auth';
import { logSuccess } from './shared/audit';

/**
 * Lambda handler for POST /password-reset
 *
 * Parameters (from request body):
 * - account_id (optional): The account to reset. If not provided, uses caller lookup.
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
    let body: Record<string, unknown>;
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON in request body' }),
      };
    }

    logSuccess(callerId, 'trigger_password_reset', 'Placeholder endpoint called');

    // ──────────────────────────────────────────────
    // Placeholder response
    // ──────────────────────────────────────────────
    // In Phase 2, this will call the HTS API.
    // For now, return a mock response.
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        status: 'reset_email_sent',
        message: 'Password reset email has been sent to the address on file',
        note: 'HTS API integration pending (Phase 2)',
      }),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Password reset handler error:', errorMsg);

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
