import { z } from 'zod';
import {
  MAX_CARRIER_LENGTH,
  MAX_ESTIMATE_DAYS_AHEAD,
  MAX_SHIPMENT_NOTE_LENGTH,
  MAX_TRACKING_LENGTH,
  MAX_TRACKING_URL_LENGTH,
  MIN_TRACKING_LENGTH,
  SHIPMENT_STATUSES,
} from '../models/shipment.model';

/**
 * Shipment input, validated on the server.
 *
 * `.strict()` throughout, so an unrecognised field is a 400 rather than
 * something that reaches a Mongo update. That is what closes mass assignment on
 * these endpoints: there is no `status` in the create or update schemas, no
 * `shippedAt`, no `deliveredAt` and no `order`, so no body can set them however
 * it is shaped. Status moves through its own endpoint and its own transition
 * graph; the timestamps are written by the server when the thing happens.
 */

/**
 * The carrier's name, as a person would write it.
 *
 * Free text within bounds, and deliberately not an enum. ZyCart has no carrier
 * integration, so a fixed list would be a list of the carriers somebody thought
 * of on the day this was written — and the first parcel sent with a local
 * courier would have no truthful value to record. The console offers the common
 * ones as suggestions, which is guidance rather than a constraint.
 */
const carrier = z.string().trim().max(MAX_CARRIER_LENGTH);

/**
 * A tracking reference.
 *
 * ## What is enforced, and what deliberately is not
 *
 * Enforced: it is trimmed, it is within a sane length, and it contains only
 * characters a tracking number is made of. That last rule is what keeps the
 * value a plain reference — no angle brackets, no quotes, no whitespace in the
 * middle — so it can never be anything but text wherever it is rendered.
 *
 * Not enforced: any carrier's format. ZyCart cannot check a number against
 * Delhivery's or Blue Dart's scheme without talking to them, and a regex
 * guessing at it would reject correct numbers from a carrier nobody
 * anticipated. Over-validating a field the system cannot verify is how an
 * operator ends up unable to record the truth.
 */
const trackingNumber = z
  .string()
  .trim()
  .min(MIN_TRACKING_LENGTH, `must be at least ${MIN_TRACKING_LENGTH} characters`)
  .max(MAX_TRACKING_LENGTH)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, 'can only contain letters, digits, . _ / and -');

/**
 * Where the customer can follow the parcel.
 *
 * ## Why the protocol allow-list is the whole point
 *
 * This value ends up in an `href` on a page a customer reads. A URL is parsed
 * here and its protocol checked against exactly one permitted value, so
 * `javascript:alert(1)`, `data:text/html,…` and `vbscript:` are rejected at the
 * edge rather than relied upon to be harmless later. `http:` is refused too:
 * sending a customer from an https page to a plaintext one is a downgrade
 * nobody needs, and every carrier in question serves https.
 *
 * ## Why the domain is not restricted
 *
 * An allow-list of carrier domains was considered and declined. It would have
 * to be maintained, it would silently break the day a carrier moved its
 * tracking to a new host, and it protects against a threat — a malicious
 * administrator — who can already do far worse with the access they have. The
 * protocol check is the control that actually matters, and the link is rendered
 * with `rel="noopener noreferrer"` so the destination gets no handle on the
 * page it came from.
 */
const trackingUrl = z
  .string()
  .trim()
  .max(MAX_TRACKING_URL_LENGTH)
  .refine((value) => {
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'must be a full https:// web address');

/**
 * An estimated delivery date.
 *
 * Bounded ahead so a mistyped year cannot promise a customer a parcel in the
 * next century, and bounded behind at today because an estimate in the past is
 * not an estimate. Accepts a date-only string as well as a timestamp, since
 * that is what a `<input type="date">` sends.
 */
const estimatedDeliveryAt = z.coerce
  .date()
  .refine((value) => {
    const floor = new Date();
    floor.setHours(0, 0, 0, 0);
    return value >= floor;
  }, 'cannot be in the past')
  .refine((value) => {
    const ceiling = new Date();
    ceiling.setDate(ceiling.getDate() + MAX_ESTIMATE_DAYS_AHEAD);
    return value <= ceiling;
  }, `cannot be more than ${MAX_ESTIMATE_DAYS_AHEAD} days away`);

const note = z.string().trim().max(MAX_SHIPMENT_NOTE_LENGTH);

/**
 * Creating a shipment.
 *
 * Notice there is no `status`. The initial state is derived from the order —
 * READY_TO_SHIP for one being prepared, SHIPPED for one already marked
 * dispatched — because letting a caller choose would let them choose a value
 * that contradicts the order. Everything here is optional: a parcel can be
 * packed before the carrier is booked, and a tracking number added later.
 */
export const createShipmentSchema = z
  .object({
    carrier: carrier.optional(),
    trackingNumber: trackingNumber.optional(),
    trackingUrl: trackingUrl.optional(),
    estimatedDeliveryAt: estimatedDeliveryAt.optional(),
    note: note.optional(),
  })
  .strict();

/**
 * Editing the carrier details.
 *
 * Every field is nullable-by-empty rather than nullable: sending `''` clears a
 * value, and omitting the key leaves it alone. That distinction matters because
 * a partial update must be able to correct a tracking number without wiping the
 * estimated delivery date the operator did not mention.
 *
 * `estimatedDeliveryAt` is the exception and takes an explicit `null`, because
 * an empty string is not a date and coercing one would produce an Invalid Date.
 */
export const updateShipmentSchema = z
  .object({
    carrier: carrier.optional(),
    trackingNumber: z.union([trackingNumber, z.literal('')]).optional(),
    trackingUrl: z.union([trackingUrl, z.literal('')]).optional(),
    estimatedDeliveryAt: z.union([estimatedDeliveryAt, z.null()]).optional(),
    note: note.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'send at least one field to change');

/**
 * Moving a shipment.
 *
 * The enum is the full list, and the service narrows it further — CANCELLED is
 * refused here by the validator because it is never an operator action, and the
 * transition graph refuses everything else that does not apply. Two layers, and
 * the outer one exists so an obviously wrong request never reaches the inner.
 */
export const shipmentStatusSchema = z
  .object({
    status: z.enum(SHIPMENT_STATUSES).refine(
      (value) => value !== 'CANCELLED',
      'a shipment is cancelled by cancelling its order, not on its own',
    ),
    note: note.optional(),
  })
  .strict();

export type CreateShipmentInput = z.infer<typeof createShipmentSchema>;
export type UpdateShipmentInput = z.infer<typeof updateShipmentSchema>;
export type ShipmentStatusInput = z.infer<typeof shipmentStatusSchema>;
