# Phase 18 — Coupons, Delivery & GST, Account Recovery, Newsletter, Lifecycle Email & Image Uploads

## Overview

Phase 17 closed with six features that were each half-present in the codebase:
a pricing function whose `shipping`, `discount` and `tax` were hard-coded to
zero, an `isEmailVerified` field nothing ever set, a newsletter form that
thanked the visitor and stored nothing, a transactional email layer carrying
four events, a login page with a "Forgot password?" that was greyed out, and a
product form that could only take pasted image URLs. This phase makes each of
them real:

| Feature              | What changed                                                                                                                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Coupons**          | Percentage or flat codes, with minimum order, validity window, a total usage limit and a per-customer limit. Applied at checkout, re-priced on the server at placement, managed and audited in the console.                                                        |
| **Delivery and GST** | A delivery charge below a free-delivery threshold. GST per category, extracted from GST-inclusive prices, frozen on every order line. A printable **tax invoice** — CGST + SGST within the seller's state, IGST outside it — numbered gap-free per financial year. |
| **Account recovery** | Forgot/reset password and email verification by single-use link.                                                                                                                                                                                                   |
| **Newsletter**       | A real subscriber list with double opt-in, signed unsubscribe links, and a CSV export for the store's campaign tool.                                                                                                                                               |
| **Lifecycle email**  | Seven new messages: order confirmed, payment failed, abandoned cart, welcome, verify email, password reset, newsletter confirmation.                                                                                                                               |
| **Image uploads**    | Product photos uploaded from the product form to local disk (development) or Cloudinary (production).                                                                                                                                                              |

Nothing here reopens a boundary an earlier phase established. The total a
customer is charged is still computed on the server and nowhere else; email is
still recorded in the business transaction and sent after it; every
administrative change is still audited with a verified actor.

---

## Pricing

### One function prices both the preview and the order

`services/pricing/pricing.ts` exports `priceOrder(lines, discount)`. The
checkout summary calls it to show a total; `createOrder` calls it again, with
lines re-read from the catalogue and the coupon re-evaluated, to write the
total the customer is charged. The two cannot drift because there is one
implementation. It is pure — no database, no clock — and exhaustively tested.

### GST is inside the price

Indian retail prices are quoted inclusive of all taxes, and ZyCart's catalogue
prices have always been the prices customers pay. So GST is _extracted_:

```
total = subtotal − discount + shipping      (whole rupees — what is charged)
tax   = the GST contained in that total     (to the paisa — what is reported)
```

Phase 6 carried `tax` as an additive term, anticipating the opposite. Every
order written before this phase has `tax: 0`, so the formulas agree on all of
them and **no stored total changes meaning**. The payment boundary's
`assertOrderTotalIntact` now uses `totalOf()` — the single statement of the
formula — and additionally checks that the per-line discount shares sum to the
order's discount.

The return policy's `refundableUnitPrice` used to add a proportional share of
`pricing.tax` back to a refund. With inclusive GST that would refund the tax
twice — the unit price already contains it — so the add-back is gone. The
discount is still taken off proportionally, exactly as before.

### Paise, and the one place they are allowed

Everything charged stays in whole rupees. GST extracted from a whole-rupee
price is rarely whole, and an invoice may not round it away, so the two tax
figures (`pricing.tax`, `pricing.shippingTax`) and each line's `taxableValue`
and `taxAmount` are carried to the paisa. They are computed in integer paise,
converted once, and never feed back into anything charged.

### Delivery

`config/commerce.ts`: goods worth `FREE_SHIPPING_THRESHOLD` (₹999) or more ship
free; below that, `STANDARD_SHIPPING_FEE` (₹99). The threshold is measured
**after** the discount — a coupon that takes a ₹1,050 basket to ₹850 has taken
it below the line. These are constants, not environment variables, for the
reason `LOW_STOCK_THRESHOLD` is: a preview deployment and production must not
charge different delivery fees. The storefront's marketing copy repeats ₹999,
and `frontend/lib/cart.ts` repeats both numbers for the cart page's estimate;
checkout reads the server's `shippingPolicy` instead.

Delivery charged with goods is a mixed supply under the CGST Act, so its GST
rate is the **highest rate in the basket**.

### GST rates

A category carries `gstRate` (one of `GST_RATES`: 0, 0.25, 3, 5, 12, 18, 28, 40)
and an optional `hsnCode`. A category with no rate follows `DEFAULT_GST_RATE`
(18%) through `gstRateOf`, so the catalogue needs no migration. Every order line
copies its rate and HSN code at purchase; changing a category's rate affects
orders placed afterwards only.

Rates per _price band_ — apparel and footwear at 5% up to ₹2,500 a piece and 18%
above — are not modelled: the rate is per category. A store selling across the
band splits the category.

---

## Coupons

### The rules are pure; the service makes them safe

`services/coupons/coupon-rules.ts` decides what a code is worth and whether it
applies, over plain values with the clock passed in. `coupon.service.ts` loads,
counts and writes around those rules.

Refusals are ordered by what a customer can act on last: switched off, expired,
used up, not started, customer's own allowance used, below the minimum. A
percentage is floored; a discount never exceeds the goods.

### When a use is counted

A redemption is written when the order **commits** — the same rule stock
follows:

- **Cash on delivery** commits at placement, so the coupon is redeemed in the
  `createOrder` transaction, **with limits enforced atomically**: the usage
  limit rides in the update's own filter, and every redemption increments
  `Coupon.usedCount`, which forces concurrent redemptions of the same coupon to
  serialise on one document — so the per-customer count taken after it is
  reliable.
- **Online payment** commits at finalisation, so the coupon is redeemed in the
  finalisation transaction — **without** enforcing limits. The customer has
  already paid the discounted price; refunding a captured payment over a
  promotion would punish a customer for the store's race. A limit can therefore
  be exceeded by at most the number of payments genuinely in flight when the
  last use went, and each such case is logged as `coupon_overredeemed`.

To stop one customer opening two online checkouts with a single-use code, their
own **unpaid online orders** count towards their allowance at placement. The
unpaid order can be paid for, or cancelled from the orders page.

### Giving a use back

Cancelling an order releases its redemption (`releasedAt`) and decrements
`usedCount`, in the cancellation's transaction. Idempotent, and a no-op for an
online order cancelled before it was paid. Returns do not release a use: the
order happened.

### What the order keeps

`Order.coupon` is a snapshot — code, description, type, value, discount — so
editing or deleting the coupon later changes nothing an order says. A used
coupon cannot be deleted, only switched off. The code itself is immutable.

---

## Tax invoices

`GET /api/orders/:orderRef/invoice` (owner) and
`GET /api/admin/orders/:orderRef/invoice` (console) return the same document,
built by `buildInvoice` from the order alone. The storefront renders it at
`/invoice/[orderRef]`, laid out for A4; **Print or save as PDF** uses the
browser's own print dialog, which is how a customer gets a PDF.

- **Numbering.** `ZY/26-27/000042`: GST requires a consecutive serial number,
  unique within a financial year, at most 16 characters. Numbers are drawn from
  a `Counter` document (`invoice:2026-27`) **inside the transaction that marks
  the order SHIPPED** — GST dates a supply of goods from their removal — so a
  rolled-back shipment gives its number back and cancelled orders never burn
  one. The financial year is reckoned in IST.
- **CGST/SGST or IGST.** The seller's state comes from the first two digits of
  `STORE_GSTIN` (or `STORE_STATE`); the buyer's from the free-text address,
  resolved by `indian-states.ts` (names, old names, vehicle codes, GST codes).
  Intra-state only when both are known and equal; anything unresolvable is
  treated as inter-state — the correctable direction to be wrong in.
- **Arithmetic.** In integer paise. An odd paisa of intra-state tax goes to
  CGST so the halves always sum to the whole, and taxable value plus tax equals
  the invoice total exactly — `tests/commerce.test.ts` asserts both.
- **Availability.** Only once the order has shipped, and only for orders with a
  tax breakdown. Orders placed before this phase get a clear refusal rather
  than an invoice reconstructed from today's rates.
- **No GSTIN.** The document is titled _Invoice_, not _Tax Invoice_, and says
  why. Readiness warns about it in production.

Credit notes for returns are not generated in this phase.

---

## Account recovery and verification

### Tokens

`AccountToken` stores the **SHA-256** of a 32-byte random token, a purpose
(`PASSWORD_RESET` | `EMAIL_VERIFICATION`), an expiry and `consumedAt`. The raw
token exists in exactly one email. Redemption is one conditional update with
purpose, expiry and "not yet used" in the filter, so two racing requests cannot
both succeed; every failure returns the same message. Issuing a new link retires
the account's older ones for the same purpose. `expiresAt` is also a TTL index,
for housekeeping only — the expiry is enforced in the query.

### The token never touches the delivery record

A reset link _is_ the reset. Storing it in the notification payload would undo
storing only its hash. So a template may now declare `secrets` (a Zod schema);
the value rides the `NotificationOutbox` **in memory** from the request that
minted it to the send, and the stored payload never contains it. The cost is
deliberate: such a message cannot be re-sent from the console or by the drain —
`retryability` says so, the drain skips it, and a message this request could not
get out is closed as FAILED with a reason telling the operator the customer can
simply ask again.

### Flows

- **Register** → the account is created exactly as before, then a verification
  link is sent. A mail failure never fails the sign-up.
- **Verify** (`POST /api/auth/verify-email`) needs no session — the link is
  often opened on another device — and sends **WELCOME** once per account, in
  the same transaction.
- **Forgot** (`POST /api/auth/forgot-password`) answers identically whether or
  not the address has an account. It is not hardened against timing, because
  registration already reveals whether an address exists with a 409. A
  per-account 60-second cooldown stops inbox flooding from many IPs.
- **Reset** (`POST /api/auth/reset-password`) sets the password, moves
  `passwordChangedAt` (ending every existing session), marks the address
  verified, retires other outstanding reset links, and signs this browser in.

Verification gates nothing. Accounts from before this phase are unverified;
the account area shows a banner with **Send again** until they verify.

---

## Newsletter

- `POST /api/newsletter/subscribe` records the address as **PENDING** and sends
  one confirmation (double opt-in). The answer is identical whatever the
  address's history. A 10-minute per-address cooldown and a per-IP limit stop
  the public form being used to mail strangers.
- `POST /api/newsletter/confirm` redeems the link (hash stored, 48 h, idempotent
  while live).
- `POST /api/newsletter/unsubscribe` takes a **signed link** — HMAC over the
  subscriber id and purpose, keyed with `JWT_SECRET`, compared in constant
  time. No session: a subscriber may have no account.
- An unsubscribed address that is entered again must confirm again, so nobody
  can re-subscribe somebody else.

ZyCart does **not** send campaigns. The console's **Export CSV** gives the
confirmed list, with each row's own `unsubscribe_url` so the campaign tool can
place it in every email and leaving still reaches this list. Cells are quoted
and formula-neutralised, since an address is attacker-chosen text opened in a
spreadsheet. Keeping marketing volume off the transactional mail account is
deliberate: a spam complaint about a promotion must not cost the store its
shipping notices.

---

## Lifecycle email

| Event                     | Raised by                                               | Key                                    |
| ------------------------- | ------------------------------------------------------- | -------------------------------------- |
| `ORDER_PLACED`            | COD placement / online finalisation, in the transaction | `ORDER_PLACED:<order>`                 |
| `PAYMENT_FAILED`          | reminder job, 30 min after an unretried failure         | `PAYMENT_FAILED:<order>`               |
| `ABANDONED_CART`          | reminder job, cart untouched 3 h                        | `ABANDONED_CART:<cart>:<version>`      |
| `WELCOME`                 | email verification                                      | `WELCOME:<user>`                       |
| `EMAIL_VERIFICATION`      | registration, resend                                    | `EMAIL_VERIFICATION:<token id>`        |
| `PASSWORD_RESET`          | forgot password                                         | `PASSWORD_RESET:<token id>`            |
| `NEWSLETTER_CONFIRMATION` | newsletter sign-up                                      | `NEWSLETTER_CONFIRMATION:<sub>:<time>` |

`NotificationIntent` gained `keyReference` for events an entity can raise more
than once, and may address a **subscriber** instead of a user — resolved from
the subscriber record by id, so no caller can nominate an address. The render
shell gained a per-message `footer` so a password reset does not claim "you
placed this order with us".

### Why two messages come from a job

"Payment failed" and "you left something in your cart" are about something
that did **not** happen, so no request marks the moment to send them.
`pnpm reminders:send` sweeps for both, bounded by `--limit`, and exits — the
drain's shape, scheduled by cron:

```
*/15 * * * * cd /srv/zycart && pnpm reminders:send >> /var/log/zycart-reminders.log 2>&1
```

A payment reminder waits 30 minutes because most failures are retried within
one, and "your payment failed" beside a confirmation is worse than silence; the
order is re-read inside the transaction first. A cart reminder names only items
that can still be bought, prints no prices (they are read live, and an email
cannot be corrected), and is sent at most once per change to the cart and three
days apart. It is the only optional message ZyCart sends: every one carries a
signed **Stop cart reminders** link, and the account settings have the same
switch. Opt-out pages ask for a click before acting, so a mail scanner that
previews links cannot opt anybody out.

---

## Image uploads

`POST /api/admin/uploads/images` takes the image itself as the body —
`Content-Type: image/…`, raw bytes, one per request — and answers with its URL.
The raw parser is mounted on that route only, after the admin guard, with a
5 MB limit, and rate-limited per administrator.

- **The type is read from the bytes.** JPEG, PNG, WebP, GIF and AVIF by magic
  number; SVG and anything else is refused (415). The stored name is random
  with the sniffed extension, so nothing the uploader named survives.
- **`UPLOAD_PROVIDER=local`** writes to `backend/uploads/products` and serves it
  from `/api/uploads` with `Cross-Origin-Resource-Policy: cross-origin` (so the
  storefront on another port can render it) and a `sandbox` CSP. It is not
  mounted at all under Cloudinary.
- **`UPLOAD_PROVIDER=cloudinary`** uploads server-side with a signed request.
  The API secret is an input to a SHA-1 and nothing else — registered with the
  log redactor, never sent, never returned. Cloudinary's error text is not
  passed on.

Nothing is attached to a product by an upload. The URL joins the form's image
list, and becomes catalogue data when the product is saved — the change the
audit trail records. Readiness warns about `local` in production: a
serverless deployment's disk does not outlive the request.

---

## Data model

New collections: `Coupon`, `CouponRedemption` (unique on `order`),
`AccountToken` (unique `tokenHash`, TTL on `expiresAt`), `Subscriber` (unique
`email`), `Counter`.

Changed, all additive with defaults — **no migration**:

- `Order.items[]`: `discountShare`, `gstRate`, `hsnCode`, `taxableValue`, `taxAmount`
- `Order.pricing`: `shippingTax`, `shippingGstRate`
- `Order`: `coupon` (snapshot), `invoice` (`number`, `issuedAt`; unique partial index)
- `Category`: `gstRate`, `hsnCode`
- `User`: `emailPreferences.cartReminders`
- `Cart`: `reminderHandledAt`
- `NotificationDelivery`: seven events, three entity types, `user` optional, `subscriber`
- `AuditLog`: `COUPON_CREATED`, `COUPON_UPDATED`, `COUPON_DELETED`; entity `COUPON`

`pnpm seed` sets illustrative GST rates on the seed categories and inserts two
coupons (`WELCOME10`, `FLAT200`) if absent — never replacing one, so re-seeding
cannot reset a used coupon's count.

---

## Configuration

| Variable                                                               | Default                  | Purpose                                                        |
| ---------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------- |
| `STORE_LEGAL_NAME`                                                     | `ZyCart`                 | Seller name on invoices                                        |
| `STORE_GSTIN`                                                          | none                     | Makes invoices _tax_ invoices; gives the seller's state        |
| `STORE_ADDRESS`                                                        | none                     | Seller address, lines separated by `\|`                        |
| `STORE_STATE`                                                          | none                     | Seller's state when there is no GSTIN                          |
| `UPLOAD_PROVIDER`                                                      | `local`                  | `local` or `cloudinary`                                        |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | none                     | Required as a set with `cloudinary`; the secret is server-only |
| `CLOUDINARY_FOLDER`                                                    | `zycart/products`        | Upload folder                                                  |
| `API_PUBLIC_URL`                                                       | `http://localhost:$PORT` | Origin for locally stored image URLs                           |

---

## Testing

`backend/tests/commerce.test.ts` and `backend/tests/accounts.test.ts` add 59
tests: inclusive-tax extraction, delivery thresholds after discount, allocation
that always sums exactly, whole-rupee charges, every coupon refusal and its
order, validator cross-field rules, financial-year boundaries in IST, invoice
number format, state resolution, CGST/SGST splitting, amount in words, invoice
totals adding up to the paisa, token entropy and hashing, signed-link tampering
and purpose separation, secret-bearing templates refusing to render without
their link, footer wording, opt-out links restricted to the store's origin,
magic-byte sniffing (and refusing SVG/HTML), Cloudinary's documented signature
vector, reminder CLI parsing and CSV formula neutralisation. The Phase 13 refund
test that expected tax to be added back now asserts the opposite.

One of them earned its place during this phase. The payment boundary's total
check once spread `order.pricing` — a Mongoose subdocument — into a plain
object, which copies internals rather than fields; every total became NaN and
every online payment would have been refused. `pnpm payments:verify` caught it,
and `commerce.test.ts` now builds real Mongoose documents to assert the check,
so a plain-object fixture can never hide that class of bug again.

What needs a replica set — a coupon's limit holding under concurrent orders, an
invoice number drawn once per shipment — rests on the database constructs
described above (write conflicts on one document, counters inside the
transaction) and is not yet exercised by a `verify` script.

## Known limitations

- GST is per category, not per price band.
- No credit notes for returns; the invoice records the sale as made.
- Coupons have no category or product restrictions and no free-delivery type.
- The newsletter list is exported, not mailed from ZyCart.
- Reminder emails require `pnpm reminders:send` to be scheduled.
