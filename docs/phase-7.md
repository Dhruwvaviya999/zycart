# Phase 7 — Razorpay Payments

## Goal

Add online payment alongside cash on delivery, as a complete lifecycle rather
than a button.

```text
Checkout → Pay online → Razorpay → Verify → Confirm → History
              │                       │
              │                    webhook
              └── failed → retry ─────┘
```

Cash on delivery is unchanged. Everything new is additive.

## The central decision: the order and the payment are separate things

Phase 6 had one question — "where is this parcel?" — and one field to answer it.
Phase 7 adds a second, independent question: **has the money moved?**

| Order status                                                         | Payment status                                                     |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `PENDING` `CONFIRMED` `PROCESSING` `SHIPPED` `DELIVERED` `CANCELLED` | `PENDING` `AUTHORIZED` `PAID` `FAILED` `REFUND_PENDING` `REFUNDED` |

They are genuinely orthogonal, and every combination below is a real state:

- `CONFIRMED` / `PENDING` — a cash-on-delivery order on its way
- `PENDING` / `FAILED` — an online payment that did not go through, awaiting retry
- `CONFIRMED` / `PAID` — an online order that succeeded
- `CANCELLED` / `REFUND_PENDING` — paid, then found unfulfillable

Collapsing them into one field would make those indistinguishable, so the model
keeps them apart and so does the interface.

## Local order vs Razorpay order

Two different objects, and the distinction is the backbone of the design.

|                           | ZyCart order        | Razorpay order        |
| ------------------------- | ------------------- | --------------------- |
| Identity                  | `ZYC-20260919-AB12` | `order_Q1x...`        |
| Owner                     | the customer        | the gateway           |
| Lifetime                  | forever             | one payment session   |
| Authority on what is owed | **yes**             | no — it is told       |
| Survives a retry          | **yes**             | reused, or superseded |

The ZyCart order is the source of truth. A Razorpay order is created _from_ it,
never the other way round, and a retry pays the same ZyCart order rather than
creating a second one. That is what makes "the customer retried three times and
we have one order" true by construction.

`payment.supersededRazorpayOrderIds` keeps superseded gateway orders traceable,
because a payment can still land against one after it has been replaced.

## Money: rupees inside, paise only at the boundary

ZyCart stores whole rupees as integers, exactly as Phase 6 did. Razorpay's API
takes currency subunits. The conversion happens in
[`utils/money.ts`](../backend/src/utils/money.ts) **and nowhere else**:

```text
ZyCart database  →  whole rupees      (5300)
Razorpay API     →  currency subunits (530000)
```

No floating point value is produced anywhere in the path. `rupeesToPaise`
asserts its input is a finite, non-negative integer first, so the multiplication
is integer arithmetic on a value already known to be integral — there is nothing
for rounding to do.

Verified for ₹1, ₹99, ₹1,299, ₹5,300 and ₹1,14,900, and for the rejection of
`5300.5`, `NaN`, `Infinity`, negatives and implausibly large values.

If paise appear anywhere outside a call to the Razorpay API, something has
leaked.

## Inventory: stock follows the money, not the order

This is the part that most deserves attention, because the obvious
implementation is wrong.

|                             | Cash on delivery  | Online payment          |
| --------------------------- | ----------------- | ----------------------- |
| Stock taken                 | at order creation | at payment confirmation |
| Cart cleared                | at order creation | at payment confirmation |
| Order exists before payment | n/a               | **yes**, as `PENDING`   |

Reusing the COD flow for online payment would take stock the moment Razorpay
Checkout opened. Most Checkout windows that open are never completed, so the
last unit of a popular product would be held by whoever opened the window last
and wandered off — unbuyable by anyone who actually intends to pay.

So an online order is created **unpaid, holding nothing**. Stock and the cart
are dealt with only once the money is confirmed, in one transaction.

`stockCommitted` on the order records whether it is currently holding stock.
Once two payment methods take stock at different moments, the question stopped
being derivable from the order's status — and cancellation has to know the
answer, or an abandoned online order would invent inventory on its way to
`CANCELLED`.

## One finalization path

`finalizeSuccessfulPayment()` in
[`services/payment.service.ts`](../backend/src/services/payment.service.ts) is
the only place a payment ever becomes a confirmed order. The browser callback
and the webhook both arrive there, so they agree by construction rather than by
two implementations being kept in step.

```text
guard: already PAID?  ──────────────► ALREADY_FINALIZED
        │
        ▼
fetch payment from Razorpay        (amount, currency, status, order — trusted)
        │
        ▼
verify: belongs to this order?  amount?  currency?  captured?
        │
        ▼
┌─ transaction ─────────────────────────────────┐
│  claim the order  (conditional update)        │
│  decrement stock  (conditional, atomic)       │
│  mark CONFIRMED + PAID + paidAt               │
│  remove the purchased cart lines              │
└───────────────────────────────────────────────┘
        │
   stock gone? ──► abort, refund, CANCELLED + REFUND_PENDING
```

## Idempotency

Mandatory, and achieved with three mechanisms rather than one framework.

**1. The event-id ledger.** Razorpay says duplicate deliveries are expected and
that `x-razorpay-event-id` identifies a repeat.
[`webhook-event.model.ts`](../backend/src/models/webhook-event.model.ts) claims
each id through a **unique index**, so the second delivery loses the insert and
is acknowledged without doing the work again. The claim is released if handling
throws, so a genuine failure is still retried. No Redis, no queue — the database
already knows how to enforce uniqueness across concurrent writers.

**2. The conditional claim.** Taking an order from unpaid to paid is a single
`findOneAndUpdate` whose _filter_ carries the precondition:

```js
{ _id, status: 'PENDING', 'payment.status': { $in: [...] }, stockCommitted: false }
```

Two concurrent finalizations cannot both match. The loser returns
`ALREADY_FINALIZED`. This is what catches the duplicate no event id could — the
webhook racing the browser callback, which are two different requests carrying
the same payment.

**3. The transaction.** Stock, confirmation and cart clearing commit together
with the claim or not at all.

**Verified:** callback then webhook, webhook then callback, both at once, the
same event id delivered three times, and a late payment against a superseded
gateway order. Stock decremented exactly once in every case.

## Signature verification

Two different HMACs, two different secrets, both in
[`utils/payment-signature.ts`](../backend/src/utils/payment-signature.ts).

|                   | Signed payload           | Secret                    |
| ----------------- | ------------------------ | ------------------------- |
| Checkout callback | `order_id\|payment_id`   | `RAZORPAY_KEY_SECRET`     |
| Webhook           | **the raw request body** | `RAZORPAY_WEBHOOK_SECRET` |

Both comparisons are constant-time. A `===` on a hex digest leaks how much of a
guess was correct through its timing, which is enough to forge a signature byte
by byte given enough attempts.

A valid signature proves Razorpay issued those ids together. It does **not**
prove the payment was captured, or for how much — so amount, currency and status
are read from the Razorpay API and compared against the stored order regardless.

## Webhook raw body

The signature is over the exact bytes Razorpay sent. `express.json()` would hand
the handler an object, and re-serialising it reorders keys and rewrites
whitespace — the HMAC would never match again, and the endpoint would either
reject every genuine webhook or, far worse, be "fixed" by skipping verification.

So in [`app.ts`](../backend/src/app.ts), scoped to exactly one path and mounted
**ahead** of the global parser:

```js
app.use('/api/payments/razorpay/webhook', express.raw({ type: '*/*', limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
```

Body-parser marks a request once it has read the body, so `express.json()` sees
that request as already handled and leaves it alone. **Every other route keeps
normal JSON parsing** — verified explicitly against `/api/orders`, `/api/cart`,
`/api/users` and `/api/payments/razorpay/create`.

## Webhook events

Only three are acted on: `payment.captured`, `order.paid`, `payment.failed`.
Anything else is acknowledged and ignored, because an endpoint that 500s on an
event somebody enabled in the dashboard would be retried forever for nothing.

Razorpay does not promise chronological order, so `payment.failed` for an
abandoned first attempt can arrive _after_ the `payment.captured` for the retry
that worked. The guard is the filter: only an order still waiting for payment
can be marked failed, so a late failure against a paid order updates nothing.

A **permanent rejection** — wrong amount, wrong currency, a payment belonging to
another order — is recorded and acknowledged rather than retried, because
redelivering it can never make it valid. A **transient** failure (gateway
unreachable, database down) is rethrown so Razorpay does retry.

## The refund edge case

A payment is captured; before finalization, the last unit sells out.

Pretending the order succeeded would leave a paid order that can never ship.
Silently keeping the money is worse. So:

```text
payment captured → stock decrement fails → transaction aborts (order untouched)
                                          → claim the refund (conditional update)
                                          → payment.status = REFUND_PENDING
                                          → order.status   = CANCELLED
                                          → Razorpay refund, full amount
                                          → payment.status = REFUNDED
```

The claim is a conditional update, so a duplicate webhook arriving mid-refund
matches nothing and cannot start a second one.

If the refund API call itself fails, the order **stays** `REFUND_PENDING` with a
loud `AUTOMATIC REFUND FAILED` log naming the order and payment. That is exactly
what it is — money owed that has not been returned — and nothing pretends
otherwise.

**Verified live**, both paths: two customers paying for the last 2 units
simultaneously, and the same race with the refund API forced to fail.

## Retry

A failed payment leaves the ZyCart order intact and `PENDING`. The customer
retries against that same order — from checkout, from the order page, or from
the confirmation page — and the backend revalidates the payable amount before
every attempt.

An existing gateway order is **reused** while it is still open, which is what
makes a double click harmless: the second call returns the same
`razorpayOrderId` instead of stacking up abandoned gateway orders.

If the gateway says that order was already paid, the money is already in — so
the server finishes confirming _that_ payment rather than asking the customer to
pay again.

## Amount integrity

Four checks stand between a customer and paying the wrong amount:

1. The request body cannot mention money. `createPaymentSchema` and
   `verifyPaymentSchema` are `.strict()`, so `{ orderId, amount: 1 }` is a 400,
   not a silently ignored field.
2. `assertOrderTotalIntact` re-derives the total from the order's own lines
   before any gateway interaction, and refuses if the stored total has drifted.
3. The gateway amount is converted from that total, on the server, at the
   boundary.
4. At verification, the amount Razorpay reports for the payment is compared
   against the stored order total again.

**Verified:** a genuine, correctly signed ₹1 payment against a ₹5,300 order is
refused with `409`, the order stays unpaid, and no stock moves.

## Ownership

```text
authenticated user → ZyCart order → Razorpay order
```

Never the other way round. `findOrderByGatewayOrderId` scopes the lookup to the
authenticated customer, so another customer's gateway order id resolves to
nothing rather than to their order — **verified** with a genuine signature for
someone else's payment, which returns `404`.

The webhook passes no user, because Razorpay is not a customer; its authority is
the signature.

## Recovery when the browser never comes back

Three independent routes to a correct order, in order of speed:

1. **The callback** — immediate, and never trusted on its own.
2. **The webhook** — arrives regardless of what the browser did. **Verified**:
   with no callback at all, the webhook alone confirms the order, takes the
   stock and clears the cart.
3. **The status endpoint** — `GET /api/payments/orders/:orderRef/status`
   reconciles against Razorpay as part of answering. **Verified**: with neither
   a callback nor a webhook, simply asking for the status resolves the payment.

The confirming screen makes six checks about three seconds apart and then stops,
offering a manual refresh. It is not a polling loop that runs until the tab
closes, and there is no WebSocket.

## COD vs online, side by side

|                     | COD                      | Online                  |
| ------------------- | ------------------------ | ----------------------- |
| Order created       | immediately              | immediately, unpaid     |
| Stock               | taken at creation        | taken at payment        |
| Cart cleared        | at creation              | at payment              |
| Payment status      | `PENDING` until delivery | `PENDING` → `PAID`      |
| Order status        | `PENDING`                | `PENDING` → `CONFIRMED` |
| Gateway involved    | **never**                | yes                     |
| Customer can cancel | yes                      | yes while unpaid        |

`paymentMethod` defaults to `COD`, so a Phase 6 client keeps working unchanged.

## Cancellation

| Order          | Cancellable? | Stock restored?                |
| -------------- | ------------ | ------------------------------ |
| COD, pending   | yes          | yes — it was taken at creation |
| Online, unpaid | yes          | **no** — none was ever taken   |
| Online, paid   | **no**       | n/a                            |

A paid order is refused with a message pointing to support, rather than
cancelled. Cancelling a paid order means refunding it, and a refund the customer
was promised but did not receive is worse than a button that was never offered.
Customer-initiated refunds are a later phase; see Known limitations.

## API

| Endpoint                                    | Auth          | Purpose                                                       |
| ------------------------------------------- | ------------- | ------------------------------------------------------------- |
| `POST /api/payments/razorpay/create`        | cookie        | Open (or reuse) a Checkout session for one of your own orders |
| `POST /api/payments/razorpay/verify`        | cookie        | Hand back the callback for verification                       |
| `GET /api/payments/orders/:orderRef/status` | cookie        | Authoritative payment state, with one reconciliation pass     |
| `POST /api/payments/razorpay/webhook`       | **signature** | Razorpay's asynchronous notification                          |

There is deliberately **no refund endpoint**. The only refund this phase
performs is decided entirely on the server — which payment, how much and why all
come from the order. A route that took an order id, let alone an amount, would
be handing those decisions to the client.

`create` returns only `razorpayOrderId`, `keyId`, `amount`, `currency`,
`orderId`, `orderNumber` and prefill values. Never a secret.

## Setup

### 1. Razorpay Test Mode

1. Sign in at [dashboard.razorpay.com](https://dashboard.razorpay.com) and switch
   to **Test Mode** (top-left toggle).
2. **Account & Settings → API Keys → Generate Test Key.** Copy the key id
   (`rzp_test_...`) and the secret — the secret is shown **once**.
3. **Account & Settings → Webhooks → Add New Webhook.**
   - URL: `https://<your-host>/api/payments/razorpay/webhook`
   - Secret: any strong random string — this is what goes in
     `RAZORPAY_WEBHOOK_SECRET`, and it is **not** the API key secret.
   - Active events: `payment.captured`, `payment.failed`, `order.paid`.

   For local development, Razorpay needs a publicly reachable URL. Expose port
   5000 with a tunnel (`ngrok http 5000`, `cloudflared tunnel --url
http://localhost:5000`) and register that URL.

### 2. Environment

`backend/.env`:

```env
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxxxxxx
```

`frontend/.env.local`:

```env
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxxx
```

**All three backend variables, or none of them.** Configuring some but not
others fails validation at startup, because a key with no secret would create
payments it could never verify. Configuring none is a legitimate
cash-on-delivery-only deployment: checkout does not offer online payment, and
the server says so at startup rather than passing over it in silence.

A `rzp_live_` key outside `NODE_ENV=production` is refused, and a `rzp_test_`
key in production is refused — the two mirror-image mistakes are real money
moving and real customers paying into a sandbox.

### 3. Migration

Required once, on any database that has orders from Phase 6:

```bash
pnpm migrate:phase7
```

It backfills `stockCommitted` — `false` for already-cancelled orders, `true` for
every other, exactly matching Phase 6's behaviour — and creates the new indexes.
Without it, cancelling a pre-existing order would quietly fail to restore its
stock.

Additive and idempotent: it writes only where the field is absent, uses
`createIndexes` rather than `syncIndexes` so no existing index is dropped, and
running it twice changes nothing the second time.

### 4. Test cards

Test Mode only; no real money moves.

| Method        | Value                                             |
| ------------- | ------------------------------------------------- |
| Card          | `4111 1111 1111 1111`, any future expiry, any CVV |
| UPI (success) | `success@razorpay`                                |
| UPI (failure) | `failure@razorpay`                                |

## Testing

`backend/.verify-phase7/` is scaffolding for the verification run described in
the Phase 7 report and is not part of the shipped application. It boots the real
Express app against an **isolated database** (the configured database name plus
`_phase7verify`, on the same replica set so transactions behave identically) and
replaces only the far end of the Razorpay HTTP call — the SDK, ZyCart's service
layer, signatures, transactions and routes all run for real.

To reproduce it, or to write your own: the shape is a fake Razorpay installed as
the axios adapter the SDK already uses, plus a client that mints real session
cookies.

Manual end-to-end against Test Mode:

1. Sign in, add a product, go to `/checkout`.
2. Choose **Pay online**, press **Pay ₹…**.
3. Pay with `success@razorpay`. The order should land as `CONFIRMED` / `Paid`,
   stock should drop once, and the bought cart lines should disappear.
4. Repeat with `failure@razorpay`. The order should stay `PENDING` / `Payment
failed`, stock should not move, and the cart should be intact.
5. From the order page, press **Pay now** and succeed. One order, not two.
6. Close the Razorpay window mid-payment. "Payment cancelled", nothing charged.
7. Check the Razorpay dashboard's webhook delivery log; deliveries should be
   `200`, and redeliveries should be acknowledged as duplicates.

## Security guarantees

These are architectural properties, not recommendations:

- **`RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` are server-only.** They
  are read in one module, never returned by any endpoint, never logged, and
  never placed in a `NEXT_PUBLIC_` variable. Only `RAZORPAY_KEY_ID` — which
  Checkout needs in the browser — is public.
- **The payment amount is server-authoritative.** It is derived from the stored
  order, and no request body may contain an amount.
- **The payment status is server-authoritative.** The browser cannot set `paid`,
  `CONFIRMED` or `PAID`.
- **Browser callbacks are not trusted by themselves.** A callback is verified by
  signature and then checked against the Razorpay API for amount, currency,
  ownership and captured status.
- **Webhook signatures are verified against the raw request body**, before the
  payload is parsed and before any business logic runs.
- **No card number, CVV, OTP, UPI PIN or bank credential ever reaches ZyCart.**
  Razorpay Checkout collects them in its own window. What is stored is gateway
  identifiers, which are meaningless without the API secret.

## Known limitations

- **Customer-initiated refunds do not exist.** A paid order cannot be cancelled
  by the customer; it says so and points to support. The refund machinery here
  covers exactly one case — a captured payment that cannot be fulfilled — and is
  deliberately not generalised.
- **A failed automatic refund needs a human.** It is left in `REFUND_PENDING`
  with a log line naming the order and payment. There is no retry job, because a
  background scheduler is more infrastructure than this phase should introduce.
- **The confirming screen gives up after about twenty seconds** and offers a
  manual refresh. The webhook still resolves the order regardless.
- **Partial payments, EMI-specific flows, international cards and multi-currency
  are not handled.** ZyCart prices in INR only.
- **The rate limiters are per-process**, as in Phase 6. Behind a load balancer
  each instance counts separately.
- **Live webhook delivery from the Razorpay dashboard has not been exercised**
  in this environment — no credentials and no public tunnel were available. The
  endpoint has been verified against correctly-signed payloads delivered over
  real HTTP, including valid, forged, unsigned, duplicate, malformed and
  unknown-event cases.
