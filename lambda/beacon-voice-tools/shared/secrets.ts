/**
 * Secrets Manager Client with Caching
 *
 * Provides a cached interface to AWS Secrets Manager for reading
 * Twilio and Zendesk credentials at runtime.
 */

import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

interface CachedSecret {
  value: Record<string, string>;
  expiresAt: number;
}

const cache = new Map<string, CachedSecret>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute

/**
 * Get a secret from Secrets Manager, with caching.
 *
 * @param secretId The secret ID (e.g., "beacon/twilio")
 * @returns The secret value as a JSON object
 * @throws Error if the secret cannot be retrieved
 */
export async function getSecret(secretId: string): Promise<Record<string, string>> {
  const now = Date.now();
  const cached = cache.get(secretId);

  // Return cached value if still valid
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const client = new SecretsManagerClient({ region: process.env.AWS_REGION });

  try {
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: secretId })
    );

    if (!response.SecretString) {
      throw new Error(`Secret ${secretId} has no SecretString`);
    }

    const value = JSON.parse(response.SecretString) as Record<string, string>;

    // Cache the value
    cache.set(secretId, {
      value,
      expiresAt: now + CACHE_TTL_MS,
    });

    return value;
  } catch (error) {
    const err = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to retrieve secret ${secretId}: ${err}`);
  }
}

/**
 * Get a specific credential from a secret.
 *
 * @param secretId The secret ID
 * @param key The key within the secret
 * @returns The credential value
 * @throws Error if the secret or key is not found
 */
export async function getCredential(secretId: string, key: string): Promise<string> {
  const secret = await getSecret(secretId);

  if (!secret[key]) {
    throw new Error(`Credential ${key} not found in secret ${secretId}`);
  }

  return secret[key];
}
