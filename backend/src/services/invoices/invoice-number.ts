import type mongoose from 'mongoose';
import { Counter } from '../../models/counter.model';

/**
 * Tax invoice numbers.
 *
 * ## What GST asks of them
 *
 * A consecutive serial number, unique within a financial year, at most sixteen
 * characters, using only letters, digits, `-` and `/`. `ZY/26-27/000042` is
 * fifteen: a store prefix, the financial year, and a six-digit sequence that
 * restarts each April.
 *
 * ## Why numbers are issued when the order ships, not when it is placed
 *
 * GST dates a supply of goods from their removal for delivery, and "consecutive"
 * means an auditor expects no gaps. Numbering at checkout would satisfy neither:
 * every cancelled order would burn a number, and an online order abandoned at
 * the payment window would burn one too. Numbering at dispatch, inside the
 * transaction that marks the order SHIPPED, means a number exists exactly when
 * an invoice does — and because the counter increment is part of that
 * transaction, a rolled-back shipment gives its number back.
 */

/** The Indian financial year runs April to March, reckoned in the store's timezone. */
const IST_OFFSET_MS = 330 * 60 * 1_000;

/**
 * `2026-27` for any moment from 1 April 2026 to 31 March 2027, IST.
 *
 * Computed from the UTC fields of a shifted date rather than from the host's
 * local time, so a server running in UTC and one running in IST agree about
 * which year a midnight dispatch on 1 April belongs to.
 */
export function financialYearOf(moment: Date): string {
  const ist = new Date(moment.getTime() + IST_OFFSET_MS);
  const year = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? year : year - 1;

  return `${String(start)}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** `ZY/26-27/000042`. The prefix is the store's; the rest is the sequence. */
export function formatInvoiceNumber(financialYear: string, sequence: number): string {
  const [start, end] = financialYear.split('-');
  return `ZY/${(start ?? '').slice(2)}-${end ?? ''}/${String(sequence).padStart(6, '0')}`;
}

/**
 * The next number in this financial year's series, inside the caller's
 * transaction.
 *
 * An upsert with `$inc` on the series' own `_id`, so two shipments committing
 * at once cannot draw the same number: they write the same document, and
 * MongoDB makes one of them wait and retry. The document is created by the
 * first invoice of a new year, which is also what restarts the sequence.
 */
export async function nextInvoiceNumber(
  session: mongoose.ClientSession,
  now: Date = new Date(),
): Promise<string> {
  const financialYear = financialYearOf(now);

  const counter = await Counter.findOneAndUpdate(
    { _id: `invoice:${financialYear}` },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after', session },
  );

  return formatInvoiceNumber(financialYear, counter.seq);
}
