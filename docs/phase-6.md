# Phase 6 — Checkout & Orders

## Goal

Turn a cart into an order: checkout, order creation, history, detail and
cancellation, paid on delivery.

```text
Cart → Checkout → Address → Place order → Order → History → Cancel
                                 │
                          one transaction:
                    validate · snapshot · take stock ·
                       write order · clear cart
```

## The central decision: an order is a snapshot

An order does not point at the catalogue; it copies from it.

Every field the order page will ever render — product name, image, SKU, brand,
unit price, line total, chosen variant, and the whole shipping address — is
written onto the order at creation. The `product` reference is kept as well, but
purely for later analytics: **nothing on the order page reads through it.**

That is what makes these true:

- renaming or repricing a product does not rewrite what someone paid;
- deleting a product does not break, blank or crash their order history;
- editing or deleting an address does not change where a past order went.

Verified by doing exactly that: an order was placed, its products were renamed,
repriced from ₹1,200 to ₹99,999, and then **deleted outright** — the order still
reads `ZZ P6 Widget ×3 @1200 = 3600`, SKU and all.

## Money

Whole rupees, as integers, everywhere: API → database → calculations → UI.

Every price in the catalogue is an integer and every quantity is an integer, so
`subtotal = Σ(unitPrice × quantity)` is exact integer arithmetic. **No floating
point value is ever produced**, so none can drift. Phase 6 tightened the product
validator to reject non-integer prices, which turns that from a convention into
an invariant.

Sub-rupee amounts would mean migrating to paise; nothing in the catalogue needs
them today, and the migration is a data change rather than an architectural one.

## Pricing policy

| Component | Phase 6 value | Why                                |
| --------- | ------------- | ---------------------------------- |
| Subtotal  | Σ line totals | Current server-side product prices |
| Shipping  | `0`           | No carrier integration exists yet  |
| Discount  | `0`           | No coupon engine exists yet        |
| Tax       | `0`           | No tax engine exists yet           |
| Total     | subtotal      |                                    |

The zeroes are **stored explicitly** rather than omitted, so the phases that
introduce shipping, discounts and tax change the values without changing the
shape of a single order.

The interface says so plainly — shipping and taxes read "Not yet calculated",
never a fabricated figure the customer would later be charged differently for.

## Inventory: one transaction, atomic decrements

Order creation runs inside a **MongoDB transaction** — the Atlas deployment is a
replica set, and rollback was verified before the design was settled.

Stock is taken with a conditional update rather than a read followed by a write:

```js
Product.findOneAndUpdate(
  { _id, isActive: true, stock: { $gte: quantity } },
  { $inc: { stock: -quantity } },
  { session },
);
```

The sufficiency check and the decrement are one operation, so two customers
racing for the last unit cannot both succeed — the second update matches
nothing. The transaction then covers the whole sequence, which is what rules out
the two states nobody ever wants:

- an order created with no stock taken;
- stock taken with no order created.

**Verified live.** Two customers, 2 units in stock, both ordering 2, fired
simultaneously: one got `201`, the other `409 Only 0 left`, stock landed on
exactly `0` and never went negative.

Cancelling restores stock in its own transaction. Restoring is an unconditional
`$inc` — unlike taking stock, giving it back can never fail for lack of it.

## Cart is stricter at checkout than in the cart

|                      | Cart (phase 5)         | Order creation (phase 6) |
| -------------------- | ---------------------- | ------------------------ |
| Quantity above stock | clamped, with a notice | **rejected**             |
| Withdrawn product    | shown as unavailable   | **rejected**             |
| Invalid variant      | shown                  | **rejected**             |

An order must be exactly what the customer agreed to, so nothing is silently
adjusted. A rejection returns a message naming the product and what changed, and
the checkout page lists every blocker with a link back to the cart.

**The cart is only emptied inside the successful transaction**, and only the
lines that were actually bought are pulled — by id, so anything added in another
tab mid-checkout survives. A failed order leaves the cart exactly as it was;
verified on both the insufficient-stock and withdrawn-product paths.

## Order lifecycle

```text
PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED
   └──────────┴── CANCELLED
```

Cancellation is allowed from `PENDING` and `CONFIRMED` only. `SHIPPED`,
`DELIVERED` and an already-cancelled order all return `409` with a message
saying why. Returns and refunds are a later phase.

Payment is `COD` with status `PENDING` and stays that way: nothing was charged,
so nothing is claimed. `PAID`, `FAILED` and `REFUNDED` already exist in the enum
so a gateway can be added without touching the order model.

## Order number

`ZYC-20260919-KB8E` — brand, date, four random characters.

The alphabet excludes `I`, `O`, `0` and `1`, because an order number gets read
down a phone line and typed back in. The random suffix avoids leaking how many
orders the shop has taken, which a sequence would. Uniqueness is guaranteed by a
unique index; creation retries on collision.

## Endpoints

| Method | Path                           | Auth | Purpose                        |
| ------ | ------------------------------ | ---- | ------------------------------ |
| `GET`  | `/api/checkout/summary`        | ✓    | Live cart, addresses, blockers |
| `GET`  | `/api/orders`                  | ✓    | Paginated history              |
| `POST` | `/api/orders`                  | ✓    | Place the order                |
| `GET`  | `/api/orders/:orderRef`        | ✓    | One order, by number or id     |
| `POST` | `/api/orders/:orderRef/cancel` | ✓    | Cancel and restore stock       |

`GET /api/orders` takes `page`, `limit` (max 50) and `status`, and returns a
deliberately light row — number, status, item count, total, and up to three
preview thumbnails. Full items live only on the detail endpoint.

**Ownership is part of the query, not a check afterwards.** Every order lookup
filters on the authenticated user, so another customer's order is simply not
found — the response cannot distinguish "someone else's" from "does not exist".
No endpoint accepts a `userId`, and `POST /api/orders` accepts only an
`addressId`: there is no field through which a client could suggest a price.

## Routes

| Route                               | What it is                             |
| ----------------------------------- | -------------------------------------- |
| `/checkout`                         | Address, payment, review, place order  |
| `/order-confirmation/[orderNumber]` | Confirmation, read back from the API   |
| `/account/orders`                   | History with status filters and paging |
| `/account/orders/[orderNumber]`     | Full order, timeline, cancellation     |

All four are protected twice: the proxy turns away a visitor with no cookie and
preserves their destination, and each page then resolves the session properly —
an expired or forged cookie gets no further than that.

The confirmation page **fetches the stored order** rather than rendering
checkout state. The customer is being told their order exists, so what they see
has to be the order that does.

## Duplicate submission

Handled without an idempotency layer, because the architecture already prevents
it: the button disables on submit, and the cart is emptied inside the same
transaction that creates the order — so a second submission finds an empty cart
and is refused. Under a genuine race the second transaction either conflicts or
sees the cart already emptied.

## Known limitations

**No inventory reservation.** Stock moves when the order is created, not when
checkout opens. Between opening checkout and placing the order someone else can
take the last unit — which is exactly the case the conditional decrement turns
into a clear `409` rather than an oversell.

**Order status is not customer-advanceable.** There is no admin surface yet, so
orders stay `PENDING` until something moves them. The lifecycle and the timeline
are in place for when that exists.

**`notFound()` answers with HTTP 200.** Viewing an order that is not yours
renders the not-found page and leaks no order data — no address, no total, no
items — but the status line says `200`. This is the Next.js 16.3.5 streaming
behaviour documented in [phase 3](phase-3.md#known-limitations).

**Partial-cart retention is by construction, not by test.** The order pulls cart
lines by explicit id rather than clearing the cart, so a line added mid-checkout
survives; the timing window itself was not simulated.
