import { sendMessage } from '@/services/api';

/** Which storefront form an address came from. A label, never free text. */
export type NewsletterSource = 'homepage' | 'footer' | 'account';

/**
 * Joins the list, pending confirmation. The answer is the same whatever the
 * address's history, so the form cannot reveal who is subscribed.
 */
export function subscribeToNewsletter(
  email: string,
  source: NewsletterSource = 'homepage',
): Promise<string> {
  return sendMessage('post', '/api/newsletter/subscribe', { email, source });
}

/** Redeems the link from the confirmation email. */
export function confirmNewsletter(token: string): Promise<string> {
  return sendMessage('post', '/api/newsletter/confirm', { token });
}

/** Leaves the list, from the signed link in a newsletter. */
export function unsubscribeFromNewsletter(id: string, signature: string): Promise<string> {
  return sendMessage('post', '/api/newsletter/unsubscribe', { id, s: signature });
}
