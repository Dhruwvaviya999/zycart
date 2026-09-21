/**
 * Only same-origin paths are ever honoured as a post-sign-in destination.
 *
 * `?redirect=` is attacker-controlled, so anything that could leave the site —
 * an absolute URL, or a protocol-relative `//evil.com` — is discarded in favour
 * of the account page.
 */
export function safeRedirect(value: string | string[] | undefined, fallback = '/account'): string {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (!candidate) return fallback;
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return fallback;

  return candidate;
}
