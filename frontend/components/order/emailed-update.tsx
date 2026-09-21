import { Mail } from 'lucide-react';
import { formatDate } from '@/lib/format';

/**
 * "We emailed you an update."
 *
 * ## The one rule this component exists to enforce
 *
 * It renders **only** when the server has a successful delivery to point at.
 * `lastUpdateEmailedAt` is set from a delivery record whose status is SENT,
 * which means the mail provider accepted the message. Null — nothing worth
 * emailing yet, a message still waiting, or one that failed — renders nothing
 * at all.
 *
 * That is the whole point. A page that said "we've emailed you" because an
 * order happened to be shipped would be making a promise the store might have
 * failed to keep, and the customer would spend their afternoon searching an
 * inbox for a message that never left.
 *
 * ## Why it does not say "delivered"
 *
 * Because ZyCart does not know. There are no bounce reports and no read
 * receipts, so the honest verb is "emailed", and the line about the spam folder
 * is there precisely because acceptance by a provider is not arrival in an
 * inbox.
 */
export function EmailedUpdate({ at }: { at: string | null }) {
  if (!at) return null;

  return (
    <p className="text-caption mt-4 flex items-start gap-2 text-muted-foreground">
      <Mail className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span className="text-pretty">
        We emailed you an update on {formatDate(at)}. If you cannot find it, check your spam
        folder.
      </span>
    </p>
  );
}
