import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aiConfig, aiUnavailableReason, isAiConfigured, AI_LIMITS } from '../src/config/ai';
import { loadEnv } from '../src/config/env';

/**
 * Configuration is where the assistant is switched on, and where the two ways
 * of getting that wrong live: running without it and not being told, and
 * running a scripted stand-in in front of real customers.
 */

const BASE = {
  MONGODB_URI: 'mongodb://localhost:27017/zycart-test',
  JWT_SECRET: 'x'.repeat(48),
} as const;

const env = (overrides: Record<string, string> = {}) => loadEnv({ ...BASE, ...overrides });

describe('AI configuration', () => {
  it('is unavailable, not fatal, when no key is set', () => {
    const parsed = env();

    assert.equal(aiConfig(parsed), null);
    assert.equal(isAiConfigured(parsed), false);
    assert.equal(aiUnavailableReason(parsed), 'AI_API_KEY is not set');
  });

  it('is unavailable when explicitly disabled, without asking for a key', () => {
    const parsed = env({ AI_ENABLED: 'false', AI_API_KEY: 'sk-test-'.padEnd(40, 'k') });

    assert.equal(aiConfig(parsed), null);
    assert.equal(aiUnavailableReason(parsed), 'AI_ENABLED is false');
  });

  it('resolves to the configured provider and model once a key is present', () => {
    const parsed = env({ AI_API_KEY: 'AIza-test-'.padEnd(40, 'k'), AI_MODEL: 'gemini-3.5-flash' });
    const config = aiConfig(parsed);

    assert.equal(config?.provider, 'gemini');
    assert.equal(config?.model, 'gemini-3.5-flash');
    assert.equal(config?.timeoutMs, 30_000);
  });

  it('refuses to boot with the mock provider in production', () => {
    assert.throws(
      () =>
        loadEnv({
          ...BASE,
          NODE_ENV: 'production',
          AI_PROVIDER: 'mock',
          // Razorpay must be whole or absent; absent is fine for this case.
        }),
      /AI_PROVIDER/,
    );
  });

  it('allows the mock provider outside production, with no key', () => {
    const parsed = env({ AI_PROVIDER: 'mock' });

    assert.equal(aiConfig(parsed)?.provider, 'mock');
    assert.equal(aiConfig(parsed)?.apiKey, '');
  });

  it('rejects a key too short to be real rather than sending it', () => {
    assert.throws(() => env({ AI_API_KEY: 'short' }), /AI_API_KEY/);
  });

  it('treats a blank key as unset rather than as an empty credential', () => {
    assert.equal(aiConfig(env({ AI_API_KEY: '   ' })), null);
  });

  it('never puts the key in the operator-facing reason', () => {
    const key = 'sk-ant-'.padEnd(40, 'k');
    const reason = aiUnavailableReason(env({ AI_ENABLED: 'false', AI_API_KEY: key }));

    assert.ok(reason);
    assert.ok(!reason.includes(key));
  });

  it('caps every axis along which one request could run away', () => {
    assert.ok(AI_LIMITS.maxToolCalls > 0 && AI_LIMITS.maxToolCalls <= 20);
    assert.ok(AI_LIMITS.maxToolRounds > 0 && AI_LIMITS.maxToolRounds <= 10);
    assert.ok(AI_LIMITS.maxSearchLimit <= 10, 'a search must not flood the context');
    assert.ok(AI_LIMITS.maxMessages <= 20);
    assert.ok(AI_LIMITS.requestDeadlineMs <= 120_000);
  });
});
