/**
 * Beacon Voice Tools — Integration Status Handler
 *
 * Checks integration sync status for a customer account.
 * Caller: ElevenLabs voice agent (internal use only)
 *
 * Implementation:
 * ────────────────
 * Connects to HTS API to check:
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
 * Security: Agent uses integration status to guide troubleshooting but
 * NEVER shares raw integration data with the caller ("Act, Don't Reveal").
 * When HTS API is not configured, returns found:false gracefully.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { validateApiKey, getCallerId, AuthError } from './shared/auth';
import { getCredential } from './shared/secrets';
import { logSuccess, logError } from './shared/audit';

interface IntegrationInfo {
  name: string;
  status: string;
  last_sync?: string;
  error_count?: number;
  warnings?: string[];
}

interface IntegrationStatusResult {
  found: boolean;
  account_id?: string;
  integrations?: IntegrationInfo[];
  note?: string;
}

/**
 * Check integration status via HTS API.
 * Returns null if HTS API is not configured or request fails.
 */
async function checkIntegrationsViaHtsApi(
  accountId: string,
  requestId?: string
): Promise<IntegrationStatusResult | null> {
  let baseUrl: string;
  let apiKey: string;

  try {
    baseUrl = await getCredential('beacon/hts', 'api_base_url');
    apiKey = await getCredential('beacon/hts', 'api_key');
  } catch {
    // HTS API credentials not configured — graceful degradation
    return null;
  }

  const url = `${baseUrl}/api/v1/accounts/${encodeURIComponent(accountId)}/integrations`;

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
        return { found: false, account_id: accountId };
      }
      const errorText = await response.text();
      throw new Error(`HTS API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as Record<string, unknown>;

    return {
      found: true,
      account_id: accountId,
      integrations: (data.integrations as IntegrationInfo[] | undefined) || [],
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[${requestId}] HTS API timeout during integration status check`);
      return null;
    }
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[${requestId}] HTS API integration status failed: ${msg}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

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
    const accountId = event.pathParameters?.id;

    if (!accountId || accountId === 'unknown') {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Account ID is required in the path (/accounts/{id}/integrations)',
          request_id: requestId,
        }),
      };
    }

    // ──────────────────────────────────────────────
    // Attempt HTS API integration status check
    // ──────────────────────────────────────────────
    const htsResult = await checkIntegrationsViaHtsApi(accountId, requestId);

    if (htsResult && htsResult.found) {
      logSuccess(callerId, 'integration_status',
        `[${requestId}] Integration status retrieved for account: ${accountId}`);

      return {
        statusCode: 200,
        body: JSON.stringify({
          found: true,
          account_id: htsResult.account_id,
          integrations: htsResult.integrations,
          request_id: requestId,
        }),
      };
    }

    // ──────────────────────────────────────────────
    // No integrations found or HTS API not available
    // ──────────────────────────────────────────────
    logSuccess(callerId, 'integration_status',
      `[${requestId}] No integration data for account: ${accountId}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        found: false,
        account_id: accountId,
        note: 'Phase 2: HTS API integration pending — integration status checks will be available when connected',
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
    console.error(`[${requestId}] Integration status handler error:`, errorMsg);

    try {
      const callerId = getCallerId(event);
      logError(callerId, 'integration_status', `[${requestId}] ${errorMsg}`);
    } catch {
      console.error(`[${requestId}] Could not log error to audit trail`);
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error', request_id: requestId }),
    };
  }
}
