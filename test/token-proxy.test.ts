/**
 * OpenClaw Agents — Token Proxy Validation Tests
 *
 * These tests verify that the token proxy (docker/token-proxy/proxy.py) contains
 * the correct structural patterns for API metering, caching, and cost logging.
 * They do NOT execute the proxy; instead they parse the source to confirm
 * critical sections are present.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');

function readScript(path: string): string {
  return readFileSync(join(ROOT, path), 'utf-8');
}

// ---------------------------------------------------------------------------
// Token Proxy (docker/token-proxy/proxy.py)
// ---------------------------------------------------------------------------
describe('Token Proxy (proxy.py)', () => {
  let script: string;

  beforeAll(() => {
    script = readScript('docker/token-proxy/proxy.py');
  });

  test('proxy.py exists and is not empty', () => {
    expect(existsSync(join(ROOT, 'docker/token-proxy/proxy.py'))).toBe(true);
    expect(script.length).toBeGreaterThan(100);
  });

  test('contains aiohttp import', () => {
    expect(script).toContain('from aiohttp import');
  });

  test('contains /health endpoint handler', () => {
    expect(script).toContain('handle_health');
    expect(script).toContain('/health');
  });

  test('contains agent name extraction regex (You are **...)', () => {
    expect(script).toContain('_extract_agent_name');
    expect(script).toContain('You are \\*\\*');
  });

  test('contains cache_control injection logic', () => {
    expect(script).toContain('_inject_cache_control');
    expect(script).toContain('cache_control');
    expect(script).toContain('ephemeral');
  });

  test('contains cost calculation constants (per-Mtok prices)', () => {
    // Opus 4-6 pricing: $15/Mtok input, $75/Mtok output, $18.75/Mtok cache write, $1.50/Mtok cache read
    expect(script).toContain('15.0 / 1_000_000');
    expect(script).toContain('75.0 / 1_000_000');
    expect(script).toContain('18.75 / 1_000_000');
    expect(script).toContain('1.50 / 1_000_000');
  });

  test('contains JSONL log writing', () => {
    expect(script).toContain('_write_log');
    expect(script).toContain('json.dumps');
    expect(script).toContain('.jsonl');
  });

  test('contains all required log fields: ts, agent, model, input_tokens, output_tokens, cost_usd', () => {
    // These fields appear in _build_log_record
    expect(script).toContain('"ts"');
    expect(script).toContain('"agent"');
    expect(script).toContain('"model"');
    expect(script).toContain('"input_tokens"');
    expect(script).toContain('"output_tokens"');
    expect(script).toContain('"cost_usd"');
  });
});

// ---------------------------------------------------------------------------
// Token Proxy Dockerfile
// ---------------------------------------------------------------------------
describe('Token Proxy Dockerfile', () => {
  let dockerfile: string;

  beforeAll(() => {
    dockerfile = readScript('docker/token-proxy/Dockerfile');
  });

  test('Dockerfile exists with python:3.12-slim base', () => {
    expect(existsSync(join(ROOT, 'docker/token-proxy/Dockerfile'))).toBe(true);
    expect(dockerfile).toContain('python:3.12-slim');
  });

  test('Dockerfile installs aiohttp', () => {
    expect(dockerfile).toContain('aiohttp');
  });

  test('Dockerfile exposes 8090', () => {
    expect(dockerfile).toContain('EXPOSE 8090');
  });
});
