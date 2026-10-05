# Phase 20 — Stock per Variant, Back-in-Stock & Price-Drop Alerts

## Overview

Until now a product held one count. A shoe sold in two colourways and five sizes
had "31 in stock" and a flag per size saying whether that size was available —
so the shop could not tell size 9 in white from size 9 in pastel, and a customer
could order a combination that did not physically exist on the shelf.

Phase 20 does two things:

1. **Stock per colour and size.** A product may list `variants` — each one a
   `(color, size)` pair with its own count. Checkout takes units from the
   variant the customer chose, cancellations and resellable returns put them
   back there, and the console adjusts them one variant at a time, each
   change in the ledger as before.
2. **Back-in-stock and price-drop alerts.** A signed-in customer can ask to be
   told when a product — or the one colour and size they wanted — is back, or
   when its price drops below what they saw. They hear about it once, by email,
   through the Phase 14 outbox.

A product that does not list variants behaves exactly as it did before. Nothing
was split automatically.

## Stock per variant

### The model

```text
Product
  stock     40                  ← still "how many can this shop sell": the SUM
  variants  [
    { _id, color: 'Black', size: 'UK 9',  sku: 'ZY-FTW-002-BLACK-UK-9',  stock: 3 },
    { _id, color: 'White', size: 'UK 9',  sku: 'ZY-FTW-002-WHITE-UK-9',  stock: 0 },
    …
  ]
```

- **`Product.stock` stays.** It is the total, equal to the sum of the variants,
  and every write moves the total and the variant in one atomic update. So every
  screen that reads `stock` as "how many can we sell" — the listing filters, the
  low-stock panel, the dashboard, the cards, the inventory list — needed no
  change and stays right.
- **A variant is found by its pair.** Cart, order and return lines have recorded
  the chosen colour and size since Phase 5. Matching on that pair means none of
  them needed a new field, an order placed before a product was split still
  finds its variant when cancelled, and a request can never name a variant id
  the server did not offer. The console, which edits rows of a table, uses the
  variant's `_id`.
- **A combination that is not listed is not sold.** On a product with colours
  and sizes, every variant names both; on one with only sizes, `color` is null
  on every variant. A request that names an axis the product lacks matches
  nothing.
- **Size availability is derived.** On a variant product, `sizes[].inStock` is
  true exactly when some variant of that size has units, rewritten in the same
  transaction as every variant write. It stays stored because the size filter,
  the assistant's tools and the cards already read it.

### One writer

`writeStock` in `backend/src/services/inventory/variant-stock.ts` is the only
code that changes `stock` or a variant's count. The five paths that move stock
call it inside their own transactions and write their own movement:

| Path                | Where             | Movement          |
| ------------------- | ----------------- | ----------------- |
| `commitStock`       | `order.service`   | SALE              |
| `applyCancellation` | `order.service`   | CANCELLATION      |
| `createProduct`     | `product.service` | INITIAL_STOCK     |
| `adjustStock`       | `inventory`       | MANUAL_ADJUSTMENT |
| `restockFromReturn` | `inventory`       | RETURN            |

It reads the product first to learn which bucket to move, then performs one
`findOneAndUpdate` whose filter carries every guard:

```js
// a variant: the floor is on the variant's own count
{ _id, isActive: true, variants: { $elemMatch: { _id: variantId, stock: { $gte: 2 } } } }
{ $inc: { stock: -2, 'variants.$[target].stock': -2 } }

// a product without variants: and it must *still* have none
{ _id, 'variants.0': { $exists: false }, stock: { $gte: 2 } }
{ $inc: { stock: -2 } }
```

The read is not the guard. A product that ran out or changed shape between the
read and the write is caught by the update matching nothing, and the write
reports why — `missing_product`, `missing_variant`, `insufficient` or `stale` —
as a value, so each caller says it in its own words: checkout says "sold out
while you were checking out", the console says "refresh and count again", and a
cancellation for a variant that has since been removed logs
`inventory_not_restored` and keeps going, as it already did for a deleted
product.

### The ledger

`quantityBefore` and `quantityAfter` on a movement are still the product's
total, so every product's ledger is one unbroken chain and the Phase 12
continuity check works unchanged. A movement that changed a variant also carries
that variant's SKU and its own before and after:

```text
SALE  −1   Total 40 → 39   ·   Black · Size UK 9  (ZY-FTW-002-BLACK-UK-9)  3 → 2
```

### Editing variants never moves a unit

The product form describes which combinations are sold. `planVariantEdit`
decides what saving it does, and refuses anything that would change the total
without a ledger entry:

| The product…                    | The form…                    | Result                                                               |
| ------------------------------- | ---------------------------- | -------------------------------------------------------------------- |
| holds one count                 | lists variants with counts   | **Split.** Counts must add up to exactly what it holds, or 400       |
| has variants                    | keeps a combination          | Its count is kept; sending a different count is refused              |
| has variants                    | adds a combination           | Starts at zero; restock it from the console                          |
| has variants                    | drops a combination          | Allowed only once it holds nothing; otherwise 409                    |
| has variants                    | sends `variants: []`         | **Merge.** One count again, total unchanged                          |
| has variants                    | edits colours or sizes       | Refused if a variant would name an option the product no longer has  |

A colour renamed from "Black" to "Midnight" is a removal and an addition: a pair
of shoes does not change colour because a label did.

Because the new list is built from the counts as they are *now*, the read and
the write run in one transaction — a sale landing in between makes the save
conflict and retry rather than writing back a stale count.

### What the migration does not do

`pnpm migrate:phase20` creates the alert indexes and gives products an empty
`variants` list. It does **not** split anybody's stock: a product holding 40
pairs has no record of how many are size 9, and dividing by five would put a
guess into the ledger as though it had been counted. An operator splits a
product from its edit page, entering what they actually have.

`pnpm seed` now seeds two products with real per-variant counts — the
**Air Force 1 Pastel Edit** and the **Heavyweight Essential Tee** — each with
a couple of sold-out combinations to try the alerts against.

## Alerts

### What a customer can ask for

| Alert           | About                                         | Answered when                                                |
| --------------- | --------------------------------------------- | ------------------------------------------------------------ |
| `BACK_IN_STOCK` | the product, or one colour-and-size of it      | it can be bought — that combination, or anything in it       |
| `PRICE_DROP`    | the product                                   | its price is below the price when asked, **and** it can be bought |

- **Once.** An answered alert becomes `NOTIFIED`. To hear about the next
  restock, the customer asks again. A standing subscription that mailed on every
  restock would be a mailing list, which Phase 14 deliberately is not.
- **The reference price is the server's.** `priceAtCreation` is copied from
  the catalogue when the alert is created; the API refuses a price in the body.
- **No alert for something buyable now.** Asking to be told when an in-stock
  item is back answers 409 with "add it to your cart".
- **Asking twice is harmless.** A partial unique index on active alerts makes
  the second request return the first.
- At most 50 waiting alerts per account.

### How an alert reaches an inbox

```text
customer asks          POST /api/alerts               → ProductAlert (ACTIVE)

operator restocks      adjust / price edit / return  ─┐
customer cancels       cancellation                    ├→ processAlerts(productIds)   after commit, not awaited
cron                   pnpm alerts:send               ─┘   processAlerts(all)

processAlerts          per product with active alerts:
                         read product once
                         cursor over its ACTIVE alerts
                         for each answered one, in a transaction:
                           re-read alert + product + account
                           ACTIVE → NOTIFIED            (conditional: one winner)
                           queueNotification            key BACK_IN_STOCK:<alertId>
                       outbox.flush                     after every commit
```

**Why not raise the message inside the stock write**, as Phase 14 does for
"your order shipped"? Because one restock can answer hundreds of alerts, and
that fan-out does not belong in the transaction that moved the units. Checkout
must not get slower because many people wanted the same shoe.

**Why two triggers.** Straight after an operator restocks, reprices or receives
a resellable return, the console runs the sweep for that product without
waiting for it — so the email arrives within seconds in the common case. Cron
runs it for everything: cancellations' returned units, a sweep a restart
interrupted, a product reactivated later. The first is the courtesy, the second
is the guarantee.

**Why it is driven by products.** Thousands of alerts on a product that is
still sold out cost one read of that product. An answered alert can never be
starved behind unanswered ones that sort first, and the run's `limit` counts
only alerts it actually answered.

**Why running it twice is harmless.** The claim — `ACTIVE → NOTIFIED`,
conditional on `ACTIVE` — and the message intent are in one transaction, and
the message key is the alert's id. Two sweeps racing over one product send one
email per alert.

An account an administrator has switched off is not sent alerts; its alerts
wait rather than being spent.

### The messages

`back-in-stock` names the product and the option and links to it, with no
price — a price in an email goes stale and cannot be corrected. `price-drop`
does print both prices, because there the price *is* the news, and says they
were correct when sent. Its schema refuses a "drop" that is not one.

## API

| Method   | Path                              | Auth  | Purpose                                                  |
| -------- | --------------------------------- | ----- | -------------------------------------------------------- |
| `GET`    | `/api/alerts`                     | ✓     | The customer's alerts; `?productId=` for one product      |
| `POST`   | `/api/alerts`                     | ✓     | `{ productId, type, selectedColor?, selectedSize? }`      |
| `DELETE` | `/api/alerts/:alertId`            | ✓     | Remove one of the customer's own alerts                  |
| `POST`   | `/api/admin/inventory/:id/adjust` | admin | Now takes `variantId`; required for a variant product    |

Product create and update accept `variants`; create's `stock` is optional when
variants are given. Product JSON carries `variants` everywhere it carries
`sizes`.

## Commands

| Command                  | Effect                                                                 |
| ------------------------ | ---------------------------------------------------------------------- |
| `pnpm migrate:phase20`   | Create alert indexes; give products an empty `variants` list           |
| `pnpm alerts:send`       | Answer stock and price alerts — schedule it (`--help`, `--dry-run`)    |

```cron
*/15 * * * * cd /srv/zycart && pnpm alerts:send >> /var/log/zycart-alerts.log 2>&1
```

## Where it lives

| File                                                        | What                                                        |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| `backend/src/services/inventory/variant-stock.ts`           | Matching, planning, the atomic `writeStock`                 |
| `backend/src/models/product.model.ts`                       | `variants`                                                  |
| `backend/src/models/inventory-movement.model.ts`            | Per-variant before/after on a movement                      |
| `backend/src/models/product-alert.model.ts`                 | Alerts                                                      |
| `backend/src/services/alerts/alert.service.ts`              | Creating, listing, the sweep, the post-commit dispatch      |
| `backend/src/services/notifications/templates/back-in-stock.ts`, `price-drop.ts` | The two messages                       |
| `backend/src/utils/send-alerts.ts`, `migrate-phase20.ts`    | The commands                                                |
| `frontend/lib/variants.ts`                                  | The same matching rules, in the browser                     |
| `frontend/components/product/*`                             | Picker, purchase panel, alert buttons                       |
| `frontend/app/(storefront)/account/alerts`                  | The customer's alerts                                       |
| `frontend/components/admin/product-form.tsx`                | The variant editor                                          |
| `frontend/app/admin/inventory/[id]`                         | Per-variant counts and adjustments                          |

## Testing

`tests/variants.test.ts` and `tests/alerts.test.ts` run without a database, the
same choice the Phase 12 tests make. They assert the atomic filters' guards —
the floor sits on the variant's own count, a product-level write requires the
product still to have no variants — every refusal the variant planner makes,
when an alert is answered, what the alert API accepts, and that both messages
render and refuse a malformed payload.

```bash
cd backend && pnpm test
```

## Known limitations

- **No per-variant price.** A variant has its own count and SKU, not its own
  price. A product whose sizes cost different amounts is still two products.
- **No per-variant threshold.** A variant is "low" against its product's
  low-stock threshold.
- **No per-variant images.** As Phase 19 noted, the catalogue has one set of
  photos per product.
- **The assistant does not reason about variants.** It sees each size's derived
  availability and is told when a combination is sold out at add-to-cart time,
  but it is not handed the per-colour counts.
- **The immediate dispatch is best-effort.** It runs in the API process after
  the response; on a host that freezes the process between requests it may not
  finish. `pnpm alerts:send` must be scheduled for alerts to be reliable.
- **Price alerts compare against one price.** There is no target price; any
  drop below the price at the time of asking answers it.
