import { z } from 'zod';
import type { EmailBrand, EmailContent, EmailLineItem } from '../render';

/**
 * The pieces every transactional template needs, defined once.
 *
 * ## Why the data contracts are Zod schemas rather than interfaces
 *
 * A delivery record stores the data its template was given, so that retrying it
 * next March produces the message that was intended today rather than whatever
 * the code says by then. That snapshot comes back out of MongoDB as `unknown` —
 * it is input, and it is input that arrives months after anything validated it.
 * A TypeScript interface would assert its shape and check nothing.
 *
 * So each template owns a schema, the schema is the contract, and
 * `OrderShippedEmailData` and friends are *inferred from it*. A payload that no
 * longer parses produces a clear permanent failure on the notifications screen
 * instead of an email full of `undefined`.
 */

/** One summarised line of an order or a return. */
export const emailLineSchema = z.object({
  name: z.string(),
  /** "Size 9 · Black", or empty when the product has no variant axes. */
  variant: z.string(),
  quantity: z.number().int().min(1),
});

export type EmailLine = z.infer<typeof emailLineSchema>;

/**
 * How many lines an email prints before it starts counting.
 *
 * Three, then "and 4 more items". A transactional email is a notification, not
 * an invoice — the order page has the full list, and a message that reprints a
 * twenty-line basket buries the one sentence it exists to deliver.
 */
export const MAX_EMAIL_LINES = 3;

/** An ISO timestamp, or null when the thing genuinely was not recorded. */
export const optionalInstant = z.union([z.iso.datetime(), z.null()]);

/**
 * The greeting.
 *
 * Accounts require a first name, so the fallback is rarely reached — but "rarely"
 * is not "never" once imports, migrations and future social sign-in exist, and
 * `Hi ,` is a worse first impression than a neutral greeting. Whitespace-only
 * names fall back too.
 */
export function greeting(customerName: string): string {
  const name = customerName.trim();
  return name ? `Hi ${name},` : 'Hi there,';
}

/**
 * A date a customer reads: `20 September 2026`.
 *
 * Day-month-year, in the server's timezone — the same convention every admin
 * date boundary in ZyCart already uses, documented on `startOfDaysAgo`. No time
 * of day: none of these events is precise enough for a clock time to mean
 * anything to the person reading it.
 */
const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function formatEmailDate(iso: string | null): string {
  if (!iso) return '';

  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : dateFormatter.format(date);
}

/** `/account/orders/ZY10482`, absolute and built from configuration alone. */
export function orderUrl(brand: EmailBrand, orderNumber: string): string {
  return `${brand.appOrigin}/account/orders/${encodeURIComponent(orderNumber)}`;
}

/** `/account/returns/ZYR-000123`. */
export function returnUrl(brand: EmailBrand, returnNumber: string): string {
  return `${brand.appOrigin}/account/returns/${encodeURIComponent(returnNumber)}`;
}

/** Turns the stored lines into what the renderer draws. */
export function toItemBlock(
  lines: readonly EmailLine[],
  hiddenCount: number,
): EmailContent['items'] {
  if (lines.length === 0) return undefined;

  const items: EmailLineItem[] = lines.map((line) => ({
    name: line.name,
    variant: line.variant,
    quantity: line.quantity,
  }));

  return { lines: items, hiddenCount: Math.max(0, hiddenCount) };
}

/**
 * One template: what it is called, what it accepts, and what it says.
 *
 * `content` returns structured data rather than HTML, which is what makes it
 * impossible for a template to emit unescaped markup. See `render.ts`.
 */
export interface EmailTemplate<TData> {
  readonly name: string;
  /**
   * Bumped whenever the wording or the data contract changes.
   *
   * Stored on every delivery so a historical retry is reproducible. It is a
   * version number and nothing more — there is no template store, no editor and
   * no rollback machinery, because this phase needs determinism, not a CMS.
   */
  readonly version: number;
  readonly schema: z.ZodType<TData>;
  subject(data: TData): string;
  content(data: TData, brand: EmailBrand): EmailContent;
}
