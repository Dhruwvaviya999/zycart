import { emailConfig, type EmailConfig } from '../../config/notifications';
import type { Env } from '../../config/env';
import { createMockProvider } from './mock.provider';
import { createSmtpProvider } from './smtp.provider';
import type { EmailProvider } from './provider';
import { logger, serializeError } from '../../utils/logger';

/**
 * Builds the configured transport, once per process.
 *
 * Lives here rather than beside the interface so `provider.ts` — which the
 * notification service and the templates import — stays a file of types with no
 * mail library behind it, and so there is no cycle between the interface and
 * the SDK implementing it. It is the same arrangement the AI provider has, for
 * the same reason.
 */
function build(config: EmailConfig): EmailProvider {
  switch (config.provider) {
    case 'mock':
      return createMockProvider(config);
    case 'smtp':
      return createSmtpProvider(config);
  }
}

/**
 * Memoised, because an SMTP transport holds configuration and DNS state worth
 * keeping and a new one per message would re-resolve the host every time. Keyed
 * on the provider and sender so a test that swaps configuration gets a
 * different transport rather than the last one.
 */
let cached: { key: string; provider: EmailProvider } | null = null;

const keyFor = (config: EmailConfig): string =>
  `${config.provider}:${config.fromAddress}:${config.smtp?.host ?? ''}:${String(config.smtp?.port ?? '')}`;

export function getEmailProvider(env: Env): EmailProvider {
  const config = emailConfig(env);
  const key = keyFor(config);

  if (cached?.key === key) return cached.provider;

  /**
   * A failed construction is deliberately not cached, and deliberately not
   * swallowed. Unlike the assistant — which can be unavailable while the store
   * keeps trading — a transport that cannot be built means every message from
   * here on is undeliverable, and the delivery attempt that triggered this must
   * record that as the failure it is rather than as a silent no-op.
   */
  try {
    const provider = build(config);
    cached = { key, provider };
    return provider;
  } catch (error) {
    cached = null;
    // The configuration object is never logged: it holds the SMTP password.
    // Only the provider's name, and the error reduced to four named fields.
    logger.error('notification_provider_failed', {
      provider: config.provider,
      error: serializeError(error, { stack: true }),
    });
    throw error;
  }
}

/** Test seam: forget the memoised transport between cases. */
export function resetEmailProvider(): void {
  cached = null;
}
