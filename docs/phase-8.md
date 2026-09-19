# Phase 8 — Reviews & Ratings

## Goal

A review that means something.

```text
Purchase → Delivery → Eligibility → Review → Rating → Product page
                          │
                    proven from the order,
                    never claimed by the client
```

## The central decision: a review is evidence, not an opinion form

Anyone can write an opinion. What makes a rating worth reading is that the
person writing it actually received the thing.

So there is no path in ZyCart that creates a review without first proving a
**delivered order belonging to the authenticated customer that contains this
product**. That proof is a database query whose filter carries all three
conditions at once:

```js
Order.findOne({
  user: authenticatedUser,
  status: 'DELIVERED',
  'items.product': productId,
});
```

Somebody else's order, an order that never shipped, and an order for a different
product are all simply _not found_. There is no flag to set and nothing to
override — `isVerifiedPurchase` is written by the server from this query, and
sending it in the request body is a `400`.

**Verified** against all six order states: only `DELIVERED` is eligible, and
only `DELIVERED` can post.

## Why the order and the order item are stored on the review

A review keeps `user`, `product`, `order` and `orderItem`. The last two are what
make "was this really bought?" answerable months later, by something other than
trust.

An order is a snapshot that nothing can rewrite, which is why the review points
at it rather than at the product. **Verified:** a product was renamed, repriced
to ₹99,999 and deactivated after purchase — its buyer was still eligible, and
the review still posted as a verified purchase.

## Eligibility, and what the customer is told

| Reason                | What the interface says                          |
| --------------------- | ------------------------------------------------ |
| `NOT_AUTHENTICATED`   | Sign in to leave a review                        |
| `NOT_PURCHASED`       | Purchase this product to leave a verified review |
| `ORDER_NOT_DELIVERED` | You can review this once it has been delivered   |
| `ALREADY_REVIEWED`    | You've reviewed this → **Edit your review**      |
| `PRODUCT_UNAVAILABLE` | —                                                |

`GET /api/reviews/eligibility/:productId` returns a _reason_, not a boolean,
because each of these is a different sentence and none of them should be
rendered as a permission error. `ORDER_NOT_DELIVERED` is told apart from
`NOT_PURCHASED` deliberately: telling somebody who has already paid to "buy it
first" is worse than saying nothing.

The interface never shows a review button that would fail.

## One review per customer per product

Enforced by a **unique index on `{ user, product }`**, not by a check that a
race could overtake. Two simultaneous submissions from the same customer end
with one review and a `409`; **verified** by firing both at once.

Status is deliberately _not_ part of the key:

- a **rejected** review still occupies the slot, so a customer whose review was
  removed edits that one rather than posting around the rejection;
- **deleting** is a hard delete, so it frees the slot and the customer may
  review the product again — **verified**.

## Rating aggregates

Products carry four derived fields, and never write them by hand:

| Field             | Meaning                                         |
| ----------------- | ----------------------------------------------- |
| `ratingSum`       | exact integer total of every approved rating    |
| `reviewCount`     | how many approved reviews there are             |
| `rating`          | `ratingSum / reviewCount`, rounded to 1 decimal |
| `ratingBreakdown` | how many gave each star                         |

Keeping the **sum** rather than only the average is what makes an average
maintainable by addition, and keeps it exact: 13 over 3 reviews stays 13 over 3,
and only the displayed `rating` is rounded. `4.666…` is never stored.

### The concurrency story is one atomic operation

`applyRatingDelta` is an **aggregation-pipeline update**, not a read, a
calculation and a write:

```js
Product.updateOne({ _id }, [
  { $set: { ratingSum: …, reviewCount: …, 'ratingBreakdown.4': … } },
  { $set: { rating: { $round: [{ $divide: ['$ratingSum', '$reviewCount'] }, 1] } } },
], { updatePipeline: true });
```

The second stage reads what the first stage just wrote, inside a single atomic
document update. Two customers reviewing the same product at the same instant
cannot both read the same "before" value and each write an average that ignores
the other.

**Verified:** ten customers reviewing one product simultaneously produced
`reviewCount = 10`, the exact expected `ratingSum`, the exact expected average,
and a distribution totalling ten.

The review write and the aggregate update share a **transaction**, so a review
that no rating reflects — or a rating with no review behind it — cannot occur.

### What moves the numbers

| Event                    | `reviewCount` | `ratingSum` | Distribution    |
| ------------------------ | ------------- | ----------- | --------------- |
| Created (approved)       | +1            | +rating     | +1 in that star |
| Rating edited            | —             | +new−old    | −1 old, +1 new  |
| Content edited           | —             | —           | —               |
| Deleted                  | −1            | −rating     | −1 in that star |
| Approved (from rejected) | +1            | +rating     | +1              |
| Rejected (from approved) | −1            | −rating     | −1              |

Repeating a decision is a no-op, not a second subtraction — **verified**.

Only `APPROVED` reviews count. A rejected review vanishes from the public list,
the summary and the rating; its author still sees it, with a "Not shown
publicly" chip, because they are the one person entitled to know.

## Review lifecycle

```text
                 ┌──────────── edit (content or rating) ───────────┐
                 ▼                                                 │
purchase → DELIVERED → write → APPROVED ──── admin reject ──→ REJECTED
                                   │                               │
                                   └── delete (frees the slot) ←────┘
```

ZyCart **approves on creation**. Every review has already passed a far stronger
filter than a moderation queue would be — a delivered order — so a queue would
add latency without adding trust. `PENDING` exists in the model because a later
phase may want it, not because anything sets it today.

**Edit policy:** an approved review stays approved when edited. Sending edits
back to a queue would be theatre when creation is auto-approved, and a rejected
review also keeps its status on edit, so editing cannot be used to undo a
moderator.

## What a review reveals about its author

```json
{ "author": { "name": "Ananya R.", "avatar": "" } }
```

A first name and an initial — enough to read as a person, not enough to identify
one. **Verified** that no email, password hash, user id or order id appears
anywhere in a public review response, and that no `email` field exists in it at
all.

`isMine` is added only for the reader's own review, so the edit controls appear
for them and for nobody else. The public list route is unauthenticated but reads
the session cookie _if there is one_, purely to decide whether a button renders
— never what anyone is allowed to do.

## API

| Method   | Path                                       | Auth      | Purpose                              |
| -------- | ------------------------------------------ | --------- | ------------------------------------ |
| `GET`    | `/api/products/:productId/reviews`         | —         | Approved reviews, filtered and paged |
| `GET`    | `/api/products/:productId/reviews/summary` | —         | Average, count and distribution      |
| `GET`    | `/api/reviews/eligibility/:productId`      | cookie    | May I review this, and have I?       |
| `POST`   | `/api/reviews`                             | cookie    | Write one                            |
| `PATCH`  | `/api/reviews/:reviewId`                   | cookie    | Edit your own                        |
| `DELETE` | `/api/reviews/:reviewId`                   | cookie    | Delete your own                      |
| `GET`    | `/api/reviews/me`                          | cookie    | Everything you have written          |
| `GET`    | `/api/admin/reviews`                       | **ADMIN** | Moderation queue                     |
| `PATCH`  | `/api/admin/reviews/:reviewId/status`      | **ADMIN** | Approve or reject                    |

Reading is public on purpose: hiding what other customers said from anyone not
signed in would make the ratings unverifiable to exactly the people deciding
whether to buy.

Listing supports `page`, `limit` (max 50), `rating`, `sort`
(`newest` · `oldest` · `highest_rating` · `lowest_rating`) and `verified`.

### Validation

`.strict()` on every schema, which is what makes the absences meaningful:

| Field                                                        | Rule                                                      |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| `rating`                                                     | integer 1–5. `"5"`, `3.5`, `0`, `6`, `null` all rejected  |
| `title`                                                      | optional; empty, or 3–120 characters                      |
| `comment`                                                    | 10–2000 characters, whitespace collapsed before measuring |
| `images`                                                     | ≤ 5 well-formed URLs                                      |
| `isVerifiedPurchase`, `status`, `userId`, `product`, `order` | **rejected outright**                                     |

`orderItemId` is optional, and when given it is checked against the order it
claims to be in _and_ the product being reviewed — otherwise it would be a field
the client could fill with anything.

An empty `PATCH {}` is a `400`. That took care: `.default([])` survives
`.optional()` in Zod, so an earlier version parsed `{}` into `{ images: [] }` and
would have silently deleted the customer's photos. The update schema therefore
uses an images rule with no default.

## Ownership

Ownership is part of the query, not a check afterwards:

```js
Review.findOne({ _id: reviewId, user: authenticatedUser });
```

Another customer's review is _not found_, so the response cannot tell "someone
else's" from "does not exist". **Verified:** User B editing, deleting or listing
User A's review all return `404`, and User A's rating survives every attempt.

## Moderation

An admin may set `APPROVED` or `REJECTED`, and **nothing else**. `user`,
`product`, `order`, `isVerifiedPurchase`, `rating` and `comment` are not
parameters of that endpoint, so moderation can take a review out of public view
but can never rewrite what it says or who said it — **verified** field by field.

A signed-out request is `401` and a signed-in customer is `403`: different
problems with different answers.

## Indexes

Only the ones that correspond to real queries:

| Index                                    | Serves                              |
| ---------------------------------------- | ----------------------------------- |
| `{ user, product }` **unique**           | one review per customer per product |
| `{ product, status, createdAt }`         | the public list, newest/oldest      |
| `{ product, status, rating, createdAt }` | the two rating sorts                |
| `{ user, createdAt }`                    | "My reviews"                        |
| `{ status, createdAt }`                  | the moderation queue                |

## Product page

The reviews sit in the existing tab strip rather than being bolted underneath,
and the tabs are now **deep-linkable**: `…/products/slug#reviews` opens on them,
and the rating beside the product title links straight there. The selected tab
lives in the URL rather than in component state, so the link a customer shares is
the thing they were looking at.

The summary is rendered from the product the page already loaded — the detail
endpoint carries `rating`, `reviewCount` and `ratingBreakdown` — so opening the
tab costs **one** request for the reviews themselves, not two. Ten reviews load
at a time behind **Load more**.

Loading state is _derived_, not stored: every result carries the filter it
answers, so "am I waiting?" is "do I hold results for what I am showing?". A
slow request that resolves after a newer one cannot overwrite the list or leave
a spinner running.

## Fabricated ratings are gone

Before Phase 8 the seed wrote placeholder aggregates — a product claimed 4.8
stars from 2,841 reviews that did not exist anywhere. A rating is now a claim
about real reviews, so:

- `pnpm migrate:phase8` recomputes every product's aggregates from the reviews
  that actually exist;
- the seed no longer writes `rating` or `reviewCount` at all;
- `POST`/`PATCH /api/products` no longer accept them — **verified**;
- an unreviewed product reads **"No reviews yet"** rather than `0.0 ★`, which
  would look like a terrible product instead of a new one.

## Setup

```bash
pnpm migrate:phase8    # required once: recompute aggregates, create indexes
pnpm seed:reviews      # optional: populate development with genuine reviews
pnpm seed:reviews --clean
```

The migration is additive and idempotent: it writes only the four aggregate
fields, uses `createIndexes` rather than `syncIndexes` so no existing index is
dropped, and running it twice produces the same result.

`seed:reviews` creates reviews that are **real** in the only sense that matters —
each belongs to a customer record with a delivered order containing that product,
and the aggregates are recomputed from the reviews rather than written by hand.
Demo customers use `@zycart.demo`, which nothing else does, so `--clean` removes
exactly what it created. Demo orders are marked `stockCommitted: false` and do
**not** decrement stock: they stand in for history that already happened, and
taking inventory for them would empty the catalogue.

## Testing

`backend/.verify-phase8/` is scaffolding for the verification described in the
Phase 8 report, not part of the shipped application. It boots the real Express
app against an **isolated database** (the configured name plus `_phase8verify`,
on the same replica set so transactions behave identically), and a second suite
drives real Chrome over the DevTools Protocol to measure layout, contrast and
the write → edit → delete flow.

Manual:

1. Sign in as a customer with a delivered order, open the product, **Reviews**.
2. **Write a review** → submit empty → both errors appear, nothing is sent.
3. Choose a rating, write ten characters, post. The average, the count and the
   distribution all move, and the card carries **Verified purchase**.
4. **Edit your review** → change the rating. The average moves, the count does
   not.
5. **Delete** → confirm. The aggregate returns to where it was.
6. Sign out. The reviews are still readable; the CTA becomes **Sign in**.

## Known limitations

- **Eligibility is `DELIVERED` and nothing else.** A refunded, returned or
  partially cancelled order that reached `DELIVERED` still confers eligibility.
  Tying reviews to returns is a returns system, which does not exist yet.
- **No image upload.** Reviews store URLs, exactly as the catalogue does.
  Uploading, resizing and moderating images is a later phase, and the form asks
  for a link rather than pretending otherwise.
- **Content validation is length and shape only.** It collapses whitespace and
  enforces limits. It is not moderation and does not claim to be.
- **Moderation has no interface.** The two admin endpoints exist and are
  enforced server-side; Phase 8 deliberately does not build an admin dashboard.
- **Auto-approval means `PENDING` is never reached** in normal operation. The
  status exists so a future queue is a policy change rather than a migration.
- **The rate limiter is per-process**, as in earlier phases. Behind a load
  balancer each instance counts separately.
- **Pre-existing, unrelated:** the site navbar overflows its container by 9px at
  exactly 1024px, on every page including the homepage, shop and cart. It
  predates this phase and was left alone; the review section itself has no
  horizontal overflow at 360, 390, 430, 768, 1024, 1280 or 1440px.
