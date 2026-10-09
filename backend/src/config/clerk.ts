import { createClerkClient, type ClerkClient } from '@clerk/express';
import type { Env } from './env';

/** Not re-exported by `@clerk/express`; this is the session-token overload's. */
type AuthenticateRequestOptions = NonNullable<Parameters<ClerkClient['authenticateRequest']>[1]>;

/**
 * Clerk, as this process talks to it.
 *
 * Built from validated configuration rather than from `process.env`, which is
 * what the SDK would otherwise read behind our back — the same rule every
 * other integration here follows. One client per secret key, created on first
 * use: tests and scripts build their own `Env`, and a client cached for one
 * configuration must never answer for another.
 */
const clients = new Map<string, ClerkClient>();

export function clerkFor(env: Env): ClerkClient {
  let client = clients.get(env.CLERK_SECRET_KEY);

  if (!client) {
    client = createClerkClient({
      secretKey: env.CLERK_SECRET_KEY,
      publishableKey: env.CLERK_PUBLISHABLE_KEY,
      ...(env.CLERK_JWT_KEY ? { jwtKey: env.CLERK_JWT_KEY } : {}),
    });
    clients.set(env.CLERK_SECRET_KEY, client);
  }

  return client;
}

/**
 * How a session token is checked.
 *
 * `authorizedParties` pins the token's `azp` claim to the storefront's own
 * origin, so a token minted for some other site on the same Clerk instance —
 * or lifted from one — is not accepted here. It is the same origin CORS
 * admits, for the same reason.
 */
export function authenticateOptions(env: Env): AuthenticateRequestOptions {
  return {
    secretKey: env.CLERK_SECRET_KEY,
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
    authorizedParties: [new URL(env.CLIENT_URL).origin],
    ...(env.CLERK_JWT_KEY ? { jwtKey: env.CLERK_JWT_KEY } : {}),
  };
}
