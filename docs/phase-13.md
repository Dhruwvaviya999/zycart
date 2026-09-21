# Phase 13 — Shipping, Returns, Refunds & Post-Purchase Experience

## Overview

Phase 12 gave ZyCart an authoritative stock quantity with a ledger explaining
every movement, and an operations console for running the day. What it could
not answer was the question a customer asks most often after paying:

> Where is my order, and what do I do if something is wrong with it?

Before this phase the order page could say `SHIPPED`, and nothing more. No
carrier, no tracking number, no date it left, no date it was expected, and no
way for a customer to send anything back. An order that arrived damaged had
exactly one route — a phone call to somebody who would then edit a database.

Phase 13 builds the post-purchase domain that was missing. Three things:

1. **A shipment domain.** Where the parcel is, who has it, and when it moved —
   as a lifecycle of its own that cannot contradict the order's.
2. **A return domain.** Item-level return requests, with eligibility, quantity
   accounting and an approval workflow the server enforces.
3. **Partial refunds**, issued through the Razorpay integration Phase 7 already
   built, with the same duplicate protection it already relied on.

Plus the surfaces that make them usable: a customer order page that answers
"where is it and what happens next", and an admin fulfilment workspace that
answers "what should I do about this one".

### What this phase deliberately is not

It is **not a shipping-provider integration**. There is no Shiprocket,
Delhivery or Blue Dart API call anywhere in it. Every shipment field is what a
person entered or what a person recorded happening. That constraint is the
reason the customer-facing timeline can be read literally — see
[Nothing is fabricated](#nothing-is-fabricated).

---

## Nothing is fabricated

This is the rule the whole phase is built around, so it goes first.

**No timestamp is ever written for something that did not happen, and no
timestamp is ever displayed for something whose moment was not recorded.**

It sounds obvious. It is also the easiest thing in a post-purchase interface to
get wrong, because a timeline with a gap looks broken and a timeline with
invented dates looks finished. Concretely:

| Situation | What ZyCart does | What it refuses to do |
| --- | --- | --- |
| Order placed before Phase 13 | "Shipment tracking is not available for this order" | Invent a carrier and a tracking number |
| Order shipped, dispatch time unknown | "Shipped — date not recorded" | Substitute `createdAt` |
| Parcel in transit, no estimate given | "Estimated delivery: not available yet" | Compute a plausible date |
| Order delivered before delivery dates were recorded | Refuses a self-service return, points at support | Start a return window from a guessed date |
| Delivered cash-on-delivery order | Omits the payment step from the timeline | Mark it paid, or leave it reading "you still owe money" |
| Shipment created for an already-shipped order | Uses the dispatch time from the **audit row** | Use "now" |

That last one is worth pausing on. An operator who marked an order shipped and
later obtained a tracking number can still attach it, and the resulting parcel
carries the dispatch time Phase 12's audit trail recorded — a timestamp
somebody actually wrote down. Where no such row exists, the field stays null and
the interface says so.

---

## Architecture

### Four lifecycles, not one

ZyCart now tracks four things about a purchase, deliberately apart:

```text
Order      what happened to the commercial transaction
Payment    what happened to the money
Shipment   where the physical goods are          [Phase 13]
Return     what happened after delivery          [Phase 13]
```

Phase 7 established why payment is separate from order state: an order is
routinely `CONFIRMED` with payment `PENDING` (cash on delivery) or `PENDING`
with payment `FAILED`. Collapsing them would make those indistinguishable.

The same argument extends. An order that is `SHIPPED` can be in transit, out
for delivery, or sitting at a hub after a failed delivery attempt — none of
which are order states. And a delivered, paid order can have one of two pairs of
shoes coming back, which none of the other three can express.

### What stops shipment and order state contradicting each other

This was the main design risk. `Shipment.status = DELIVERED` beside
`Order.status = PROCESSING` is exactly the kind of parallel-state mess the
separation is supposed to avoid.

It is prevented by a table and a transaction:

```text
SHIPMENT_IMPLIES_ORDER          (shipment.model.ts)

READY_TO_SHIP     → (none)      packing says nothing about the order
SHIPPED           → SHIPPED
IN_TRANSIT        → SHIPPED
OUT_FOR_DELIVERY  → SHIPPED
EXCEPTION         → SHIPPED
DELIVERED         → DELIVERED
CANCELLED         → CANCELLED
```

Every shipment transition runs `transitionOrderStatus` in the **same
transaction** whenever the implied order status differs from the current one. If
the order cannot legally make that move, the whole transaction aborts. So the
contradictory pair is not a state this system can be left holding — not by
convention, but because the write that would produce it is refused.

The reverse direction matters just as much. An operator marking an order
`SHIPPED` from the order page has been able to do that since Phase 9, and Phase
13 had no business breaking it. `syncShipmentToOrderStatus` carries any existing
parcel forward with the order, in the same transaction.

Neither direction can recurse: the sync writes shipment fields directly and
never calls the shipment service's transition, and the shipment service's
transition leaves the parcel already at its target, so the sync's filter matches
nothing on the way back.

### The order lifecycle is unchanged

```text
PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED
     ↘          ↘            ↘
              CANCELLED
```

Six statuses, same graph, same terminal states. Phase 13 adds richer information
*around* the order and no new order states. A test asserts this
(`Phase 12 and Phase 7 are left intact`).

The one refactor: `setOrderStatus` was split into a session-taking
`transitionOrderStatus` (the policy — the graph, the cancellation, the audit
row) and a thin wrapper that opens the transaction. Shipment moves join the
caller's transaction through the former. There is still exactly one
implementation of "may this order move there?".

---

## Shipment lifecycle

```text
READY_TO_SHIP ──→ SHIPPED ──→ IN_TRANSIT ──→ OUT_FOR_DELIVERY ──→ DELIVERED
      │              │  └──────────┴────────────────┘  ▲
      │              ↓              ↓                  │
      │          EXCEPTION ←────────┘                  │
      │              └─────────────────────────────────┘
      ↓
  CANCELLED
```

| Status | Meaning | Order it implies |
| --- | --- | --- |
| `READY_TO_SHIP` | Packed and labelled, not handed over | — |
| `SHIPPED` | Handed to the carrier. `shippedAt` recorded | `SHIPPED` |
| `IN_TRANSIT` | Moving through the carrier's network | `SHIPPED` |
| `OUT_FOR_DELIVERY` | With the delivery agent | `SHIPPED` |
| `DELIVERED` | Handed to the customer. `deliveredAt` recorded | `DELIVERED` |
| `EXCEPTION` | A problem in transit: failed attempt, hold, address issue | `SHIPPED` |
| `CANCELLED` | The order was cancelled before dispatch | `CANCELLED` |

**There is no `NOT_FULFILLED`.** The absence of a shipment document *is*
"nothing has been dispatched". A status value no write ever stores is one an
operator could read meaning into from an empty filter — the same reasoning that
kept `RESERVATION` out of Phase 12's movement types.

**`EXCEPTION` recovers.** A failed delivery attempt is routinely followed by a
successful one, so it leads back to `IN_TRANSIT`, `OUT_FOR_DELIVERY` and
`DELIVERED`. It is *not* reachable from `READY_TO_SHIP`: nothing can go wrong in
transit before the parcel is in transit.

**`CANCELLED` is not an operator action.** It is reached only by cancelling the
order, which restores stock and may owe a refund. Offering it as a shipment
dropdown would be a second, quieter route into a decision that deliberately asks
for confirmation. The validator refuses it and `operatorReachable` filters it
out.

### Creation

One shipment per order, enforced by a unique index — so a double-submitted form
produces one parcel, not two. ZyCart ships an order as one parcel; nothing in
the order model divides lines between parcels, so allowing several would produce
shipments no part of the system could say what was inside.

Creatable while the order is `CONFIRMED`, `PROCESSING` or `SHIPPED`. Not
`PENDING` — packing an order whose payment has not landed means picking stock
for a sale that may never happen.

**The initial status is derived, not chosen.** An order being prepared gets a
`READY_TO_SHIP` parcel; one already marked shipped gets a `SHIPPED` parcel with
the audited dispatch time. Letting an operator pick would let them pick a value
that contradicts the order, and the only possible response would be an error
message explaining a rule the form could have applied itself.

### Tracking number and URL

**Tracking number.** Trimmed, 4–60 characters, `[A-Za-z0-9._/-]`. Deliberately
**not** validated against any carrier's format: ZyCart cannot check a number
against Delhivery's scheme without talking to Delhivery, and a regex guessing at
it would reject correct numbers from a carrier nobody anticipated.

**Tracking URL.** Parsed with `new URL()` and the protocol checked against
exactly one permitted value: `https:`. So `javascript:`, `data:`, `vbscript:`
and relative paths are rejected at the edge rather than relied upon to be
harmless later. Plain `http:` is refused too — sending a customer from an https
page to a plaintext one is a downgrade nobody needs.

The domain is **not** restricted. An allow-list of carrier domains would need
maintaining, would break silently the day a carrier moved its tracking host, and
protects against a threat — a malicious administrator — who can already do far
worse with the access they have. The link is rendered as an ordinary anchor with
`target="_blank" rel="noopener noreferrer"`, never interpolated into markup.

---

## Return lifecycle

```text
                 ┌──→ REJECTED
REQUESTED ───────┼──→ APPROVED ──→ RECEIVED ──→ REFUND_PENDING ──→ REFUNDED
                 │        │             ▲              │
                 └──→ CANCELLED ←───────┘              │
                          ▲                            │
                          └────────────────────────────┘
                                   (failed refund returns to RECEIVED)
```

| Status | Meaning |
| --- | --- |
| `REQUESTED` | The customer has asked. Nothing decided |
| `APPROVED` | An operator agreed; the customer sends the goods back |
| `REJECTED` | Declined, with a reason the customer reads. Terminal |
| `RECEIVED` | The goods are physically back |
| `REFUND_PENDING` | A refund is at the gateway and has not settled |
| `REFUNDED` | The money is back. Terminal |
| `CANCELLED` | The customer withdrew before sending anything. Terminal |

**`REFUND_PENDING` can go back to `RECEIVED`.** A refund the gateway reports as
failed has not happened, and the return must return to the state it can be
retried from. Without that edge a failed refund would strand the money.

**`RECEIVED` is terminal for a cash-on-delivery order.** There is no captured
gateway payment to reverse, so there is no `REFUNDED` to reach. The console says
so in words rather than leaving an operator hunting for a button that would
always be refused.

**A return cannot be withdrawn once the goods are with us.** Doing so would mean
claiming ZyCart is not holding something it is holding.

### Eligibility

Decided entirely on the server, in `return-policy.ts`, and evaluated twice: once
before the transaction opens (to fail fast with a clear message) and again
inside it against the document about to be written. The second is the one that
is load-bearing.

An order is returnable when **all** of these hold:

1. `status === 'DELIVERED'`
2. `deliveredAt` is recorded
3. `now` is within the return window
4. at least one line still has returnable quantity

Each failure produces a **different sentence**, because a customer who is
refused deserves to know which rule refused them. "Returns open once your order
is delivered" and "the 30-day return window has closed" are different pieces of
information.

### The return window

**Thirty whole days from the moment delivery was recorded**, closing at the
*end* of the thirtieth day rather than at the same clock time — so a parcel
delivered at 11:58 pm gets the same usable days as one delivered at noon.

- **Clock starts:** `Order.deliveredAt`, written by `transitionOrderStatus` and
  nothing else.
- **Timezone:** the server process's, the same convention every other ZyCart
  date boundary uses. Deploy with `TZ` set to the store's zone and every
  boundary moves together.
- **Weekends and holidays:** not excluded. ZyCart has no holiday calendar, and a
  rule depending on data nobody maintains is a rule nobody can predict.
- **Partial returns:** allowed, per line and per unit.

**Why thirty.** Because the storefront had already promised it — "30-day
returns" is on every product page and in the footer, and both predate this
phase. Enforcing fourteen would have meant the server quietly refusing returns
the shop was still advertising. One constant, `RETURN_WINDOW_DAYS`, is the
authority; the two marketing strings carry a comment pointing back at it.

**Orders delivered before Phase 13** have no `deliveredAt` unless the migration
recovered one from an audit row. Those are refused a self-service return with an
explanation and a route to support, rather than being given an unbounded window
or a fabricated start date.

### Return reasons

`WRONG_ITEM`, `DAMAGED`, `DEFECTIVE`, `SIZE_ISSUE`, `NOT_AS_EXPECTED`,
`CHANGED_MIND`, `OTHER` — per line, not per request, because an order can
contain a damaged item and one that simply does not fit, and forcing one reason
across both would put a falsehood on the record that later reporting repeats.

`DAMAGED` and `DEFECTIVE` set the *default* of the resellable checkbox when
goods are received. Only the default — the person holding the item decides.

### Two notes, never one

`resolutionNote` is the operator's explanation **to** the customer and appears
on their return page. `adminNote` is internal and never leaves the console.

One field would have forced a choice between a rejection with no explanation and
internal commentary shown to the person it is about. The customer projection is
built by **naming every field it contains** rather than by deleting the private
ones, so `adminNote` cannot leak by somebody forgetting a `delete`.

A rejection **requires** `resolutionNote` (minimum 10 characters), enforced by
the validator. A customer told only "rejected" is left holding an item they
cannot send back with no idea why.

---

## Quantity accounting and concurrency

### The authority is on the order, not on the returns

How much of a line is spoken for lives in `Order.items[].returnedQuantity`, not
in an aggregate over the return collection.

That is the entire concurrency story. Two browser tabs each requesting the last
returnable unit are two *inserts*, into different documents, which conflict with
nothing — so both would read the same remaining quantity and both would succeed.
No amount of reading before writing closes that window.

Incrementing a counter on one shared document does close it, because the guard
can ride inside the update:

```ts
await Order.updateOne(
  { _id: orderId },
  { $inc: { 'items.$[it].returnedQuantity': line.quantity } },
  {
    session,
    arrayFilters: [{
      'it._id': line.orderItemId,
      'it.returnedQuantity': { $lte: line.purchasedQuantity - line.quantity },
    }],
  },
);
// modifiedCount !== 1  →  refused
```

This is the identical technique `commitStock` uses to stop two customers buying
the last unit, and `adjustStock` uses to stop stock going negative. Inside a
transaction the two may instead collide as a write conflict on the order
document, which `withTransaction` retries — and the retry then takes the path
above. Either way: one winner.

**Verified, not asserted.** `verify-returns.ts` runs two genuinely concurrent
`createReturn` calls for the same last unit against a real replica set and
checks that exactly one succeeded, the counter is 1, and exactly one request
exists.

### Holding and releasing

| Status | Holds units? |
| --- | --- |
| `REQUESTED`, `APPROVED`, `RECEIVED`, `REFUND_PENDING`, `REFUNDED` | yes |
| `REJECTED`, `CANCELLED` | no — released |

Rejecting or withdrawing gives the units back, so the customer can ask again for
the right quantity or with the right reason. Approving **fewer** units than were
asked for releases the difference in the same transaction.

A test asserts every status is in exactly one of those lists. A status in
neither would be a quantity leak — units held by a request nothing gives back,
or a request holding nothing and letting the same unit be returned twice.

`verify-returns.ts` additionally reconciles, for every order it created, the
stored counter against the sum over the returns that hold it.

---

## Refund integration

### One refund architecture, not two

Phase 7 already refunded: a payment captured for an order that could not be
fulfilled was reversed in full. Phase 13 did not build a second gateway
integration beside it.

- Both convert rupees to paise in `razorpay.service` and nowhere else.
- Both take their amount from stored order data.
- Both protect against duplicates with an atomic conditional update that must
  succeed before any money moves.

What is new is only what returns actually need: a **partial amount**
(`refundPayment`, with `refundPaymentInFull` kept as a named wrapper so the
unfulfillable path still cannot choose one), and a place to keep a **second**
gateway refund id against an order that may already have one.

### Where the refund record lives

`Order.payment` holds one `refundId` and one `refundedAt`, because the only
refund Phase 7 performed was the whole payment. A partial return produces a
second refund against the same payment, with its own amount and id, and there is
nowhere on that sub-document to put it.

So **each return owns its refund**, and the order keeps a running
`payment.refundedAmount` that every refund path increments. That figure is the
one thing both paths must agree on, because it is the cap.

### Why no `PARTIALLY_REFUNDED` payment status

Adding one was considered and declined. Every existing rule that reads payment
status — the attention queue, the cancellation guard, the payment-retry guard —
would have had to learn about it, for a distinction `refundedAmount` already
carries precisely.

So a partly refunded order stays `PAID` with a non-zero `refundedAmount`, which
is the accurate description. `payment.status` moves to `REFUNDED` (or
`REFUND_PENDING`) only when the cumulative refunds reach the order total, using
exactly the states Phase 7 defined.

### Amount calculation

Computed by `plannedRefund`, from the order's own historical snapshot:

```text
per unit  =  unitPrice
           − floor(discount × unitPrice / subtotal)     proportional discount
           + floor(tax      × unitPrice / subtotal)     proportional tax

refund    =  Σ approvedQuantity × perUnit
             capped at (pricing.total − payment.refundedAmount)
```

- **From the snapshot, never the catalogue.** A product repriced since purchase
  must not change what a refund for that purchase is worth.
- **From `approvedQuantity`, never `requestedQuantity`.** Approving one of two
  units and refunding both is precisely the mistake the separation prevents.
- **Shipping is never refunded.** ZyCart charges none today, so that line is
  about intent: delivery was performed, and a partial return does not undo it.
- **Integer arithmetic throughout.** `Math.floor` on both proportional shares,
  never a float. ZyCart stores whole rupees; paise exist only inside a Razorpay
  call.
- **The cap is not decoration.** Two returns against one order are refunded
  independently; without it a mistaken approval could take the cumulative total
  past what the customer ever paid.

**There is no field anywhere in this phase through which a client can suggest a
refund amount.** The refund endpoint takes no body at all.

### Idempotency

Razorpay's refund endpoint, through this SDK, takes no idempotency key that
would make a retried call safe. So the guarantee is ours, and it is the same one
`refundUnfulfillablePayment` has used since Phase 7:

```ts
findOneAndUpdate(
  { _id, status: 'RECEIVED', 'refund.claimedAt': null, 'refund.razorpayRefundId': null },
  { $set: { status: 'REFUND_PENDING', 'refund.claimedAt': now, ... } },
)
```

The claim sets the very field its own filter requires to be null. Two
administrators clicking at the same instant produce one claim; the loser's
update matches nothing and is refused **before reaching the gateway**.

### The three outcomes

| Gateway says | Return goes to | Order |
| --- | --- | --- |
| `processed` | `REFUNDED`, `completedAt` set | `refundedAmount` increased |
| `pending` | stays `REFUND_PENDING` with a real refund id | `refundedAmount` increased |
| failed / unreachable | back to `RECEIVED`, claim released, reason stored | untouched |

A failed refund is **loud**: the reason is on the return, surfaced at the top of
the admin decisions panel, raised by the operations panel, and logged with the
ids needed to investigate. Nothing is marked refunded. No audit row is written,
because the audit trail records mutations that happened and a refund that did
not happen is not one.

### Settling a pending refund

There is deliberately **no "mark as refunded" button**, for the same reason
there is no "mark as paid" beside the order status control: whether money moved
is a fact at the gateway, and an administrative shortcut asserting it would make
every "Refunded" badge in ZyCart mean less.

Two things settle it, and both go through one function (`applyRefundOutcome`):

1. **The `refund.processed` / `refund.failed` webhook**, through the same
   signed, event-id-deduplicated pipeline every other Razorpay event uses. This
   also closes a gap that predates Phase 13 — an unfulfillable-order refund left
   `REFUND_PENDING` used to sit there until somebody noticed.
2. **"Check with Razorpay"** in the console, which reads the refund and records
   whatever it says.

Both are conditional updates, so a webhook and a manual check arriving together
produce one transition.

---

## Inventory interaction

### Returned goods do not automatically become sellable stock

This is the most important decision in the phase and it is deliberately
conservative.

Nothing restocks merely because goods came back. An operator marks a return
received and states, as a **separate and explicit judgement**, whether the units
are resellable. Only `true` restocks.

A returned item may be worn, broken, missing a part, or simply not what was
sent back. ZyCart has no inventory-condition model that could tell those apart,
and incrementing sellable stock on receipt would mean the shop offering things
it cannot ship — a worse failure than a manual step. The receive dialog states
the consequence of each choice before the button that causes it.

### When it does restock, it goes through Phase 12

`restockFromReturn` lives in `inventory.service` beside the other writer that is
there, and the return service passes it a session and never sees a product
document. Phase 12 established that `Product.stock` has a fixed set of writers,
each recording a movement in the same transaction. This is the fifth:

```text
commitStock        (order.service)      SALE
applyCancellation  (order.service)      CANCELLATION
restockFromReturn  (inventory.service)  RETURN             [Phase 13]
createProduct      (product.service)    INITIAL_STOCK
adjustStock        (inventory.service)  MANUAL_ADJUSTMENT
```

There is no sixth, and no code in the return domain touches `Product.stock`.

### Why `RETURN` and not `CANCELLATION`

Both put units back, and one type would have been simpler. They are separated
because they answer different questions and are counted differently: a
cancellation means the order never happened, a return means it happened and was
undone. A store working out how much of its revenue survives has to tell those
apart.

`MOVEMENT_REFERENCE_TYPES` gains `RETURN` too, so a restock names the return —
which is the record an operator would open to find out why units reappeared, and
the return names the order.

### Deleted products

Skipped, exactly as `applyCancellation` skips them. The count of units *actually*
restocked is returned, so the audit line and the `restocked` flag say what really
happened rather than what was asked for.

---

## Security

### Authorization

| Surface | Guard |
| --- | --- |
| `/api/returns/*` | `requireAuth` on the router; every query scoped by session user id |
| `POST /api/orders/:ref/returns` | `requireAuth`; ownership checked through `findOwnedOrder` |
| `/api/admin/*` | `requireAuth` then `requireRole('ADMIN')`, mounted once on the namespace |

Ownership is a **filter inside the query**, not a check afterwards — so another
customer's return is simply not found, and the response cannot distinguish
"someone else's" from "does not exist". `findOwnedReturn` and `findReturnByRef`
are separate functions rather than one with a flag, because a scoping rule that
can be switched off by passing an argument is a scoping rule waiting to be
switched off by accident.

Verified in the browser run against the live API:

```text
404  another customer's return
404  another customer's order
404  raising a return on someone else's order
404  withdrawing someone else's return
403  admin return queue, as a customer
403  admin return detail / order detail, as a customer
403  approve / refund / create shipment, as a customer
401  all of the above, signed out
```

### Mass assignment

Every schema is `.strict()`, so an unrecognised field is a 400 rather than
something that reaches a Mongo update. What is absent is the design:

- No `refundAmount`, `unitPrice`, `status` or `userId` in any return schema.
- No `status`, `shippedAt`, `deliveredAt` or `order` in either shipment schema.

Tests assert each of those is rejected. No service in this phase spreads a
request body into an update; every writable field is named one at a time.

### Injection and rendering

- Tracking URLs: protocol allow-list of exactly `https:` (above).
- Tracking numbers: character class that keeps the value a plain reference.
- All notes are rendered as React text, never as markup.
- Admin return search is prefix-anchored with `escapeRegex`-equivalent escaping,
  so a pathological term cannot become a slow or malformed regex.

### Privacy

The customer return projection names its fields. `adminNote`, `reviewedBy`,
`reviewedByName`, `resellable`, `restocked` and the gateway refund id are not on
it at all — there is nothing on the customer payload to accidentally render.

---

## Operations

Seven post-purchase exception rules, each decidable from a stored status and a
stored timestamp, counted in `getPostPurchaseExceptions` and surfaced as their
own section on `/admin/operations` with a link into the queue that lists them:

| Rule | Condition |
| --- | --- |
| `RETURN_REVIEW_DUE` | `REQUESTED` for more than 24 hours |
| `RETURN_AWAITING_GOODS` | `APPROVED` more than 7 days ago |
| `RETURN_REFUND_DUE` | `RECEIVED` more than 2 days ago, no refund started |
| `RETURN_REFUND_STALLED` | `REFUND_PENDING` at the gateway more than 3 days |
| `RETURN_REFUND_FAILED` | a refund attempt failed — critical, no time condition |
| `SHIPMENT_EXCEPTION` | a parcel reported a transit problem |
| `DELIVERY_OVERDUE` | past its own estimate and not delivered |

Kept in a separate list from the order rules, because those count orders and
these count returns and shipments — summing them would total unlike things, and
clicking one card would land in a different queue from its neighbour.

`DELIVERY_OVERDUE` is decidable **only because a person typed the estimate in**.
A parcel with no estimate can never trip it, which is correct: nothing was
promised.

### The one metric

```text
return rate = return requests raised in the window
              ────────────────────────────────────
              orders delivered in the window
```

Both halves are **order-level**: one request counts once however many lines it
covers. Mixing an item-level numerator with an order-level denominator is the
classic way to produce a percentage that is quietly meaningless.

The numerator counts requests in *any* state, including rejected and withdrawn,
because the question is "how often do customers want to send things back?" —
filtering to approved ones would answer "how often do we agree?" instead. The
denominator counts by `deliveredAt`, not order date: an order placed on the last
day of the window cannot have produced a return yet.

Both raw counts are rendered beside the percentage so the arithmetic is
checkable, and with no delivered orders the rate is **absent** rather than `0%`
— which would read as "nothing gets returned" rather than "nothing has been
delivered".

---

## API

### Customer

```text
GET    /api/orders/:orderRef            → now carries shipment, returns, returnability
POST   /api/orders/:orderRef/returns    → raise a return
GET    /api/returns                     → my returns, paged, filterable by status
GET    /api/returns/:returnRef          → one of my returns
POST   /api/returns/:returnRef/cancel   → withdraw it
```

### Admin

```text
POST   /api/admin/orders/:orderRef/shipment          → create (status derived)
PATCH  /api/admin/orders/:orderRef/shipment          → carrier details only
POST   /api/admin/orders/:orderRef/shipment/status   → move the parcel and the order

GET    /api/admin/returns                            → the queue
GET    /api/admin/returns/summary                    → counts and the return rate
GET    /api/admin/returns/:returnRef                 → one return, in full
POST   /api/admin/returns/:returnRef/approve         → with per-line quantities
POST   /api/admin/returns/:returnRef/reject          → reason required
POST   /api/admin/returns/:returnRef/receive         → resellable judgement required
POST   /api/admin/returns/:returnRef/refund          → no body; server computes the amount
POST   /api/admin/returns/:returnRef/refund/check    → ask Razorpay whether it settled
```

Four decision endpoints rather than one `PATCH` taking a status, because each
means something different and carries a different body. A single status endpoint
would have to accept the union and work out which rules applied.

---

## Data model

### New collections

**`Shipment`** — one per order (unique index). Status, carrier, tracking number
and URL, `shippedAt` / `deliveredAt` / `estimatedDeliveryAt` (all nullable and
only ever set when real), an append-only `events` array, and an operational
note.

**`ReturnRequest`** — `returnNumber` (`ZYR-YYYYMMDD-XXXX`), order and user
references with snapshotted numbers, status, item lines carrying the order's own
price and variant snapshot plus requested and approved quantities and a reason,
the two notes, lifecycle timestamps, the resellable judgement, and an embedded
refund record.

### Additive changes to existing models

| Model | Field | Why |
| --- | --- | --- |
| `Order` | `deliveredAt` | the return window's clock |
| `Order.items[]` | `returnedQuantity` | the quantity authority; see concurrency |
| `Order.payment` | `refundedAmount` | the running total every refund path caps against |
| `InventoryMovement` | `RETURN` type, `RETURN` reference | restocks are distinguishable from cancellations |
| `AuditLog` | 8 actions, 2 entity types | post-purchase administrative actions |

### Indexes

Added only where a query needs one:

```text
Shipment        order (unique), user+createdAt, status+createdAt,
                estimatedDeliveryAt (partial), trackingNumber (partial)
ReturnRequest   returnNumber (unique), user+createdAt, order+createdAt,
                status+createdAt, refund.razorpayRefundId (partial)
Order           status+deliveredAt        the return-rate denominator
```

The partial indexes matter: most shipments have no estimate and no tracking
number, and a refund id exists only once one has been issued. Indexing their
nulls would pay for rows the queries can never want.

---

## Migration

```bash
pnpm migrate:phase13
```

Additive, idempotent and non-destructive. It creates no documents and deletes
none.

1. **Creates the indexes** for the two new collections and the new order index.
2. **Initialises the counters.** `items[].returnedQuantity` and
   `payment.refundedAmount` to zero. This one is **not cosmetic**: the return
   reservation's array filter compares against a number, and in MongoDB a
   *missing* field does not match a numeric `$lte`. Without this step every
   pre-Phase-13 order would silently refuse every return.
3. **Backfills `payment.refundedAmount`** to the order total on orders Phase 7
   already refunded in full, so the cap does not start from zero on money that
   has gone back.
4. **Backfills `Order.deliveredAt`** from the audit row that recorded the
   transition to `DELIVERED` — and only from there.

**No shipments are created and no delivery date is guessed.** An order delivered
before Phase 12's audit trail existed keeps a null `deliveredAt`, is refused a
self-service return with an explanation, and says so.

### Result on the development database

```text
147 orders
  returnedQuantity initialised     147 orders
  payment.refundedAmount           147 orders
  delivery dates recovered           0 (these are seeded orders with no audit history)
  left with a null delivery date   143  ← correctly refused self-service returns
```

---

## Testing

### Unit suite — `pnpm --filter zycart-backend test`

```text
285 tests, 285 passed, 0 failed   (86 of them new, in tests/returns.test.ts)
```

No database, the same choice the inventory and AI suites make: what is under
test is ZyCart's own logic, and a round trip would only add ways to fail for
unrelated reasons. Covers both transition graphs and their terminal states, the
holding/releasing partition, the shipment→order implication table, window
arithmetic, every eligibility refusal, refund apportionment and capping, every
refund blocker, and every validator including each hostile URL shape and each
mass-assignment attempt.

### Database verification — `pnpm returns:verify`

```text
61 checks, 61 passed, 0 failed    (against the live Atlas replica set)
```

Runs the real service functions in real transactions. Creates only records under
a `ZYCART-P13` / `ZYC-P13` / `@zycart-p13.test` namespace, never touches a record
it did not create, and removes its own in a `finally`. It issues no refunds —
money is not moved by a verification script.

**The concurrency checks, which are genuinely concurrent:**

| Race | Result |
| --- | --- |
| Two `createReturn` calls for one remaining unit | exactly one succeeded; counter = 1; one request exists |
| Two administrators approving the same return | exactly one succeeded; exactly one audit row; quantity did not double |
| Two withdrawals of the same request | exactly one succeeded; units released exactly once |

It also asserts, for every order it created, that the stored
`returnedQuantity` equals the sum over the returns holding it and never exceeds
what was bought.

### Browser verification — Playwright driving real Chrome

```text
184 checks, 184 passed, 0 failed
```

A full walkthrough against the production build: confirm → process → create
shipment → ship → in transit → exception → delivered, then a customer return
raised through the dialog, then approve (partially) → receive in the console.

Widths **320, 390, 768, 1024, 1440** in **light and dark**, across seven pages,
asserting zero horizontal document overflow and no failed requests on each.

Error paths actually exercised: empty return selection, missing reason, a
quantity stepper at its ceiling, a fully-held line no longer being offered, and
four hostile tracking URLs (`javascript:`, `data:`, `http:`, relative).

Accessibility: heading-level continuity, timeline state carried in text and not
only colour, dialog `aria-labelledby`, per-product stepper labels, and Escape
closing the dialog.

### Regression

Existing suites all pass unchanged. Both production builds succeed. Both
workspaces lint clean and typecheck clean.

---

## A pre-existing bug found and fixed

The browser run reported ~620px of horizontal overflow at 390px on **every**
`/account/*` page — including `/account/addresses` and `/account`, which this
phase did not touch.

`AccountNavigation` is a grid item in the account layout, and a grid item's
default `min-width: auto` refuses to shrink below its content's intrinsic width.
Its horizontal rail is a flex row wider than a phone, so the track stretched to
fit and pushed the document sideways — the `overflow-x-auto` on the list never
got the chance to scroll, because the list was never the thing being
constrained. The sibling holding the page content already carried `min-w-0`;
the nav did not.

Adding the Returns link made it worse, and the new pages inherit the layout, so
it was fixed rather than left: one class, with the reasoning recorded beside it.
Overflow is now zero on every account page at every tested width.

---

## Known limitations

**No carrier integration.** Every shipment field is manually entered. No
tracking number is validated against a carrier's scheme, no status is polled,
and no transit time is estimated. This is the phase's central constraint, not an
oversight — it is what lets the customer timeline be read literally.

**One parcel per order.** Split shipments are real, and the schema could carry
them, but nothing in the order model divides lines between parcels — so allowing
several would produce shipments no part of the system could say what was inside.

**No returned-but-unsellable inventory pool.** A return judged not resellable
leaves stock untouched and nothing tracks where those units went. ZyCart has one
sellable quantity per product and no condition model; inventing a second pool
would have been inventing a warehouse system.

**Cash-on-delivery refunds happen outside ZyCart.** Nothing records COD money
changing hands, so there is no captured payment to reverse. The return runs its
course to `RECEIVED` and the console says the refund must be arranged directly.

**No email.** ZyCart has no email infrastructure and this phase did not build
one. The customer-facing copy therefore never promises a notification — it tells
people where to look instead. The domain is structured so shipped / delivered /
approved / refunded could later trigger one from the services that already own
those transitions.

**Orders delivered before Phase 13 with no audit row cannot self-serve a
return.** 143 of them on the development database. Deliberate: see _Migration_.

**Approval cannot increase a quantity**, only reduce it. Approving more than was
asked for is refused.

**The operations thresholds are assumptions.** 24 hours to review, 7 days in
transit, 2 days to start a refund, 3 days for one to settle — warehouse and
banking judgements, written as named constants with the reasoning beside them so
they can be argued with rather than discovered.

**Refund idempotency is ours, not the gateway's.** The SDK exposes no
idempotency key for refunds, so the protection is the database claim. A process
killed between the claim committing and the gateway responding would leave a
return in `REFUND_PENDING` with no refund id — visible, and resolvable by
checking Razorpay.

**Rate limiting is per-process and in memory.** Unchanged from earlier phases,
restated because the browser verification tripped it: ten sign-ins per quarter
hour per IP, counted separately by each instance behind a load balancer.

---

## Not in this phase

Shipping-provider APIs, label generation, rate shopping, pickup scheduling,
split shipments, exchanges (as distinct from returns), store credit, restocking
fees, return shipping labels, RMA barcodes, warehouse condition grading,
customer-support ticketing, and email or SMS notification.

**No AI is used anywhere in this phase.** Return eligibility, refund amounts,
shipment states, order transitions and every operational rule are deterministic
application logic and stay that way. A model that decided whether a customer
could return something would be a model that could be wrong about it.
