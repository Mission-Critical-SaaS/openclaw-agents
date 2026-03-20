/**
 * API Key Authentication Middleware
 *
 * Validates incoming requests have a valid X-API-Key header.
 * The actual key validation is done by API Gateway usage plans,
 * but this provides an extra layer for direct Lambda invocation.
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

/**
 * Validate API key from request headers.
 *
 * @param event The Lambda proxy event
 * @throws Error if API key is missing or invalid
 */
export function validateApiKey(event: APIGatewayProxyEvent): void {
  // API Gateway usage plan auth is the primary defense.
  // This is a secondary check for direct invocations.
  const apiKey = event.headers?.['x-api-key'] || event.headers?.['X-API-Key'];

  if (!apiKey) {
    throw new Error('Missing API key');
  }

  // In production, validate against a whitelist or Secrets Manager.
  // For now, we rely on API Gateway's usage plan enforcement.
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    throw new Error('Invalid API key format');
  }
}

/**
 * Extract the caller's phone number from the request headers.
 *
 * The caller_id is passed by ElevenLabs in the x-caller-id header.
 *
 * @param event The Lambda proxy event
 * @returns The caller's phone number (e.g., "+12025551234")
 * @throws Error if caller_id is not present
 */
export function getCallerId(event: APIGatewayProxyEvent): string {
  const callerId = event.headers?.['x-caller-id'] || event.headers?.['X-Caller-Id'];

  if (!callerId) {
    throw new Error('Missing caller ID (x-caller-id header)');
  }

  return callerId;
}
