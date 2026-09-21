# Phase 9 — Admin Console & Store Management

## Goal

A place to run the store, built on the store that already exists.

```text
                 ┌─────────────────────────────────────┐
  /admin  ──────▶│  requireAuth → requireRole('ADMIN')  │──▶ the same
                 └─────────────────────────────────────┘    services the
                                  │                          storefront uses
                    no session ───┴─── signed-in customer
                        401                  403
```

Nothing in this phase invents a second version of the business. Cancelling an
order from the console runs the code that cancels an order from the account
page. Editing a product runs the validation a product has always been held to.
The console is a new **interface**, not a new **system**.

---

## The central decision: an administrator is a role, not an exception

The tempting shape for an admin panel is a parallel application — its own
endpoints, its own writes, its own shortcuts, justified by "it's only for us".
Every one of those shortcuts is a rule the rest of the system believed it could
rely on.

So the rule here is the opposite: **an administrator sees more, and is trusted
with more, but is never permitted to do something the system says is
impossible.**

Three places where that was load-bearing:

| The shortcut that was not taken      | Why                                                                                                                                                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /admin/orders/:id/mark-paid`   | Payment state is grounded in what Razorpay reports. An endpoint that asserted it would make every **Paid** badge in ZyCart mean less — including the ones that are honest.                                  |
| Cancelling a paid order              | A settled payment (`PAID`, `AUTHORIZED`, `REFUND_PENDING`) refuses cancellation for the administrator exactly as it does for the customer, because money has moved and a status flip does not move it back. |
| A role dropdown on the customer page | Promotion to administrator is a deliberate act, not a click in a list. It lives in a CLI (`pnpm make-admin`) and is out of scope for the console.                                                           |

---

## Prerequisite: the 1024px navbar overflow

This was carried into Phase 9 as a required fix, and it was fixed by measuring
rather than guessing.

At exactly `1024px` — where the primary navigation first appears alongside the
logo, the search field and the icon group — those four demanded **982px inside
a 945px content box**, and the row spilled past its container.

The cause was not the widths. It was that a flex item defaults to
`min-width: auto`, which means it refuses to shrink below its own content. The
search field _could_ have given up the difference and was not allowed to.

```diff
- <SearchTrigger className="mx-auto hidden max-w-sm md:flex" />
+ <SearchTrigger className="mx-auto hidden min-w-0 max-w-sm md:flex" />
```

`overflow-x: hidden` was explicitly **not** the fix. It was already on `body`
from an earlier phase, and it had not helped — the document still scrolled
sideways, because hiding overflow on one element does not stop a child from
being laid out too wide.

**Verified:** 4 pages × 10 viewport widths × 2 themes = **80 combinations, zero
overflow**, measured as `documentElement.scrollWidth - clientWidth`.

The same class of bug appeared again inside the console and is documented under
[Responsive strategy](#responsive-strategy).

---

## A security hole closed on the way in

Phase 9 needed authenticated product, category and brand writes. It found that
they had none.

```text
before:  POST   /api/products      → anyone on the internet
         PATCH  /api/categories/:id → anyone on the internet
         DELETE /api/brands/:id     → anyone on the internet
```

The README described these as "unauthenticated development APIs until auth
lands". Auth landed in Phase 4. The endpoints were never revisited.

They are now guarded by a shared `adminOnly` chain, applied per write route:

```ts
export const adminOnly: RequestHandler[] = [asyncHandler(requireAuth), requireRole('ADMIN')];
```

Reads stay public — the storefront depends on them.

An earlier attempt did this with one clever method-sniffing middleware. It was
replaced with the explicit spread on each route, because a guard whose behaviour
you have to reason about is a guard that will eventually be reasoned about
wrongly.

---

## Architecture

### Backend

```text
src/
├── middleware/adminOnly.ts        # requireAuth + requireRole('ADMIN')
├── routes/admin.routes.ts         # one guard for the whole namespace
├── controllers/admin.controller.ts# thin; no business logic
├── validators/admin.validator.ts  # every schema .strict()
└── services/admin/
    ├── dashboard.service.ts       # aggregations, one definition of revenue
    ├── catalogue.service.ts       # listings that include inactive rows
    ├── order.service.ts           # delegates transitions to order.service
    ├── customer.service.ts        # spend, counts, activation
    └── review.service.ts          # delegates moderation to review.service
```

The guard is mounted **once**, on the router:

```ts
adminRouter.use('/admin', asyncHandler(requireAuth), requireRole('ADMIN'));
```

That is what makes "is this endpoint protected?" answerable by reading one line,
and what stops a route added in Phase 12 from being unprotected by omission.

Two guards rather than one, because they answer different questions: no session
is a `401` and retrying with credentials might help; a signed-in customer is a
`403` and it would not.

### Frontend

```text
app/
├── layout.tsx              # the document: fonts, tokens, three providers
├── not-found.tsx           # renders the shop chrome itself (see below)
├── (storefront)/
│   ├── layout.tsx          # navbar, promo bar, footer, search, cart sync
│   └── …                   # every shopper-facing route, URLs unchanged
└── admin/
    ├── layout.tsx          # the server-side role gate
    ├── loading.tsx         # skeleton shaped like the listings
    ├── error.tsx           # recovers inside the console
    └── …
```

#### The route group, and why it was necessary

The storefront's navbar, promo bar and footer lived in the **root** layout,
which meant every route inherited them — including the console, which rendered
underneath a shop navigation it has no use for, with its own `<main>` nested
inside the storefront's.

Route groups do not change URLs, so `(storefront)` was a pure reorganisation:
the chrome now belongs to the routes that want it, and the console brings its
own shell.

`app/not-found.tsx` stays at the root, because Next renders the root
`not-found` in the root layout and never inside a group. It composes
`<StorefrontChrome>` directly so a mistyped URL still lands somewhere
recognisably ZyCart.

**Verified:** 50 checks across 8 storefront routes — every URL unchanged, the
navbar and footer still present, exactly one `<main>` per page, the skip-link
target intact, no admin chrome leaking in, and no sideways scroll.

---

## Role protection

Protection exists at two levels, and only one of them is security.

**The API is the guard.** `requireRole('ADMIN')` on the namespace is what
actually protects the data. It holds whether or not anybody ever loads the
console — a `curl` at `/api/admin/customers` with a customer's cookie gets a
`403` and no body.

**The page is the courtesy.** `app/admin/layout.tsx` resolves the role on the
server _before any admin markup is produced_, so an unauthorised visitor never
receives a console to flash on screen and there is no client-side redirect
racing a render.

The two failures get different answers on purpose:

| Situation        | Response                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| No session       | `redirect('/login?redirect=/admin')` — signing in may well fix it                                             |
| Signed-in `USER` | A page saying _"This area is for store staff"_ — a redirect would look like a missing page and invite a retry |

`role` is never read from the client. It comes from the session the server
resolved.

---

## Dashboard metric definitions

A dashboard that cannot say what its numbers mean is decoration. Each figure
here states its own definition on the card.

### Revenue

```ts
{
  status: { $ne: 'CANCELLED' },
  $or: [
    { 'payment.status': 'PAID' },                    // paid online
    { 'payment.method': 'COD', status: 'DELIVERED' } // cash, once handed over
  ],
}
```

Cash on delivery is revenue when it is **delivered**, not when it is ordered,
because until then no money exists. The card says so: _"Paid online, or cash on
delivery once delivered."_

This is defined **once** and reused by customer lifetime spend, so the two can
never disagree about what a rupee is.

| Metric           | Definition shown to the operator                | Source                                           |
| ---------------- | ----------------------------------------------- | ------------------------------------------------ |
| Revenue          | Paid online, or cash on delivery once delivered | Aggregation over real orders                     |
| Orders           | Every order placed in the period                | Count, cancellations included                    |
| New customers    | Accounts registered in the period               | `role: 'USER'` only                              |
| Products         | Total, with out-of-stock called out             | Catalogue counts                                 |
| Revenue chart    | Last 7 or 30 days, gap-filled                   | Days with no orders are `0`, not missing         |
| Orders by status | All time                                        | Grouped count                                    |
| Top sellers      | **By units sold**, last 30 days                 | Real order lines — _not_ the `isBestSeller` flag |
| Low stock        | At or below 5 units                             | `LOW_STOCK_THRESHOLD`, shared with filters       |

Nothing is fabricated. The figures in a development database are small, and the
dashboard shows them small. "No comparison for the previous period" is printed
where there is genuinely no earlier period to compare against, rather than
inventing a percentage.

---

## The management areas

### Products

Full CRUD, reusing the Phase 3 product service and its validation unchanged —
including the slug and SKU uniqueness rules, which an admin does not get to
skip. The listing includes **inactive** products, which the storefront's never
does; that is the one real difference between the two queries.

Filters: search, category, brand, stock state, active state, the three
merchandising flags, and sort. All of it lives in the URL.

### Categories and brands

A single `TaxonomyManager` component drives both, because they are the same
shape. Each row carries its product count, computed in one grouped aggregation
rather than a query per row.

### Orders

Fulfilment and payment are tracked **separately** and the page says so — an
order can be shipped and unpaid, or paid and pending.

Status transitions are declared once, in the order service the storefront
already uses:

```ts
PENDING    → CONFIRMED | CANCELLED
CONFIRMED  → PROCESSING | CANCELLED
PROCESSING → SHIPPED | CANCELLED
SHIPPED    → DELIVERED
DELIVERED  → (terminal)
CANCELLED  → (terminal)
```

The detail page sends `allowedStatuses` with the order, so the control offers
only legal moves — and the server checks again regardless, because a UI that
only offers legal moves is not a constraint.

Admin cancellation and customer cancellation call the same
`applyCancellation`, so stock restoration happens identically in both paths
instead of being reimplemented and drifting.

`findOrderByRef` is deliberately a **separate function** from `findOwnedOrder`
rather than an ownership flag on it. A boolean that disables a security filter
is one accidental `true` away from a leak.

### Customers

Lifetime spend uses the revenue definition above. Addresses are **counted, not
listed** — operating the store does not require reading where people live.

Activation is a deactivate/reactivate toggle whose filter carries
`role: 'USER'`, so the query itself cannot deactivate an administrator.

There is no role control. See the top of this document.

### Reviews

Moderation delegates to Phase 8's `reviewService.moderateReview`, so rating
aggregates recompute through the code that has always owned them. The detail
view shows the order evidence behind the verified-purchase badge, which is the
whole point of having stored it.

---

## Responsive strategy

| Width         | Navigation            | Listings                  |
| ------------- | --------------------- | ------------------------- |
| `< lg` (1024) | Drawer                | Stacked cards             |
| `≥ lg`        | Fixed sidebar (16rem) | Table                     |
| `≥ xl`        | Fixed sidebar         | Table + secondary columns |

The sidebar does not collapse to a strip of icons. That is the usual compromise
and it leaves an operator guessing at glyphs.

The drawer closes on navigation, and does so by _derivation_ rather than by
effect — it stores the path it was opened on, so the moment `pathname` changes
it is closed, with no frame where the drawer covers the page just requested.

A phone gets stacked cards, not a squeezed table. A table at 360px is not a
table.

### The second overflow bug

The products table overflowed its column by 21px at 1024px. Two causes, both
real:

1. **A table cannot shrink below its content's minimum width.** `w-full` does
   not change that. The wrapper's `overflow-hidden` was clipping the last
   column — the one with the row actions in it — leaving it unreachable. The
   wrapper is now `overflow-x-auto`: the panel scrolls, the actions stay
   reachable.
2. **An absolutely positioned descendant escaped the wrapper.** The
   visually-hidden _"Actions"_ header, being `position: absolute` with no
   positioned ancestor, was laid out against the viewport and stretched the
   whole document sideways. The wrapper is now `relative`, which contains it.

Scrolling is the fallback, not the experience: the Category, Brand and Added
columns now appear at `xl` rather than `lg`, so the common widths fit.

---

## Verification

| Suite                        | Checks  | What it covers                                                                                  |
| ---------------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| API (`run.ts`)               | **197** | Every endpoint's guard, validation, transitions, aggregation correctness, reuse of shared logic |
| Storefront (`storefront.ts`) | **50**  | Route-group regression across 8 routes — URLs, chrome, `<main>`, overflow                       |
| Console (`ui.ts`)            | all     | Real headless Chrome: layout at 10 widths, drawer, a11y, light/dark contrast                    |

Everything was run against **isolated test data**. The API suite uses a
database derived from `MONGODB_URI` with a `_phase9verify` suffix and drops only
that. The browser suites create one temporary administrator and one temporary
customer in the live database and delete exactly those two by email.

A read-only residue sweep afterwards confirmed the real data intact: **36
products, 6 categories, 21 brands, 147 orders, 143 reviews**, and zero
documents matching any test pattern.

### Bugs the verification actually caught

- Readonly Mongo filters — `as const` made `$or` readonly and Mongoose rejected
  it; the match objects became factories returning fresh mutable objects.
- A model union (`typeof Category | typeof Brand`) made `.find()` uncallable;
  split into concrete listers sharing a filter builder.
- Two React Compiler violations: a `setState` in an effect (the drawer) and a
  re-sync effect (the search box), both rewritten as derived state.
- The browser harness reported three phantom failures because it measured
  mid-navigation; `goto` now waits for `readyState`, for the `loading.tsx`
  skeleton to clear, and for two animation frames.

---

## Granting administrator access

No account is an administrator by default, and there is no UI that creates one.

```bash
pnpm make-admin owner@example.com          # grant
pnpm make-admin owner@example.com --revoke # revoke
pnpm make-admin --list                     # who currently has it
```

A deliberate act on the server, by someone with database credentials — which is
the correct bar for the only role that can see every customer in the store.

---

## Known limitations

- **No audit log.** Status changes, moderation decisions and deactivations are
  applied but not recorded with an actor and a timestamp. For a single-operator
  store this is survivable; for a team it is the next thing to build.
- **No refunds from the console.** Refunding is a Razorpay operation with its
  own lifecycle, and a button that only flipped a local status would be worse
  than no button. Paid orders point the operator at support instead.
- **No bulk actions.** Every change is one row at a time.
- **The revenue chart is sparse on seeded data.** Development orders cluster on
  the dates they were seeded, so the chart shows one tall bar. That is the
  truth about the data, and it was left true.
- **Dashboard periods are 7 and 30 days only.** There is no custom range.
- **No CSV export**, and no server-side rate limiting specific to the admin
  namespace beyond the global limiter.
