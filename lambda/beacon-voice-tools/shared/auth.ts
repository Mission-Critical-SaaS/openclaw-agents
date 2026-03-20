/**
 * API Key Authentication Middleware
 *
 * Validates incoming requests have a valid X-API-Key header.
 * The actual key validation is done by API Gateway usage plans,
 * but this provides an extra layer for direct Lambda invocation.
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

/**
 * Custom error class for authentication failures.
 * Handlers can catch this specifically and return 400 status.
 */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}

/**
 * Validate API key from request headers.
 *
 * @param event The Lambda proxy event
 * @throws AuthError if API key is missing or invalid
 */
export function validateApiKey(event: APIGatewayProxyEvent): void {
  // API Gateway usage plan auth is the primary defense.
  // This is a secondary check for direct invocations.
  const apiKey = event.headers?.['x-api-key'] || event.headers?.['X-API-Key'];

  if (!apiKey) {
    throw new AuthError('Missing API key');
  }

  // In production, validate against a whitelist or Secrets Manager.
  // For now, we rely on API Gateway's usage plan enforcement.
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    throw new AuthError('Invalid API key format');
  }
}

/**
 * Extract the caller's phone number from the request headers.
 *
 * The caller_id is passed by ElevenLabs in the x-caller-id header.
 * Must be in E.164 format (e.g., "+12025551234" or "12025551234").
 *
 * @param event The Lambda proxy event
 * @returns The caller's phone number (e.g., "+12025551234")
 * @throws AuthError if caller_id is not present or invalid format
 */
export function getCallerId(event: APIGatewayProxyEvent): string {
  const callerId = event.headers?.['x-caller-id'] || event.headers?.['X-Caller-Id'];

  if (!callerId) {
    throw new AuthError('Missing caller ID (x-caller-id header)');
  }

  // Validate E.164 phone format: optional +, then 1-9, then 1-14 more digits
  if (!/^\+?[1-9]\d{1,14}$/.test(callerId)) {
    throw new AuthError('Invalid caller ID format (must be valid phone number in E.164 format)');
  }

  return callerId;
}
