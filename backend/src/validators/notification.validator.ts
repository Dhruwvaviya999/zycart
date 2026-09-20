import { z } from 'zod';
import {
  DELIVERY_STATUSES,
  NOTIFICATION_EVENTS,
} from '../models/notification-delivery.model';
import { objectIdSchema } from './common';

/**
 * What the notifications console may ask for.
 *
 * ## There is no schema here for sending anything
 *
 * That absence is the design. ZyCart has no endpoint that takes a recipient, a
 * template or an event and produces an email — not for customers, and not for
 * administrators either. Messages exist because a business transition happened
 * on the server, and the only thing an administrator may do to one is ask for
 * it to be attempted again. A validator for `{ to, subject, body }` would be
 * the first half of turning a transactional system into an open mail relay.
 *
 * Everything below is therefore read-only, plus one retry that takes an id and
 * nothing else.
 */

export const adminNotificationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    // Capped like every other admin list, so no query can ask for the whole
    // collection in one response.
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(DELIVERY_STATUSES).optional(),
    event: z.enum(NOTIFICATION_EVENTS).optional(),
    /** Matches a return number, an order number or a customer's address. */
    search: z.string().trim().min(1).max(120).optional(),
    // The same four windows the audit page offers, resolved by the same
    // `startOfDaysAgo`, so no two admin screens disagree about "last 7 days".
    period: z.enum(['today', '7d', '30d', 'all']).default('30d'),
  })
  .strict();

export type AdminNotificationQuery = z.infer<typeof adminNotificationQuerySchema>;

/**
 * The id in the path.
 *
 * A strict ObjectId rather than a loose string: a delivery has no
 * human-readable reference of its own, so there is no second lookup form to
 * support, and rejecting anything else keeps a malformed value from reaching a
 * query at all.
 */
export const notificationIdSchema = z.object({ id: objectIdSchema });

/**
 * The body of a retry: empty, and enforced to be.
 *
 * The handler reads nothing from the body, so an ignored `{"email": "..."}`
 * would already be harmless. It is refused anyway, because "the field is
 * ignored" is a guarantee that lives in whoever last read the handler, and
 * `.strict()` is a guarantee that lives in the schema. A caller who believes
 * they can nominate a recipient, a template or an entity is told plainly that
 * they cannot, rather than receiving a 200 and drawing the opposite conclusion.
 */
export const retryNotificationSchema = z.object({}).strict();
