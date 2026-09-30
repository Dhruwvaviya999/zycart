import type { Env } from './env';

/**
 * Virtual try-on configuration: which provider and model, which credential,
 * and how many tries an account gets.
 *
 * Decided once, on the server, from validated environment variables — the
 * same reasoning that put `aiConfig` and `emailConfig` in modules of their
 * own. Nothing here reaches the browser; the storefront learns only whether
 * try-on is available, who processes the photo, and how many tries the
 * signed-in customer has left.
 */

export type TryOnProvider = 'gemini' | 'cloudflare';

/**
 * Each provider's model when `TRY_ON_MODEL` is not set.
 *
 * FLUX.2 [klein] 4B is Cloudflare's default because it is the multi-reference
 * image model that costs least from the free daily allowance — about a
 * thousandth of a dollar a preview — so the free plan covers the most tries.
 */
export const DEFAULT_TRY_ON_MODEL: Record<TryOnProvider, string> = {
  gemini: 'gemini-3.1-flash-image',
  cloudflare: '@cf/black-forest-labs/flux-2-klein-4b',
};

/**
 * Who the customer's photo is sent to, in the words the consent box uses.
 *
 * Named here, next to the choice of provider, so the sentence a customer
 * agrees to cannot drift from where their photo actually goes.
 */
export const TRY_ON_PROCESSOR: Record<TryOnProvider, string> = {
  gemini: 'Google’s Gemini AI',
  cloudflare: 'Cloudflare Workers AI',
};

interface TryOnSettings {
  model: string;
  /** The Gemini API key, or the Cloudflare API token. */
  apiKey: string;
  /** Tries per account per day, in the store's timezone. */
  dailyLimit: number;
  timeoutMs: number;
}

export type TryOnConfig =
  | (TryOnSettings & { provider: 'gemini' })
  | (TryOnSettings & { provider: 'cloudflare'; accountId: string });

/**
 * The try-on configuration, or null when this deployment offers none.
 *
 * For Gemini the key is `TRY_ON_API_KEY` when set, and otherwise the
 * assistant's own key — but only when the assistant runs on Gemini. An
 * Anthropic or Hugging Face key would be refused by Google, and passing it
 * along would turn a configuration gap into a failure every customer meets at
 * the moment they press the button. Cloudflare needs both its account id and
 * its token; one without the other is no configuration at all.
 *
 * Null is an ordinary state, exactly as it is for the assistant: the product
 * page simply shows no "Try it on" button.
 */
export function tryOnConfig(env: Env): TryOnConfig | null {
  if (!env.TRY_ON_ENABLED) return null;

  const settings = {
    model: env.TRY_ON_MODEL ?? DEFAULT_TRY_ON_MODEL[env.TRY_ON_PROVIDER],
    dailyLimit: env.TRY_ON_DAILY_LIMIT,
    timeoutMs: env.TRY_ON_TIMEOUT_MS,
  };

  if (env.TRY_ON_PROVIDER === 'cloudflare') {
    if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) return null;

    return {
      provider: 'cloudflare',
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      apiKey: env.CLOUDFLARE_API_TOKEN,
      ...settings,
    };
  }

  const apiKey = env.TRY_ON_API_KEY ?? (env.AI_PROVIDER === 'gemini' ? env.AI_API_KEY : undefined);
  if (!apiKey) return null;

  return { provider: 'gemini', apiKey, ...settings };
}

export const isTryOnConfigured = (env: Env): boolean => tryOnConfig(env) !== null;

/** The variable an operator sets to make try-on available, for readiness findings. */
export const tryOnCredentialKey = (env: Env): string =>
  env.TRY_ON_PROVIDER === 'cloudflare' ? 'CLOUDFLARE_API_TOKEN' : 'TRY_ON_API_KEY';

/** Why try-on is unavailable, for an operator. Never shown to a customer. */
export function tryOnUnavailableReason(env: Env): string | null {
  if (!env.TRY_ON_ENABLED) return 'TRY_ON_ENABLED is false';

  if (env.TRY_ON_PROVIDER === 'cloudflare') {
    return env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN
      ? null
      : 'no Cloudflare credentials: set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN';
  }

  if (!env.TRY_ON_API_KEY && !(env.AI_PROVIDER === 'gemini' && env.AI_API_KEY)) {
    return 'no Gemini key: set TRY_ON_API_KEY, or run the assistant on Gemini with AI_API_KEY';
  }

  return null;
}
