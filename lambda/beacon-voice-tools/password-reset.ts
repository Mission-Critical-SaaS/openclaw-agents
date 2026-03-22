/**
 * Beacon Voice Tools — Password Reset Handler
 *
 * Triggers a password reset flow for HourTimesheet accounts.
 * Caller: ElevenLabs voice agent
 *
 * Implementation:
 * ────────────────
 * Uses the discovered HTS password reset API:
 *   POST https://{subdomain}.hourtimesheet.com/account/send-recovery-link
 *   Body: email address as raw string
 *
 * Flow:
 * 1. Accept email + subdomain from request body (provided by caller or agent)
 * 2. If not provided, attempt account lookup via HTS API
 * 3. Call HTS password reset endpoint
 * 4. Always return success to caller ("Act, Don't Reveal" security model)
 *
 * Security: Agent tells caller "I've sent a reset link to the email on your
 * account" but NEVER reveals the actual email address.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { validateApiKey, getCallerId, AuthError } from './shared/auth';
import { getCredential } from './shared/secrets';
import { logSuccess, logError } from './shared/audit';

interface PasswordResetRequest {
  email?: string;
  subdomain?: string;
  account_id?: string;
}

/**
 * Attempt to resolve account details (email + subdomain) via HTS API.
 * Returns null if HTS API is not configured or lookup fails.
 */
async function resolveAccountDetails(
  callerId: string,
  requestId?: string
): Promise<{ email: string; subdomain: string } | null> {
  let baseUrl: string;
  let apiKey: string;

  try {
    baseUrl = await getCredential('beacon/hts', 'api_base_url');
    apiKey = await getCredential('beacon/hts', 'api_key');
  } catch {
    return null;
  }

  const url = `${baseUrl}/api/v1/accounts/lookup?phone=${encodeURIComponent(callerId)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as Record<string, unknown>;
    const email = data.email as string | undefined;
    const subdomain = data.subdomain as string | undefined;

    if (email && subdomain) {
      return { email, subdomain };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Send password reset request to HTS.
 * POST https://{subdomain}.hourtimesheet.com/account/send-recovery-link
 * Body: raw email string
 */
async function triggerHtsPasswordReset(
  subdomain: string,
  email: string,
  requestId?: string
): Promise<boolean> {
  const url = `https://${subdomain}.hourtimesheet.com/account/send-recovery-link`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: email,
      signal: controller.signal,
    });

    return response.ok;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[${requestId}] HTS password reset failed: ${msg}`);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Lambda handler for POST /password-reset
 *
 * Request body (all optional):
 * - email: The account email to send reset to
 * - subdomain: The HTS subdomain (e.g., "acme" for acme.hourtimesheet.com)
 * - account_id: Alternative to email/subdomain — resolved via HTS API
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
    let body: PasswordResetRequest;
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON in request body', request_id: requestId }),
      };
    }

    // ──────────────────────────────────────────────
    // Resolve email + subdomain
    // ──────────────────────────────────────────────
    let email = body.email;
    let subdomain = body.subdomain;
    let resetSent = false;

    // If email/subdomain not provided, try HTS API account lookup
    if (!email || !subdomain) {
      const resolved = await resolveAccountDetails(callerId, requestId);
      if (resolved) {
        email = email || resolved.email;
        subdomain = subdomain || resolved.subdomain;
      }
    }

    // Attempt the actual password reset if we have both pieces
    if (email && subdomain) {
      resetSent = await triggerHtsPasswordReset(subdomain, email, requestId);
    }

    // ──────────────────────────────────────────────
    // "Act, Don't Reveal" response
    // Always return success — prevents account enumeration.
    // The agent tells the caller: "I've sent a reset link
    // to the email on your account."
    // ──────────────────────────────────────────────
    logSuccess(callerId, 'trigger_password_reset',
      `[${requestId}] Password reset ${resetSent ? 'sent' : 'requested (pending HTS integration)'}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        status: 'reset_email_sent',
        message: 'A password reset link has been sent to the email address associated with your account.',
        note: 'Phase 2: Full automation via HTS API — currently returns success per "Act, Don\'t Reveal" security model',
        request_id: requestId,
      }),
    };
  } catch (error) {
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
      console.error(`[${requestId}] Could not log error to audit trail`);
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error', request_id: requestId }),
    };
  }
}
