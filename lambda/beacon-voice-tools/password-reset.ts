/**
 * Beacon Voice Tools — Password Reset Handler
 *
 * Triggers a password reset flow.
 * Caller: ElevenLabs voice agent
 *
 * DISCOVERED HTS PASSWORD RESET API (Phase 2 Reference):
 * ────────────────────────────────────────────────────────
 * Endpoint: POST https://{subdomain}.hourtimesheet.com/account/send-recovery-link
 * Request body: just the email string (raw string in body, not JSON object)
 * Response: Sends recovery email to the provided address
 *
 * Current Challenge: We cannot determine the caller's HTS subdomain from
 * their phone number alone. Phase 2 implementation should:
 * 1. Add account lookup capability (see account-lookup.ts)
 * 2. Resolve phone → account details (including subdomain)
 * 3. Then call the HTS API with the discovered subdomain and caller's email
 *
 * Current Status: Returns 501 Not Implemented with honest message
 * asking for email address and company account name.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { validateApiKey, getCallerId, AuthError } from './shared/auth';
import { logSuccess, logError } from './shared/audit';

/**
 * Lambda handler for POST /password-reset
 *
 * Parameters (from request body):
 * - account_id (optional): The account to reset. If not provided, uses caller lookup.
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
    // Parse request body
    // ──────────────────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON in request body', request_id: requestId }),
      };
    }

    logSuccess(callerId, 'trigger_password_reset', `[${requestId}] Not yet implemented — requires email and account lookup`);

    // ──────────────────────────────────────────────
    // Honest response: We can't reset passwords yet
    // ──────────────────────────────────────────────
    // Return 501 (Not Implemented) with an honest message
    // about what's needed for Phase 2.
    return {
      statusCode: 501,
      body: JSON.stringify({
        available: false,
        message: 'Password reset requires your email address and company account name. I can create a support ticket for our team to help you reset your password.',
        phase2_note: 'Will be fully automated when account lookup is implemented',
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
    console.error(`[${requestId}] Password reset handler error:`, errorMsg);

    try {
      const callerId = getCallerId(event);
      logError(callerId, 'trigger_password_reset', `[${requestId}] ${errorMsg}`);
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
