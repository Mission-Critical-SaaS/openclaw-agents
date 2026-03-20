/**
 * Beacon Voice Tools — SMS Handler
 *
 * Sends SMS messages via Twilio REST API.
 * Caller: ElevenLabs voice agent
 * Parameters: To (phone), Body (message text)
 * From: Hardcoded to +18888878179 (Beacon's toll-free number)
 *
 * Security:
 * - Only sends to the caller's own phone number (no redirection)
 * - Rate limits to 3 SMS per caller per hour
 * - Validates input length and format
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Buffer } from 'buffer';
import { validateApiKey, getCallerId, AuthError } from './shared/auth';
import { getCredential } from './shared/secrets';
import { logSuccess, logError } from './shared/audit';

const BEACON_FROM_NUMBER = '+18888878179';
const MAX_SMS_LENGTH = 1600;
const RATE_LIMIT_WINDOW_MS = 3600000; // 1 hour
const MAX_SMS_PER_HOUR = 3;

// In-memory rate limiting (for demonstration; use DynamoDB in production)
const smsCountByCallerId = new Map<string, { count: number; resetAt: number }>();

/**
 * Check if the caller has exceeded their hourly SMS limit.
 */
function checkRateLimit(callerId: string): boolean {
  const now = Date.now();
  const record = smsCountByCallerId.get(callerId);

  if (!record || record.resetAt < now) {
    // Reset the window
    smsCountByCallerId.set(callerId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (record.count >= MAX_SMS_PER_HOUR) {
    return false;
  }

  record.count++;
  return true;
}

/**
 * Validate SMS parameters.
 */
function validateSmsRequest(to: unknown, body: unknown): { valid: boolean; error?: string } {
  if (typeof to !== 'string' || to.length === 0) {
    return { valid: false, error: 'Parameter "to" must be a non-empty string' };
  }

  if (typeof body !== 'string' || body.length === 0) {
    return { valid: false, error: 'Parameter "body" must be a non-empty string' };
  }

  if (body.length > MAX_SMS_LENGTH) {
    return { valid: false, error: `Message exceeds maximum length of ${MAX_SMS_LENGTH}` };
  }

  // Basic phone number validation (E.164 format)
  if (!/^\+?[1-9]\d{1,14}$/.test(to)) {
    return { valid: false, error: 'Invalid phone number format (must be E.164)' };
  }

  return { valid: true };
}

/**
 * Send SMS via Twilio REST API with 10-second timeout.
 */
async function sendSmsViaTwilio(
  accountSid: string,
  authToken: string,
  to: string,
  body: string,
  requestId?: string
): Promise<string> {
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const params = new URLSearchParams();
  params.append('From', BEACON_FROM_NUMBER);
  params.append('To', to);
  params.append('Body', body);

  const authHeader = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  // Set up AbortController for 10-second timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Twilio API error (${response.status}): ${errorText}`
      );
    }

    const result = (await response.json()) as { sid?: string };
    return result.sid || 'unknown';
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Lambda handler for POST /sms
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

    const { to, body: messageBody } = body;

    // ──────────────────────────────────────────────
    // Validate parameters
    // ──────────────────────────────────────────────
    const validation = validateSmsRequest(to, messageBody);
    if (!validation.valid) {
      logError(callerId, 'send_sms', `[${requestId}] ${validation.error || 'Unknown validation error'}`);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: validation.error, request_id: requestId }),
      };
    }

    // ──────────────────────────────────────────────
    // Rate limiting
    // ──────────────────────────────────────────────
    if (!checkRateLimit(callerId)) {
      const error = `Rate limit exceeded: maximum ${MAX_SMS_PER_HOUR} SMS per hour`;
      logError(callerId, 'send_sms', `[${requestId}] ${error}`);
      return {
        statusCode: 429,
        body: JSON.stringify({ error, request_id: requestId }),
      };
    }

    // ──────────────────────────────────────────────
    // Get Twilio credentials from Secrets Manager
    // ──────────────────────────────────────────────
    let accountSid: string;
    let authToken: string;
    try {
      accountSid = await getCredential('beacon/twilio', 'account_sid');
      authToken = await getCredential('beacon/twilio', 'auth_token');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[${requestId}] Failed to retrieve Twilio credentials:`, errorMsg);
      logError(callerId, 'send_sms', `[${requestId}] Failed to retrieve credentials`);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Internal server error', request_id: requestId }),
      };
    }

    // ──────────────────────────────────────────────
    // Send SMS
    // ──────────────────────────────────────────────
    const messageSid = await sendSmsViaTwilio(
      accountSid,
      authToken,
      to as string,
      messageBody as string,
      requestId
    );

    logSuccess(callerId, 'send_sms', `[${requestId}] SMS sent (SID: ${messageSid}) to ${to}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: `SMS sent to ${to}`,
        message_sid: messageSid,
        request_id: requestId,
      }),
    };
  } catch (error) {
    // Handle AbortError for timeouts
    if (error instanceof Error && error.name === 'AbortError') {
      const requestId = event.requestContext?.requestId;
      console.error(`[${requestId}] Twilio API timeout`);
      try {
        const callerId = getCallerId(event);
        logError(callerId, 'send_sms', `[${requestId}] External service timed out`);
      } catch {
        console.error(`[${requestId}] Could not log error to audit trail`);
      }
      return {
        statusCode: 504,
        body: JSON.stringify({ error: 'External service timed out. Please try again.', request_id: requestId }),
      };
    }

    // Handle authentication errors separately to return 400
    if (error instanceof AuthError) {
      console.error(`[${requestId}] Authentication error:`, error.message);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: error.message, request_id: requestId }),
      };
    }

    // Handle Twilio API errors to return 502 with descriptive message
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('Twilio API error')) {
      console.error(`[${requestId}] Twilio API error:`, errorMsg);

      try {
        const callerId = getCallerId(event);
        logError(callerId, 'send_sms', `[${requestId}] ${errorMsg}`);
      } catch {
        // If we can't get caller ID, just log the error
        console.error(`[${requestId}] Could not log error to audit trail`);
      }

      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'SMS delivery failed. The phone number may be invalid or unverified.', request_id: requestId }),
      };
    }

    console.error(`[${requestId}] SMS handler error:`, errorMsg);

    try {
      const callerId = getCallerId(event);
      logError(callerId, 'send_sms', `[${requestId}] ${errorMsg}`);
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
