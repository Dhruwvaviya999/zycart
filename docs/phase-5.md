# Phase 5 — Cart & Wishlist

## Goal

Connect the real products of [phase 3](phase-3.md) to the real customers of
[phase 4](phase-4.md), for signed-in shoppers and visitors alike.

```text
Guest            Customer
  │                 │
localStorage     MongoDB
  │                 │
  └──── Express ────┘
        (one resolver)
```

## The central decision: one resolver, two carts

A guest cart and a signed-in cart are priced by **the same server code**.

`resolveCart()` in `cart.service.ts` is the only place cart pricing, availability
and totals exist. The signed-in cart feeds it stored lines; a guest cart posts
its lines to `POST /api/cart/preview`, which resolves them against live products
and stores nothing.

That is why:

- a guest and a customer looking at the same products always see the same numbers;
- a price change is reflected the moment the cart is opened, in both modes;
- the storefront renders one shape and never branches on who is shopping;
- there is no second, client-side copy of the pricing rules to drift out of step.

The cost is one request to show a guest cart. That request was already being made
to resolve product data, so it buys correctness for nothing.

## What a guest stores

Identifiers and quantities. Nothing else.

```json
{ "productId": "…", "quantity": 2, "selectedColor": "Sail / Orange", "selectedSize": "UK 6" }
```

No price, no name, no stock, no discount. A stale browser therefore cannot quote
an old price: everything shown is priced by the API on load.

## Models

### Cart

| Field                                    | Notes                                               |
| ---------------------------------------- | --------------------------------------------------- |
| `user`                                   | ObjectId → User, **unique** — one cart per customer |
| `items[].product`                        | ObjectId → Product                                  |
| `items[].quantity`                       | 1 … `MAX_CART_QUANTITY` (10)                        |
| `items[].selectedColor` / `selectedSize` | The chosen variant, or null                         |
| `items[].addedAt`                        |                                                     |

### Wishlist

`user` (unique), `items[].product`, `items[].addedAt`.

Uniqueness on `user` is the only index either model adds — it is what makes "one
cart per customer" a database guarantee rather than something to remember.

A line is identified by **product + variant**: two colourways are two lines, the
same colourway added twice is one line with quantity 2.

## Endpoints

### Cart

| Method   | Path                      | Auth | Purpose                               |
| -------- | ------------------------- | ---- | ------------------------------------- |
| `POST`   | `/api/cart/preview`       | —    | Price a guest's lines; stores nothing |
| `GET`    | `/api/cart`               | ✓    | The stored cart, resolved             |
| `POST`   | `/api/cart/items`         | ✓    | Add, folding into a matching line     |
| `PATCH`  | `/api/cart/items/:itemId` | ✓    | Set quantity                          |
| `DELETE` | `/api/cart/items/:itemId` | ✓    | Remove a line                         |
| `DELETE` | `/api/cart`               | ✓    | Empty the cart                        |
| `POST`   | `/api/cart/merge`         | ✓    | Fold a guest cart in at sign-in       |

A single `PATCH` sets quantity rather than separate increment and decrement
routes: one predictable call, and no way for two in-flight nudges to race.

### Wishlist

| Method   | Path                                       | Auth | Purpose              |
| -------- | ------------------------------------------ | ---- | -------------------- |
| `GET`    | `/api/wishlist`                            | ✓    | Saved products       |
| `POST`   | `/api/wishlist/items`                      | ✓    | Save (idempotent)    |
| `DELETE` | `/api/wishlist/items/:itemId`              | ✓    | Unsave               |
| `DELETE` | `/api/wishlist`                            | ✓    | Clear                |
| `POST`   | `/api/wishlist/items/:itemId/move-to-cart` | ✓    | Move one to the cart |

`move-to-cart` answers with **both** lists, so the client never has to guess the
resulting state. The cart write happens first: if it fails — sold out, a variant
no longer offered — the item stays saved and nothing is lost.

## Cart response

```json
{
  "success": true,
  "data": {
    "items": [{
      "id": "…", "quantity": 2, "selectedColor": "…", "selectedSize": "…",
      "availability": "low_stock", "maxQuantity": 3, "lineTotal": 16990,
      "product": { "id": "…", "name": "…", "price": 8495, "stock": 3, … }
    }],
    "itemCount": 3, "subtotal": 18889, "savings": 7000,
    "notices": ["Only 3 left of Air Max Heritage Runner."]
  }
}
```

`itemCount` and `subtotal` are computed from current product prices on every
response and are never stored. `product` is `null` once the product has been
deleted or deactivated.

## Rules the server enforces

**Quantity** must be a whole number from 1 to 10. Zero, negatives, decimals,
strings and oversized values are all `400`s.

**Stock is clamped, not rejected.** Asking for 10 of something with 3 left puts 3
in the bag and says so in `notices`. One consistent strategy across add, update
and merge, so the interface and the API can never disagree. Adding something with
zero stock is a `409`.

**Variants are matched against the product.** A colour or size the product does
not offer is a `400`; a product that has options refuses to be added without
them. Nothing is ever chosen on the customer's behalf.

**Prices come from the product, never the request.** `price`, `subtotal` and
`userId` are not accepted anywhere — the schemas are `.strict()`, so sending one
is a validation failure rather than something quietly ignored.

**Ownership is derived from the session.** Every cart and wishlist route reads
the user from the verified cookie. There is no route that takes a user id, so
another customer's line simply is not found.

**Stale products degrade, they do not vanish.** A deleted or deactivated product
resolves to `availability: "unavailable"` with a null product, is excluded from
the subtotal, and can still be removed. Deleting someone's item without asking is
not ours to do.

## Guest → account merge

```text
sign in ──▶ merge attempt ──┬── success ──▶ guest cart cleared
                            └── failure ──▶ guest cart kept + message
```

The merge is **additive**. The account cart is never overwritten.

- Same product and same variant → quantities are summed, then clamped to stock.
- Different variant → a separate line.
- A product the account already had and the guest did not → untouched.
- A guest item that is gone or out of stock → skipped, and reported in `notices`;
  the rest of the merge still succeeds.

**The local cart is only cleared once the server confirms.** `mergeGuestCart()`
clears `guestLines` inside the success branch and nowhere else, so a failed merge
leaves the guest cart exactly where it was and the sign-in form shows a message
saying nothing was lost. This is the one place in the phase where a mistake would
silently cost a customer their basket, so it is written to fail safe.

The wishlist is carried across the same way. Saves are idempotent server-side, so
a partial retry cannot duplicate.

## Frontend

### Stores

`cart-store.ts` holds `guestLines` (persisted), the resolved `cart`, a `status`
and a `mode` of `guest` or `account`. Every action branches on `mode` internally,
so components call `add()` and `setQuantity()` without knowing who is shopping.
Only `guestLines` is written to local storage.

`wishlist-store.ts` mirrors it with `guestIds`.

`<ShopSync>` in the root layout rehydrates both stores in an effect — never at
module scope, which on the server would leak one request's state into another's —
and then sets the mode from the resolved session, which triggers the first load.

### What the UI reads

| Surface       | Source                                                       |
| ------------- | ------------------------------------------------------------ |
| Navbar badge  | `cart.itemCount` — total units, matching the cart page       |
| Cart page     | the resolved `cart`, whichever mode produced it              |
| Wishlist page | the resolved wishlist, rendered with the usual `ProductCard` |
| Heart icon    | derived from the resolved wishlist, so it cannot drift       |

Guest quantity changes apply instantly using the price the server sent moments
ago — arithmetic, not a second pricing implementation — and are re-resolved
authoritatively on the next load. Signed-in writes wait for the server and lock
that one line while they are in flight, so a double click cannot double-apply.

### Variant selection

A product with options is never added on a guess. Quick add on a card opens a
compact picker; the product page validates before it calls the API and says
"Please choose a size" beside the control. Both use the same `VariantPicker`.

## Known limitations

**No inventory reservation.** Cart quantity is an intention to purchase. Stock is
checked when the cart is read or written, but nothing is held — final validation
belongs to order creation.

**No cross-tab synchronisation.** Two tabs can drift until one reloads. Building
storage-event plumbing was not warranted; the cart is re-resolved on every load.

**Guest "save for later" keeps a product in the browser only** — it moves the
line into the guest wishlist, which merges at sign-in like everything else.

**Checkout is not implemented.** The button is present and disabled when nothing
is payable; shipping and tax are named but deliberately not costed, because
inventing a figure the customer would later be charged differently for is worse
than saying it is decided at checkout.
