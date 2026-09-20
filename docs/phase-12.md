# Phase 12 — Admin Operations, Inventory Intelligence & Fulfilment

## Goal

Phase 9 gave ZyCart an admin console: screens for products, orders, customers
and reviews, each one a competent CRUD surface over a collection. What it could
not do was answer an operational question.

`Product.stock` moved whenever an order was placed and whenever one was
cancelled — and it moved again whenever somebody typed a different number into
the product form. Nothing recorded which of those had happened, by how much, why
or who did it. An operator looking at a product with 12 units had no way to find
out whether it had started at 40 and sold 28, or started at 12, or been
corrected twice last Tuesday by a colleague who no longer remembered.

So this phase is not "an inventory screen". It is the record that makes the
number on that screen mean something, plus the operational surfaces that record
makes possible.

Three things were built:

1. **An inventory ledger.** Every change to stock now writes an
   `InventoryMovement` in the same transaction as the change itself.
2. **A safe way to change stock by hand.** A signed amount and a reason, applied
   atomically — never a total typed over whatever was there.
3. **An audit trail and an exception queue.** Who did what, and what needs a
   person today.

---

## The one authoritative quantity

ZyCart holds **one sellable quantity per product**: `Product.stock`.

This phase did not add a second one, and that was the first decision made. The
codebase already had exactly two functions that moved stock — `commitStock` when
an order takes it, `applyCancellation` when an order gives it back — and both
are atomic `$inc` operations inside a transaction. A parallel `Inventory`
collection would have needed keeping in step with them on every checkout, and
the day it drifted, the shop would sell something it did not have.

So the ledger was built _around_ the existing field rather than in place of it:

```text
commitStock        (order.service)      SALE
applyCancellation  (order.service)      CANCELLATION
createProduct      (product.service)    INITIAL_STOCK
adjustStock        (inventory.service)  MANUAL_ADJUSTMENT
```

Four writers, and every one of them records a movement in the transaction that
performs the write. There is no fifth.

### Variants

`Product.sizes` carries `inStock: boolean`, and colours carry nothing. There is
no per-size or per-colour quantity anywhere in the domain, and the cart and
order snapshots record the chosen colour and size as text rather than as a stock
key.

So inventory here is product-level, because that is what the data actually is.
A SALE movement records the colour and size the order line named, as context for
reading the timeline — it never partitions stock, and nothing queries by it. The
inventory detail panel shows size availability read-only and says plainly that
the units above are the product's whole sellable stock, rather than offering a
field that would imply a count that does not exist.

---

## The hole that was closed

`PATCH /api/admin/products/:id` accepted `stock`.

That one field was the reason the ledger could not have been trusted even after
being built. The product form loads, an operator edits a description, and the
form posts the whole product back — including whatever stock was current when
the page loaded. If two units sold in between, saving the description silently
put them back.

Worse, the change carried no reason, so even a recorded movement would have
said only "somebody set this to 40".

`stock` is therefore **omitted from `updateProductSchema`**. Not rejected —
omitted: unknown keys are stripped, so an older client still sending the field
gets a successful update in which it is simply not honoured, rather than a 400 it
cannot interpret.

It remains on `createProductSchema`, where it is genuinely an opening quantity
and is recorded as `INITIAL_STOCK`.

The product form now shows stock read-only on an existing product, with a link
to the adjustment screen, and states why.

---

## Adjusting stock

### A delta, never a total

The console sends `+20` or `−5`. The server applies it to whatever the
authoritative quantity turns out to be.

This is what makes two operators working at once correct by construction:

```text
A opens the dialog          stock = 10
B receives a delivery       stock = 20
A submits −5                stock = 15
```

Five units were removed, which is exactly what A asked for. Under a
"set the total" API, A's save would have written 5 and silently discarded B's
delivery.

### How the race is actually closed

One `findOneAndUpdate`, with the sufficiency check in the filter:

```ts
{ _id: productId, stock: { $gte: -quantityChange } }   // for a decrease
{ $inc: { stock: quantityChange } }
```

The read and the write are a single atomic operation, so two decrements racing
for the last six units cannot both succeed — the second matches nothing. This is
the same technique `commitStock` already used for checkout, for the same reason.

`new: false` returns the document _as it was_, which is where `quantityBefore`
comes from. Taking it from a separate read would have reintroduced exactly the
gap the filter closes.

When the update matches nothing, a second read — on the failure path only —
turns a silent no-op into a specific message: the product is gone, or there were
only four units and the request asked to remove five.

### When a stale screen _should_ block the write

A recount is different in kind. "I counted 17 on the shelf" is a statement about
a total, and if the total moved while the shelf was being counted, the delta
derived from it is wrong.

So the dialog's "Set to counted total" mode sends `expectedStock`, which joins
the **same atomic filter** — not a read-then-write check — and the write fails
loudly rather than applying a difference that is no longer true.

A plain `+20` sends no precondition, because it does not need one.

### What the operator sees

```text
Current stock          Projected stock
24            →                     34

Add or remove    [ +10 ]
Reason           [ Restock received ]
Note             [ optional ]
```

The projection updates as you type and is labelled a projection. When the server
finds a different quantity, the success panel says so:

> Stock had already moved to 20 since this form was opened, so the change was
> applied to that. The units you asked for were still added or removed.

An adjustment of 100 units or more asks a second time, inside the same dialog so
Escape still cancels everything and focus never leaves. That threshold is sent
by the server rather than written into the browser, so the number an operator is
warned at cannot drift from the one documented here.

### Validation

Server-side, in `adjustStockSchema` and the service:

| Rule                                    | Where         |
| --------------------------------------- | ------------- |
| Whole number, non-zero                  | schema        |
| Within ±100,000                         | schema        |
| Reason required, from a fixed set       | schema        |
| Nothing else in the body (`.strict()`)  | schema        |
| Reason fits the direction               | service       |
| Resulting stock ≥ 0                     | atomic filter |
| Actor is an authenticated administrator | router guard  |

"Restock −5" and "Damaged +10" are refused, because they are almost always a
sign error and a ledger full of them cannot be read later. `COUNT_CORRECTION`
and `OTHER` go both ways on purpose.

The browser validates the same things for the operator's benefit. None of it is
trusted; the endpoint is reachable without the console.

---

## The movement ledger

```ts
product, productName, sku, variant
type            SALE | CANCELLATION | INITIAL_STOCK | MANUAL_ADJUSTMENT
quantityBefore, quantityChange, quantityAfter
reason, note
referenceType, referenceId, referenceLabel
actor, actorName
createdAt
```

### Why both quantities are stored

`quantityAfter` is derivable from `quantityBefore + quantityChange`, and it is
stored anyway. It is what makes the ledger _checkable_: a gap between one
movement's `quantityAfter` and the next one's `quantityBefore` reveals a write
that bypassed this ledger. Storing only one side would make that undetectable.

`planMovement` computes `quantityAfter` rather than accepting it, so the
invariant holds by construction, and refuses any movement that would leave stock
below zero.

### Why the sign is constrained

The enum documents that a SALE decreases stock and a CANCELLATION increases it.
`assertMovementSign` is what makes that documentation true — without it, a future
caller passing a negative quantity to the restore path would write a ledger that
reads correctly and means the opposite, and no amount of care in the reading
code could recover from that.

### Why some movements have no actor

`actor` is null for a SALE and for a customer's own cancellation. Attributing
those to an administrator would be false, and naming the shopper would put their
identity in an operational ledger that has no use for it. The order reference is
how those are traced back to a person, through the order that already records
one.

The movement detail panel says "A customer order" rather than "System", because
"System" implies something ran on its own.

---

## Low-stock thresholds

`LOW_STOCK_THRESHOLD = 5` was a store-wide constant. A product selling fifty a
day and one selling two a month should not warn at the same number, so
`Product.lowStockThreshold` was added as an optional override.

**Nullable rather than defaulted to 5**, so "nobody has set one" and "somebody
chose five" stay distinguishable: the first should follow the store default if
that default ever changes, and the second should not. The migration deliberately
does not backfill it.

Because the comparison is now between two fields of the same document, the stock
filters use `$expr`:

```ts
{
  $lte: ['$stock', { $ifNull: ['$lowStockThreshold', LOW_STOCK_THRESHOLD] }];
}
```

`$ifNull` is what makes a document written before this phase classify at all.

The cost is that these clauses cannot use an index on `stock` and are evaluated
per document. That is acceptable: they run only on admin screens, over a
catalogue measured in hundreds. The alternative — a denormalised `stockState`
on every product — would need maintaining in every path that touches stock or
the threshold, which is the second source of truth this phase exists to remove.

`STOCK_FILTERS` and `stockStateOf` are shared by the dashboard, the products
screen and the inventory screen, so a product cannot be low on one and healthy
on another.

---

## The audit trail

One row per **successful** administrative change.

```text
Admin Dhruw · Stock decreased by 7 for Nike Air Max (24 → 17) · Damaged
```

Not:

```text
PATCH /api/admin/products/671f2a8c…
```

A request log is true and useless six weeks later. Every row here is a sentence
the service wrote at the moment the change happened, plus a list of named
before/after pairs.

### Two rules

**A row means it happened.** Where the mutation runs in a transaction, the audit
row is written inside it — so a rolled-back change leaves no claim that it
succeeded, and a failure to record the change fails the change. Nothing is
written for an attempt.

**The service writes the sentence.** Callers hand over a summary already phrased
for a person and a list of named fields. Nothing inspects a request body or
diffs a document. That restriction is the protection: a diff of `req.body`
against a Mongoose document would cheerfully record a password hash or a gateway
identifier the first time somebody widened an endpoint.

### What is audited

| Action                                | Where the row is written          |
| ------------------------------------- | --------------------------------- |
| `INVENTORY_ADJUSTED`                  | inside the adjustment transaction |
| `ORDER_STATUS_CHANGED`                | inside the transition transaction |
| `REVIEW_MODERATED`                    | inside the moderation transaction |
| `PRODUCT_CREATED`                     | inside the creation transaction   |
| `PRODUCT_UPDATED` / `PRODUCT_DELETED` | after the single-document write   |
| `CUSTOMER_STATUS_CHANGED`             | after the single-document write   |

The last three are single-document writes with no second write to be
inconsistent with, and the row is created only once the change has committed.
Opening a transaction purely to write a log entry would be ceremony rather than
safety.

### The actor

`requireAuth` now projects the administrator's name alongside the fields an
authorisation decision needs, and `requireActor` reads it from the **verified
session** — never from the request body. There is no field in any schema through
which a caller could claim to be somebody else.

`requireActor` throws a 500 rather than a 401 if there is no session: it cannot
be reached on a guarded route, so reaching it means the routing table lost a
guard, which is a bug rather than a credentials problem.

### Retention

None. Audit rows are kept indefinitely and there is no cleanup job, because a
retention policy nobody asked for is a policy that quietly deletes evidence. If
the collection ever needs bounding, a TTL index on `createdAt` is a one-line
change — the same mechanism `WebhookEvent` already uses.

---

## Needs attention

Six rules, all decidable from stored data:

| Rule                 | Condition                                   | Severity |
| -------------------- | ------------------------------------------- | -------- |
| `PAYMENT_FAILED`     | online payment failed, order not cancelled  | critical |
| `PAYMENT_STALLED`    | online payment unfinished for 24 hours      | warning  |
| `REFUND_PENDING`     | refund started, not settled                 | critical |
| `PAID_NOT_CONFIRMED` | `PENDING` + `PAID`                          | critical |
| `STOCK_NOT_HELD`     | past `PENDING` with `stockCommitted: false` | critical |
| `FULFILMENT_OVERDUE` | confirmed 3+ days ago, not shipped          | warning  |

Nothing here is inferred, scored or predicted. An alert an operator cannot
verify by opening the order is an alert they learn to ignore, and the panel
stops working the moment that happens. So there is no "likely fraud" and no "at
risk of cancellation".

`PAID_NOT_CONFIRMED` should be unreachable — finalisation sets both fields in
one atomic update. It is checked _because_ it should be: if it ever appears,
something has written payment state outside that path, and finding out from this
panel beats finding out from a customer.

A cash-on-delivery order's payment stays `PENDING` for its whole life by design,
so no rule treats age plus an unpaid COD order as an exception. Doing so would
put every cash order in the queue forever.

### Written twice, checked automatically

Each rule needs a Mongo filter (to count and page) and a JavaScript predicate
(to label a row). Those cannot be derived from one another, so they are written
side by side — and a test evaluates both over thirteen sample orders and asserts
they agree.

The test's minimal Mongo matcher understands exactly the operators the rules use
and **throws on anything else**, so a rule written with an unfamiliar operator
fails loudly rather than passing quietly while the two halves drift apart.

### Not a separate endpoint

`attention=true` is a filter on the existing orders query, so it composes:
"unpaid orders from the last week that need attention" is one URL. It is merged
with `$and` rather than assigned to `$or`, because the search clause also wants
`$or` and the last writer would otherwise silently turn a narrow query into a
broad one.

---

## Order timelines

Assembled only from timestamps that were genuinely recorded: the order's
`createdAt` and `cancelledAt`, the payment's `paidAt` and `refundedAt`, the audit
rows for every administrative status change, and the inventory ledger.

There is deliberately no synthesised "Processing" step for an order moved before
the audit trail existed. Nothing recorded when that happened, and a timeline that
invents a plausible date is worse than one with a gap.

---

## Bulk fulfilment

Forward moves only — confirm, process, ship, deliver — for up to 50 orders.

**There is no bulk cancellation**, and the schema is what guarantees it.
Cancelling restores stock, may owe a refund, and deserves a reason per order.
Putting it behind a checkbox column is exactly the convenient irreversible
operation this phase declined to build.

Each order runs `setOrderStatus` on its own — the same function, the same
transition rules, the same inventory restoration, the same audit row as moving
one order by hand. Deliberately **not one transaction**: twenty orders where one
illegal transition rolls back the other nineteen is not what an operator
selecting twenty orders wants.

So failures are collected rather than thrown, and the result says what happened:

```text
24 selected

21 updated
3 unchanged

ZY10488  An order that is already shipped cannot be moved to processing.
```

The orders table stays a server component. Only the checkboxes and the action
bar are client code, sharing state through a context — so selecting a row does
not push the table, its images and its formatting into the browser bundle.

---

## Dashboard

Added: an inventory health strip, a recent-activity feed from the audit trail,
and slow-moving stock. The attention strip now says "Everything looks healthy"
rather than disappearing, because a missing panel is ambiguous — it could mean
all clear or failed to load.

### Slow movers

```text
coverDays = stock ÷ (unitsSold ÷ windowDays)
```

Measured among the **hundred products holding the most stock**, because slow
movement is only worth reporting where it ties up something: a product with two
units that has not sold in a month costs nothing to leave alone. Bounding it
that way also keeps the calculation to two queries instead of one per product.

Both facts are stated on the panel, so the figure is not mistaken for a
whole-catalogue ranking. A product with no sales has no rate and therefore no
cover — that reads "No sales", not a number.

Units sold come from the same revenue-contributing orders every other figure on
the dashboard uses, so a cancelled bulk order cannot make a product look
fast-moving.

---

## Timezones

Every admin window — "today", "last 7 days" — resolves through one function,
`startOfDaysAgo`, shared by the dashboard, the audit service and the inventory
service. No two panels can disagree about where a day begins.

The zone is the server process's, which is the honest description of what it
does. It is consistent rather than configurable, because a business-timezone
setting that only some queries honoured would be worse than none. Deploy with
`TZ` set to the store's timezone and every boundary moves together.

On the browser side, every new timestamp is formatted against an explicit
`Asia/Kolkata`, matching the `en-IN` currency formatting used throughout. That
is not only correctness: every admin page is server-rendered, and a timestamp
formatted in the server's zone then re-formatted in the browser's produces
different text for the same instant, which React reports as a hydration
mismatch. Pinning the zone makes both sides agree by construction.

---

## Permissions

ZyCart has two roles: `USER` and `ADMIN`. Every route under `/api/admin` passes
through `requireAuth` then `requireRole('ADMIN')`, mounted once on the router so
that "is this endpoint protected?" is answerable by reading a single line.

The new endpoints inherit that and add nothing to it.

**This phase deliberately did not introduce a granular permission model.** A
`VIEW_INVENTORY` / `ADJUST_INVENTORY` split would need a new role model, a
migration, an assignment interface and a second authorisation path — and with a
single administrator role in existence, every one of those would be
scaffolding around a check that always returns the same answer. It is worth
building when ZyCart has staff who should see stock without being able to move
it. It is recorded here as a known limitation rather than half-built.

What _is_ enforced today: the console's `/admin` layout resolves the role on the
server before any admin markup is produced, and the API's own guard is what
actually protects the data — it holds whether or not anybody goes through that
page.

---

## Indexes

| Index                                              | Why                                                             |
| -------------------------------------------------- | --------------------------------------------------------------- |
| `inventoryMovement { product, createdAt }`         | one product's ledger, newest first — the timeline               |
| `inventoryMovement { createdAt }`                  | the store-wide feed, and "recently changed"                     |
| `inventoryMovement { actor, createdAt }`           | "what has this administrator been changing?"                    |
| `inventoryMovement { referenceType, referenceId }` | every movement one order caused                                 |
| `auditLog { createdAt }`                           | the activity feed and the log's default order                   |
| `auditLog { action, createdAt }`                   | the action filter                                               |
| `auditLog { actor, createdAt }`                    | the actor filter                                                |
| `auditLog { entityType, entityId, createdAt }`     | an order's own history, for the timeline                        |
| `product { isActive, stock }`                      | the inventory console's default view and its out-of-stock query |

Nothing was added for a field nothing sorts or filters on. The `$expr` threshold
clauses cannot use an index and no index was created pretending otherwise.

---

## API

All under `/api/admin`, all `ADMIN`-only.

| Method  | Path                       | Notes                                                            |
| ------- | -------------------------- | ---------------------------------------------------------------- |
| `GET`   | `/inventory`               | search, stock status, category, brand, listing, sort, pagination |
| `GET`   | `/inventory/summary`       | counts, sellable units, thresholds                               |
| `GET`   | `/inventory/movements`     | the store-wide ledger                                            |
| `GET`   | `/inventory/:id`           | stock, variants, totals, newest 20 movements                     |
| `GET`   | `/inventory/:id/movements` | that product's ledger, paged                                     |
| `POST`  | `/inventory/:id/adjust`    | `{ quantityChange, reason, note?, shownStock?, expectedStock? }` |
| `PATCH` | `/inventory/:id/threshold` | `{ lowStockThreshold }`, null restores the default               |
| `GET`   | `/operations`              | attention counts and queue depth                                 |
| `PATCH` | `/orders/bulk-status`      | `{ orderNumbers[], status, note? }` → per-order outcomes         |
| `GET`   | `/audit-logs`              | search, action, entity, actor, period                            |
| `GET`   | `/audit-logs/actors`       | the actor picker's options                                       |

`/orders/bulk-status` is declared **above** the `:orderRef` routes: a literal
path has to be registered before the parameter that would otherwise swallow it.
`/inventory/summary` and `/inventory/movements` are declared above
`/inventory/:id` for the same reason.

Errors use the existing `{ success: false, message }` envelope. A stock
adjustment that cannot apply answers 409 with a sentence an operator can act on,
not a Mongo error.

---

## Testing

`pnpm --filter zycart-backend test` — 199 tests, all passing.

Two new files, both pure unit tests with no MongoDB, matching the convention the
AI tests set: what is under test is ZyCart's own logic, and a database round
trip only adds ways for a test to fail for reasons that have nothing to do with
it.

**`inventory.test.ts`** — stock-state partitioning across thresholds, the
pre-Phase-12 fallback, movement sign constraints, the `after = before + change`
invariant, the refusal to go below zero, the adjustment filter's properties, the
reason/direction rules, and the schemas' refusal of `stock`, `quantityAfter`,
`price`, `isActive` and `actor` in an adjustment body.

**`operations.test.ts`** — the filter/predicate agreement test described above,
each attention rule's boundary behaviour, the bulk schema's refusal of
`CANCELLED`, and the audit change helper.

### Against a real database

```bash
pnpm inventory:verify
```

48 checks against a real replica set, because the half of this phase that only
exists _because_ there is a database cannot be unit tested: the atomicity of the
adjustment, the transaction binding a stock change to its movement and audit
row, and what happens when adjustments race.

Following the convention `ai:verify` and `discovery:verify` set, it creates its
own category, brand, products and administrator under a `ZYCART-P12-` SKU prefix
and a `@zycart-p12.test` domain, never touches a record it did not create, and
removes exactly its own records in a `finally` — so it is safe to point at a real
database.

What it proves:

- An adjustment writes the stock, the movement and the audit row together, and
  the audit row reads `24 → 34`.
- A refusal leaves **nothing** behind: stock untouched, no movement, and no audit
  row claiming it succeeded.
- A stale recount is refused with the real quantity named; a stale _delta_ still
  applies and reports that the screen had moved.
- **Ten concurrent −6 adjustments against a stock of 10: exactly one succeeds,
  the final stock is 4, and the ledger holds exactly one movement.** Five
  concurrent restocks, which have no floor, all apply and each writes its own
  movement.
- A chain of five adjustments reconciles end to end — every movement internally
  consistent, no gap between one `quantityAfter` and the next `quantityBefore`,
  and the last one agreeing with the product. A gap there would be evidence of a
  write that bypassed the ledger.
- A threshold change writes no stock movement.

### The unit-level version of the same guarantee

The unit suite still asserts the property that _makes_ the race safe, so a
regression is caught without needing a database:

```ts
for (const change of [-1, -2, -7, -99, -MAX_ADJUSTMENT]) {
  const filter = adjustmentFilter(ID, change);
  assert.equal(filter.stock.$gte, -change);
  assert.ok(filter.stock.$gte + change >= 0);
}
```

Any document the filter matches has enough stock for the decrement, so no
interleaving of updates can produce negative stock while that property holds.

---

## Migration

```bash
pnpm migrate:phase12
```

Creates the indexes for the two new collections and the new compound product
index. That is all it touches, and both omissions are deliberate:

- **`lowStockThreshold` is not backfilled.** Null means "follow the store
  default", and writing 5 into every product would turn a default that can be
  changed once into a value that would have to be changed everywhere.
- **Movements are not invented for existing products.** A product with 12 units
  today may have started with 40 and sold 28. An `INITIAL_STOCK` row claiming it
  opened with 12 would be a fabricated entry whose arithmetic contradicts every
  sale before it. The ledger starts empty and fills up honestly; the timeline
  says so rather than showing a blank panel.

Additive and idempotent. `createIndexes`, not `syncIndexes` — the latter drops
any index the schema does not declare, which is not a decision a migration
should make on somebody's live collection.

`pnpm seed` now also resets the movement collection and writes real
`INITIAL_STOCK` rows for the products it creates. That is not invented history:
the seed _is_ the moment those products came into existence with those
quantities. The audit trail is left alone — it records what staff did, which a
catalogue reset does not undo.

---

## Backward compatibility

- Products without `lowStockThreshold` resolve through `thresholdOf` and the
  `$ifNull` in the filters. No migration is required for the console to work.
- Orders without audit rows render a shorter timeline rather than an invented
  one.
- Products with an empty ledger show an empty state that explains why.
- A client still sending `stock` on a product update succeeds; the field is
  stripped rather than rejected.

---

## Known limitations

**One administrator role.** No `VIEW` / `ADJUST` split — see _Permissions_.

**No reservations.** Stock is taken at checkout (cash) or at payment (online).
Nothing is held during a browsing session, and this phase did not change that.

**Movements are not backfilled.** Products that predate this phase start with an
empty ledger. This is deliberate; see _Migration_.

**`$expr` threshold filters do not use an index.** Fine at this catalogue size,
stated so it is a known cost rather than a surprise.

**Adjustment is product-level.** There is no per-size count to adjust, because
there is no per-size count to hold.

**The attention thresholds are assumptions.** 24 hours for a stalled payment and
3 days for overdue dispatch are warehouse-service judgements, written as named
constants with the reasoning beside them so they can be argued with rather than
discovered.

**No toast system.** ZyCart has never had one; feedback follows the existing
inline conventions — errors beside the action that failed, results in the dialog
that produced them, `router.refresh()` to re-read from the server.

---

## Not in this phase

Warehouse management, multi-warehouse stock, purchase orders, suppliers,
barcode scanning, demand forecasting, shipping-provider integration, an admin AI
copilot, real-time notifications, and a granular permission model.

No AI is used anywhere in this phase. Inventory, revenue, order counts, payment
state, stock status and operational alerts are deterministic application logic
and stay that way — a model that computed a stock level would be a model that
could be wrong about one.
