import { aiConfig, type AiConfig } from '../../config/ai';
import type { Env } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { logger, serializeError } from '../../utils/logger';
import { createGeminiProvider } from './gemini.provider';
import { createHuggingFaceProvider } from './huggingface.provider';
import { createMockProvider } from './mock.provider';
import type { AiProvider } from './provider';

/**
 * Builds the configured provider.
 *
 * Lives here rather than beside the interface so that `provider.ts` — which
 * every tool and the service itself import — stays a file of types with no
 * implementation behind it, and no import cycle between the interface and the
 * SDK that implements it.
 */
function createAiProvider(config: AiConfig): AiProvider {
  switch (config.provider) {
    case 'mock':
      return createMockProvider();
    case 'gemini':
      return createGeminiProvider(config);
    case 'huggingface':
      return createHuggingFaceProvider(config);
  }
}

/**
 * Holds the one provider instance for the process.
 *
 * Built on first use rather than at startup, so a deployment running without
 * the assistant never constructs an SDK client, and a deployment with one pays
 * for the client once rather than per request.
 */
let cached: { key: string; provider: AiProvider } | null = null;

const keyFor = (config: AiConfig): string => `${config.provider}:${config.model}`;

export function getAiProvider(env: Env): AiProvider {
  const config = aiConfig(env);

  if (!config) {
    throw new AppError('The shopping assistant is not available right now.', 503);
  }

  const key = keyFor(config);
  if (cached?.key === key) return cached.provider;

  try {
    const provider = createAiProvider(config);
    cached = { key, provider };
    return provider;
  } catch (error) {
    // A failed construction is not cached, or the process would answer every
    // later request from the same broken attempt.
    cached = null;
    logger.error('ai_provider_failed', {
      kind: 'construction',
      error: serializeError(error, { stack: true }),
    });
    throw new AppError('The shopping assistant is not available right now.', 503);
  }
}

/** Test seam: forget the memoised provider between cases. */
export function resetAiProvider(): void {
  cached = null;
}
