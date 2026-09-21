import type { EmailProviderName } from '../../config/notifications';

/**
 * The boundary between ZyCart and whatever actually carries a message.
 *
 * Everything above this line — which events communicate, who receives them,
 * what the message says, when it may be retried — is ZyCart's. Everything below
 * it is one transport's library. Nothing in `notification.service.ts`, the
 * templates, the shipment service or the frontend imports a mail SDK, so
 * replacing SMTP with a vendor API is a new file in this folder rather than a
 * change to the business.
 *
 * The interface is deliberately one-shot: `send` performs exactly one attempt
 * and reports what happened. Retrying, backing off, counting attempts and
 * deciding when to give up belong to the notification service, because they are
 * decisions about ZyCart's obligations to a customer rather than about a
 * protocol — and because a transport that retried on its own would make the
 * attempt count on a delivery record a lie.
 */

/**
 * One message, fully rendered.
 *
 * Deliberately not a template name plus data. By the time a message reaches a
 * provider there is nothing left to decide: the recipient is resolved, the
 * subject is sanitised, both bodies exist. A provider that could still choose
 * what to say would be a second place where "what does ZyCart tell customers?"
 * is answered.
 */
export interface EmailMessage {
  /** The resolved account address. Never anything a client supplied. */
  to: string;
  /** The recipient's display name, or empty. */
  toName: string;
  subject: string;
  /** The plain-text alternative. Every message has one; see §99 of the brief. */
  text: string;
  html: string;
  /**
   * Correlation only: the delivery record's id and the event it came from.
   *
   * Passed so a provider can stamp it on its own logs, and so a captured mock
   * message can be matched back to the row that produced it. It carries no
   * personal data and no template payload — a provider has no business with
   * either.
   */
  meta: { notificationId: string; event: string; template: string };
}

export interface EmailSendResult {
  /**
   * The provider's own identifier for the message, where it has one.
   *
   * Null is a legitimate answer, not a failure: not every transport returns
   * one, and inventing an id so the field is always populated would make it
   * useless for the only thing it is for — quoting to a provider's support desk.
   */
  messageId: string | null;
}

export interface EmailProvider {
  readonly name: EmailProviderName;
  /**
   * Attempts delivery exactly once.
   *
   * Resolves when the provider has accepted the message, and throws
   * `EmailDeliveryError` when it has not. It must not swallow a failure and
   * resolve anyway — a delivery marked SENT for a message the transport
   * refused is the single most damaging thing this subsystem could record.
   */
  send(message: EmailMessage): Promise<EmailSendResult>;
}

/**
 * A send that did not happen, and whether trying again could help.
 *
 * `permanent` is the whole reason this class exists rather than a plain Error.
 * A rejected recipient and a refused TCP connection are both failures, and
 * treating them the same means either abandoning messages that would have gone
 * through on the next attempt, or re-sending to a dead address until the
 * provider starts rate-limiting the store.
 *
 * `reason` is written by the adapter for a person to read, and is the only part
 * that is ever persisted or shown. The underlying error is kept on `cause` for
 * the local log and goes no further: an SMTP error object can carry the command
 * that was in flight when it failed, and that command may be the one carrying
 * the password.
 */
export class EmailDeliveryError extends Error {
  constructor(
    public readonly reason: string,
    public readonly permanent: boolean,
    public override readonly cause?: unknown,
  ) {
    super(reason);
    this.name = 'EmailDeliveryError';
  }
}
