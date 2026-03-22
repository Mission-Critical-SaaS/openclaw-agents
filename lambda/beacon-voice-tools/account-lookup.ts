/**
 * Beacon Voice Tools — Account Lookup Handler
 *
 * Looks up an account by phone number for internal agent context.
 * Caller: ElevenLabs voice agent (internal use only)
 *
 * Implementation:
 * ────────────────
 * Connects to HTS API to resolve:
 * - Phone number → Account ID
 * - Account ID → Company/subdomain
 * - Account ID → Subscription status
 *
 * This data enables:
 * - Password reset (via discovered subdomain)
 * - Integration status checks
 * - Troubleshooting context for internal agents
 *
 * Security: Results are NEVER shared with the caller ("Act, Don't Reveal").
 * When HTS API is not configured, returns found:false gracefully.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { validateApiKey, getCallerId, AuthError } from './shared/auth';
import { getCredential } from './shared/secrets';
import { logSuccess, logError } from './shared/audit';

interface AccountLookupResult {
  found: boolean;
  account_id?: string;
  account_name?: string;
  subdomain?: string;
  subscription_status?: string;
  has_recent_tickets?: boolean;
  note?: string;
  request_id?: string;
}

/**
 * Look up an account by phone number via HTS API.
 * Returns null if HTS API is not configured or lookup fails.
 */
async function lookupAccountViaHtsApi(
  phone: string,
  requestId?: string
): Promise<AccountLookupResult | null> {
  let baseUrl: string;
  let apiKey: string;

  try {
    baseUrl = await getCredential('beacon/hts', 'api_base_url');
    apiKey = await getCredential('beacon/hts', 'api_key');
  } catch {
    // HTS API credentials not configured — graceful degradation
    return null;
  }

  const url = `${baseUrl}/api/v1/accounts/lookup?phone=${encodeURIComponent(phone)}`;

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
      if (response.status === 404) {
        return { found: false };
      }
      const errorText = await response.text();
      throw new Error(`HTS API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as Record<string, unknown>;

    return {
      found: true,
      account_id: data.account_id as string | undefined,
      account_name: data.account_name as string | undefined,
      subdomain: data.subdomain as string | undefined,
      subscription_status: data.subscription_status as string | undefined,
      has_recent_tickets: data.has_recent_tickets as boolean | undefined,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[${requestId}] HTS API timeout during account lookup`);
      return null;
    }
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[${requestId}] HTS API lookup failed: ${msg}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

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

    // ──────────────────────────────────────────────
    // Attempt HTS API lookup
    // ──────────────────────────────────────────────
    const htsResult = await lookupAccountViaHtsApi(phone, requestId);

    if (htsResult && htsResult.found) {
      logSuccess(callerId, 'account_lookup', `[${requestId}] Account found for phone: ${phone}`);

      return {
        statusCode: 200,
        body: JSON.stringify({
          found: true,
          account_id: htsResult.account_id,
          account_name: htsResult.account_name,
          subdomain: htsResult.subdomain,
          subscription_status: htsResult.subscription_status,
          has_recent_tickets: htsResult.has_recent_tickets,
          request_id: requestId,
        }),
      };
    }

    // ──────────────────────────────────────────────
    // No account found or HTS API not available
    // ──────────────────────────────────────────────
    logSuccess(callerId, 'account_lookup', `[${requestId}] No account found for phone: ${phone}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        found: false,
        note: 'Phase 2: HTS API integration pending — account lookup will resolve phone to account details when available',
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
    console.error(`[${requestId}] Account lookup handler error:`, errorMsg);

    try {
      const callerId = getCallerId(event);
      logError(callerId, 'account_lookup', `[${requestId}] ${errorMsg}`);
    } catch {
      console.error(`[${requestId}] Could not log error to audit trail`);
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error', request_id: requestId }),
    };
  }
}
