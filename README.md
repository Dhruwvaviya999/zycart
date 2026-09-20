# Zycart

AI-powered e-commerce application.

Smart shopping, beautifully simplified.

This repository contains **Phase 1 (project foundation)**, **Phase 2 (storefront
UI)**, **Phase 3 (product catalogue)**, **Phase 4 (accounts)**, **Phase 5 (cart
& wishlist)**, **Phase 6 (checkout & orders)**, **Phase 7 (Razorpay payments)**,
**Phase 8 (reviews & ratings)**, **Phase 9 (admin console)**, **Phase 10 (AI
shopping assistant)**, **Phase 11 (AI discovery, smart search &
recommendations)** and **Phase 12 (admin operations, inventory & fulfilment)** —
a Next.js storefront backed by a real MongoDB catalogue, customer accounts, a
persistent cart, ordering paid either online or on delivery, ratings written only
by customers who received what they are rating, a console to run the store, a
shopping assistant that answers from the live catalogue, natural-language search
with behaviour-based recommendations, and an operations console with a full
inventory ledger and audit trail, served over an Express + TypeScript API.

Orders can be paid online through Razorpay or settled in cash on delivery, and
every rating on the site comes from a verified purchase.

**ZyCart AI** is a shopping assistant, not a chatbot bolted on. It reaches the
catalogue and the cart through five explicitly defined server-side tools that
call the storefront's own services — so its prices, stock and ratings are the
same ones `/shop` shows, and it has no route to the database, no way to place an
order and no access to anyone's account details. It is optional: leave
`AI_API_KEY` blank and the entire store works exactly as before.

**Every unit of stock can be accounted for.** `Product.stock` is the one
authoritative sellable quantity, and from Phase 12 every change to it — a sale, a
cancellation, an opening quantity, an operator's correction — writes a movement
in the same transaction, recording what changed, by how much, why, when and who
did it. Stock is corrected by a signed amount and a reason applied atomically,
never by typing a new total over whatever was there, so two operators working at
once cannot overwrite each other and stock can never go negative.

**ZyCart discovers as well as it answers.** Typing a sentence into the shop's
search box — "black shoes under ₹15,000", "highly rated headphones" — resolves
to ordinary catalogue filters and an ordinary shareable URL, so paging, sorting,
the filter panel and the back button all keep working. Similar products and
recommendations are deterministic server-side code rather than model calls: the
same page shows the same products every time, and every result can be explained.

Phase notes live in [`docs/`](docs/) — [phase 1](docs/phase-1.md),
[phase 2](docs/phase-2.md), [phase 3](docs/phase-3.md), [phase 4](docs/phase-4.md),
[phase 5](docs/phase-5.md), [phase 6](docs/phase-6.md),
[phase 7](docs/phase-7.md), [phase 8](docs/phase-8.md),
[phase 9](docs/phase-9.md), [phase 10](docs/phase-10.md),
[phase 11](docs/phase-11.md), [phase 12](docs/phase-12.md).

---

## Stack

### Frontend

| Tool         | Purpose                      |
| ------------ | ---------------------------- |
| Next.js      | React framework (App Router) |
| TypeScript   | Static typing                |
| Tailwind CSS | Styling                      |
| shadcn/ui    | UI component primitives      |
| Axios        | HTTP client                  |
| Zustand      | Client state management      |

### Backend

| Tool              | Purpose                            |
| ----------------- | ---------------------------------- |
| Node.js           | Runtime                            |
| Express           | HTTP framework                     |
| TypeScript        | Static typing                      |
| MongoDB           | Database                           |
| Mongoose          | ODM                                |
| Zod               | Schema and env validation          |
| Razorpay          | Online payments                    |
| Anthropic SDK     | AI provider — Claude (server-only) |
| Google Gen AI SDK | AI provider — Gemini (server-only) |
| dotenv            | Environment loading                |
| cors              | Cross-origin access control        |
| helmet            | Security headers                   |

### Development

pnpm workspaces, ESLint, Prettier, Git.

---

## Structure

```text
zycart/
├── frontend/              # Next.js app (App Router)
│   ├── app/               # Routes, layout, design tokens (globals.css)
│   │   ├── (storefront)/  # Shopper-facing routes + the shop's chrome
│   │   └── admin/         # Admin console (its own shell, own chrome)
│   ├── components/        # Shared React components
│   │   ├── account/       # Account dashboard
│   │   ├── admin/         # Console shell, filters, tables, forms,
│   │   │                  #   inventory adjustment, timelines, audit log
│   │   ├── cart/          # Cart
│   │   ├── common/        # Breadcrumbs, empty/loading/error states
│   │   ├── layout/        # Navbar, footer, container, theme
│   │   ├── order/         # Order card, status, timeline, cancellation
│   │   ├── payment/       # Method selector, processing, failure, status
│   │   ├── product/       # Product card, grid, gallery, price, rating, tabs
│   │   ├── reviews/       # Rating summary, selector, cards, form, filters
│   │   ├── ai/            # Launcher, panel, chat, messages, product cards
│   │   ├── recommendations/ # Rails, skeletons, product-view tracking
│   │   ├── search/        # Search trigger and overlay
│   │   ├── shop/          # Listing page, filters
│   │   ├── store/         # Homepage sections
│   │   ├── ui/            # shadcn/ui primitives
│   │   └── wishlist/      # Wishlist
│   ├── data/              # Marketing copy, navigation, sample reviews/account
│   ├── hooks/             # Custom React hooks
│   ├── lib/               # Framework-agnostic helpers (format.ts, ai-text.ts)
│   ├── services/          # API clients: api, product, category, brand,
│   │                      #   cart, wishlist, order, user, payment, review, ai
│   ├── store/             # Zustand stores (cart, wishlist, UI)
│   ├── types/             # Shared TypeScript types
│   └── public/            # Static assets
│
├── backend/
│   └── src/
│       ├── config/        # env.ts, ai.ts (AI config + limits), database.ts
│       ├── controllers/   # Request handlers
│       ├── middleware/    # Error handling, 404, auth, role, adminOnly
│       ├── models/        # product, category, brand, cart, order,
│       │                  #   webhook-event, review, user-activity,
│       │                  #   inventory-movement, audit-log
│       ├── routes/        # Route definitions only
│       ├── services/      # Database and business logic (incl. payment, razorpay)
│       │   ├── admin/     # Dashboard, catalogue, orders, customers, reviews,
│       │   │              #   audit trail, operations (attention rules, bulk)
│       │   ├── inventory/ # Stock ledger, atomic adjustment, thresholds
│       │   ├── ai/        # Provider abstraction, prompts, tools, interpreter
│       │   ├── activity/  # Minimal behaviour recording for recommendations
│       │   ├── recommendation/ # Similarity and deterministic scoring
│       │   └── search/    # Query classification, relevance, smart search
│       ├── utils/         # AppError, asyncHandler, slugify, seed, money,
│       │                  #   actor, payment-signature, migrate-phase7,
│       │                  #   migrate-phase8, migrate-phase12,
│       │                  #   seed-reviews, make-admin
│       ├── validators/    # Zod request and query schemas
│       ├── app.ts         # Express app assembly
│       └── server.ts      # Env load -> DB connect -> listen
│
├── docs/                  # Project documentation
├── package.json           # Workspace scripts
└── pnpm-workspace.yaml    # Workspace definition
```

Frontend and backend are independent applications inside one pnpm workspace. They
share no code; they communicate only over HTTP.

---

## Requirements

| Requirement | Version                                       |
| ----------- | --------------------------------------------- |
| Node.js     | >= 20 (developed on 24.13.1)                  |
| pnpm        | >= 10 (developed on 12.4.2)                   |
| MongoDB     | A reachable instance - local or MongoDB Atlas |
| Git         | Any recent version                            |

Install pnpm with `npm install -g pnpm` or `corepack enable pnpm`.

---

## Setup

### 1. Clone the repository

```bash
git clone <repository-url> zycart
cd zycart
```

### 2 and 3. Install dependencies

One command installs both applications:

```bash
pnpm install
```

To install them individually instead:

```bash
pnpm --filter zycart-frontend install
pnpm --filter zycart-backend install
```

### 4. Configure environment variables

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Then edit `backend/.env` and set `MONGODB_URI` and `JWT_SECRET`. The server
refuses to start without either — no defaults are assumed.

Generate a signing key with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

**Online payment is optional.** Leave the three `RAZORPAY_*` variables blank to
run cash-on-delivery only — checkout simply does not offer the online option,
and the server reports it at startup. To enable it, set all three (and
`NEXT_PUBLIC_RAZORPAY_KEY_ID` on the frontend); setting only some of them is
refused at startup. Full walkthrough in [docs/phase-7.md](docs/phase-7.md#setup).

### 5. Start MongoDB

Local install:

```bash
mongod --dbpath /path/to/data
```

Then set `MONGODB_URI=mongodb://127.0.0.1:27017/zycart`.

MongoDB Atlas: create a cluster, allow your IP, and paste the connection string into
`MONGODB_URI`. Never commit it.

### 6. Seed the catalogue

```bash
pnpm seed
```

This loads 6 categories, 21 brands and 36 products. It clears those three
collections first, so it is safe to re-run and it touches nothing else.

If your database already holds data created before Phase 7 or Phase 8, run the
one-off migrations as well:

```bash
pnpm migrate:phase7
pnpm migrate:phase8
```

The first backfills the `stockCommitted` flag and creates the payment indexes.
The second recomputes every product's rating from the reviews that actually
exist and creates the review indexes. Both are additive and idempotent — neither
drops or overwrites anything.

**Products start unrated.** From Phase 8 a rating is a claim about real,
purchase-verified reviews, so the catalogue earns its stars rather than shipping
with them. To populate a development storefront with genuine reviews — real
customers, real delivered orders — run:

```bash
pnpm seed:reviews          # add them
pnpm seed:reviews --clean  # remove exactly what it added
```

### 7. Optional — enable ZyCart AI

Set `AI_API_KEY` in `backend/.env` to a key from your AI provider. Leave it
blank and the storefront runs exactly as before, with no assistant offered
anywhere — the server reports which it is at startup:

```text
ZyCart AI: anthropic (claude-opus-5)
ZyCart AI: not configured - the assistant is unavailable (AI_API_KEY is not set).
```

To work on the assistant's interface without credentials, set
`AI_PROVIDER=mock`. It answers from a fixed script against the **real**
catalogue, so the tools, the cart writes and the whole UI behave normally. It is
refused when `NODE_ENV=production`.

The key is server-only. It is never logged, never printed at startup, never
included in an error message and never sent to the browser.

### 8. Start the backend

```bash
pnpm dev:backend
```

Expected output:

```text
MongoDB connected: 127.0.0.1/zycart
Server listening on http://localhost:5000 (development)
Health check: http://localhost:5000/api/health
CORS origin: http://localhost:3000
Razorpay: not configured - online payment is unavailable and checkout offers cash on delivery only.
ZyCart AI: anthropic (claude-opus-5)
```

Both optional features report their state on every boot, so "payments are off"
and "the assistant is off" are things an operator reads here rather than learns
from a customer.

### 9. Start the frontend

```bash
pnpm dev:frontend
```

Open <http://localhost:3000>. The storefront reads its catalogue from the API, so
**the backend must be running and the database seeded** for products to appear.

### Routes

| Route               | Page                                                        |
| ------------------- | ----------------------------------------------------------- |
| `/`                 | Homepage — hero, categories, trending, promos, best sellers |
| `/shop`             | Product listing with search, filters and sorting            |
| `/products/[slug]`  | Product detail — gallery, variants, specs, reviews          |
| `/cart`             | Cart, saved for later and order summary                     |
| `/wishlist`         | Saved products                                              |
| `/account`          | Profile, orders, wishlist, addresses, settings              |
| `/ai-shopping`      | ZyCart AI with the whole page — the same chat as the panel  |
| `/admin`            | Admin console — requires an `ADMIN` account (see below)     |
| `/admin/inventory`  | Stock levels, adjustment and per-product stock history      |
| `/admin/operations` | Orders that need a person, and fulfilment queue depth       |
| `/admin/activity`   | Audit trail — who changed what, and when                    |

Shopper-facing routes live in the `(storefront)` route group, which gives them
the navbar, promo bar and footer. The console has its own shell and inherits
none of it. Route groups do not change URLs.

Light and dark themes are both designed; the toggle sits in the navbar (and in
the mobile menu). `Ctrl`/`Cmd` + `K` opens search from anywhere, and **Ask
ZyCart AI** in the bottom corner opens the assistant from any storefront page.
Traditional keyword search and filters are untouched — the assistant is an
additional way in, not a replacement.

---

## Development Commands

Run from the repository root:

| Command                | Effect                                                             |
| ---------------------- | ------------------------------------------------------------------ |
| `pnpm dev`             | Start backend and frontend together                                |
| `pnpm dev:backend`     | Start the API on port 5000 with reload                             |
| `pnpm dev:frontend`    | Start Next.js on port 3000                                         |
| `pnpm build`           | Build both applications                                            |
| `pnpm typecheck`       | Type-check both applications                                       |
| `pnpm lint`            | Lint both applications                                             |
| `pnpm format`          | Format the repository with Prettier                                |
| `pnpm seed`            | Load the development catalogue                                     |
| `pnpm migrate:phase7`  | Backfill pre-Phase-7 orders and indexes                            |
| `pnpm migrate:phase8`  | Recompute rating aggregates, create review indexes                 |
| `pnpm migrate:phase12` | Create inventory-movement, audit-log and stock indexes             |
| `pnpm seed:reviews`    | Populate development with genuine reviews (`--clean` removes them) |
| `pnpm make-admin`      | Grant, revoke or list administrator access (see below)             |

Backend checks, run from `backend/`:

| Command                 | Effect                                                            |
| ----------------------- | ----------------------------------------------------------------- |
| `pnpm test`             | 199 unit tests — AI, discovery, inventory and operations; no DB   |
| `pnpm ai:verify`        | 43 checks of every AI tool against a real MongoDB, then cleans up |
| `pnpm discovery:verify` | 63 checks of search, similarity and recommendations               |
| `pnpm inventory:verify` | 48 checks of stock adjustment, concurrency and the ledger         |

All three verify scripts create their own records under a reserved prefix
(`ZYCART-AI-TEST-`, `ZYCART-P11-`, `ZYCART-P12-`), never touch a record they
did not create,
and remove exactly those at the end — so both are safe to point at a real
database.

Per application:

| Location    | Command               | Effect                               |
| ----------- | --------------------- | ------------------------------------ |
| `backend/`  | `pnpm dev`            | `tsx watch src/server.ts`            |
| `backend/`  | `pnpm build`          | Compile TypeScript to `dist/`        |
| `backend/`  | `pnpm start`          | Run the compiled server from `dist/` |
| `backend/`  | `pnpm seed`           | Load the development catalogue       |
| `backend/`  | `pnpm migrate:phase7` | One-off Phase 7 data migration       |
| `frontend/` | `pnpm dev`            | Next.js dev server                   |
| `frontend/` | `pnpm build`          | Production build                     |
| `frontend/` | `pnpm start`          | Serve the production build           |

---

## Environment Variables

### `backend/.env`

| Variable                  | Required | Default                 | Description                                                                 |
| ------------------------- | -------- | ----------------------- | --------------------------------------------------------------------------- |
| `PORT`                    | No       | `5000`                  | API port                                                                    |
| `NODE_ENV`                | No       | `development`           | development, test, or production                                            |
| `MONGODB_URI`             | **Yes**  | none                    | Mongoose connection string                                                  |
| `CLIENT_URL`              | No       | `http://localhost:3000` | Origin allowed by CORS                                                      |
| `JWT_SECRET`              | **Yes**  | none                    | Signing key for session tokens; 32+ characters                              |
| `JWT_EXPIRES_IN`          | No       | `7d`                    | Session lifetime, e.g. `12h` or `7d`                                        |
| `RAZORPAY_KEY_ID`         | Group\*  | none                    | Razorpay key id, `rzp_test_…` or `rzp_live_…`                               |
| `RAZORPAY_KEY_SECRET`     | Group\*  | none                    | Razorpay API secret — **server-only**                                       |
| `RAZORPAY_WEBHOOK_SECRET` | Group\*  | none                    | Webhook signing secret — **server-only**, and different from the key secret |
| `AI_ENABLED`              | No       | `true`                  | `false` runs ZyCart with no shopping assistant                              |
| `AI_PROVIDER`             | No       | `anthropic`             | `anthropic`, `gemini`, or `mock` for tests and offline UI work              |
| `AI_API_KEY`              | No†      | none                    | AI provider key — **server-only**; blank means AI features are unavailable  |
| `AI_MODEL`                | No       | per provider            | Model id. Defaults to `claude-opus-5` or `gemini-2.5-flash`                 |
| `AI_TIMEOUT_MS`           | No       | `30000`                 | Per model call; the whole request has its own 55 s deadline                 |
| `AI_RATE_LIMIT_GUEST`     | No       | `10`                    | Chat requests per minute, per IP                                            |
| `AI_RATE_LIMIT_USER`      | No       | `30`                    | Chat requests per minute, per account                                       |

† Optional. Without it the assistant is unavailable and smart search falls back
to keyword search — the storefront, cart, checkout, orders, account,
recommendations and similar products are all unaffected. The server says so at
startup rather than leaving it to be discovered by a customer. `AI_PROVIDER=mock`
returns scripted replies and is **refused in production**: an assistant that
looks real and is not is worse than an honestly unavailable one.

\* All three together, or none of them. Setting some but not others fails
validation at startup; setting none runs ZyCart cash-on-delivery only. A
`rzp_live_` key outside `NODE_ENV=production` is refused, and a `rzp_test_` key
in production is refused.

### `frontend/.env.local`

| Variable                      | Required | Default                 | Description                                                          |
| ----------------------------- | -------- | ----------------------- | -------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`         | No       | `http://localhost:5000` | Backend base URL                                                     |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | No       | none                    | Razorpay key id; public by design — Checkout needs it in the browser |

The Razorpay **key secret** and **webhook secret** must never appear in a
`NEXT_PUBLIC_` variable, or anywhere the browser can reach. The same holds for
`AI_API_KEY`: the browser talks to Express, Express talks to the AI provider, and
there is no `NEXT_PUBLIC_` counterpart to the AI key — nor should one ever be
added. No AI provider SDK is shipped in the client bundle.

Startup fails with a readable message listing every invalid or missing variable,
rather than running half-configured.

---

## API

Base path: `/api`

### `GET /api/health`

Liveness check. Reports non-sensitive runtime information only.

**Response `200`**

```json
{
  "success": true,
  "message": "API is healthy",
  "data": {
    "environment": "development",
    "uptimeSeconds": 12,
    "database": "connected",
    "timestamp": "2026-09-18T10:00:00.000Z"
  }
}
```

`data.database` is one of `connected`, `connecting`, `disconnecting`,
`disconnected`, or `unknown`.

### Authentication and accounts

| Method   | Path                                  | Auth | Purpose                    |
| -------- | ------------------------------------- | ---- | -------------------------- |
| `POST`   | `/api/auth/register`                  | —    | Create an account          |
| `POST`   | `/api/auth/login`                     | —    | Start a session            |
| `POST`   | `/api/auth/logout`                    | —    | End the session            |
| `GET`    | `/api/auth/me`                        | ✓    | The signed-in customer     |
| `GET`    | `/api/users/me`                       | ✓    | Read the profile           |
| `PATCH`  | `/api/users/me`                       | ✓    | Update name, phone, avatar |
| `PATCH`  | `/api/users/me/password`              | ✓    | Change the password        |
| `GET`    | `/api/users/me/addresses`             | ✓    | List addresses             |
| `POST`   | `/api/users/me/addresses`             | ✓    | Add an address             |
| `PATCH`  | `/api/users/me/addresses/:id`         | ✓    | Update an address          |
| `DELETE` | `/api/users/me/addresses/:id`         | ✓    | Delete an address          |
| `PATCH`  | `/api/users/me/addresses/:id/default` | ✓    | Set the default address    |

Sessions are a signed JWT in an HTTP-only cookie. Details and security notes are
in [docs/phase-4.md](docs/phase-4.md).

### Cart and wishlist

| Method   | Path                                       | Auth | Purpose                       |
| -------- | ------------------------------------------ | ---- | ----------------------------- |
| `POST`   | `/api/cart/preview`                        | —    | Price a guest cart            |
| `GET`    | `/api/cart`                                | ✓    | The stored cart               |
| `POST`   | `/api/cart/items`                          | ✓    | Add an item                   |
| `PATCH`  | `/api/cart/items/:itemId`                  | ✓    | Set quantity                  |
| `DELETE` | `/api/cart/items/:itemId`                  | ✓    | Remove an item                |
| `DELETE` | `/api/cart`                                | ✓    | Empty the cart                |
| `POST`   | `/api/cart/merge`                          | ✓    | Merge a guest cart at sign-in |
| `GET`    | `/api/wishlist`                            | ✓    | Saved products                |
| `POST`   | `/api/wishlist/items`                      | ✓    | Save a product                |
| `DELETE` | `/api/wishlist/items/:itemId`              | ✓    | Unsave                        |
| `DELETE` | `/api/wishlist`                            | ✓    | Clear the wishlist            |
| `POST`   | `/api/wishlist/items/:itemId/move-to-cart` | ✓    | Move one to the cart          |

Guests shop without signing in; their cart merges into the account on sign-in.
Prices and stock are always the server's, never the browser's — see
[docs/phase-5.md](docs/phase-5.md).

### Checkout and orders

| Method | Path                           | Auth | Purpose                              |
| ------ | ------------------------------ | ---- | ------------------------------------ |
| `GET`  | `/api/checkout/summary`        | ✓    | Live cart, addresses, blockers       |
| `GET`  | `/api/orders`                  | ✓    | Paginated order history              |
| `POST` | `/api/orders`                  | ✓    | Place an order (`COD` or `RAZORPAY`) |
| `GET`  | `/api/orders/:orderRef`        | ✓    | One order, by number or id           |
| `POST` | `/api/orders/:orderRef/cancel` | ✓    | Cancel and restore stock             |

Orders are snapshots: renaming, repricing or deleting a product never changes
what a past order says. Stock moves inside a MongoDB transaction, so a
cash-on-delivery order can never exist without its stock being taken. See
[docs/phase-6.md](docs/phase-6.md).

### AI

| Method | Path             | Auth     | Purpose                                    |
| ------ | ---------------- | -------- | ------------------------------------------ |
| `GET`  | `/api/ai/status` | —        | Whether the assistant is configured at all |
| `POST` | `/api/ai/chat`   | optional | One conversational turn                    |

`/api/ai/chat` accepts `user` and `assistant` messages and **no other role** —
the system prompt is built server-side on every request and nothing the browser
sends can reach it. Signing in is optional and decides capability: a guest can
search, inspect and compare; a signed-in customer can additionally read their
cart and add to it. Identity comes from the session cookie, never from the body.

The model reaches the store through five tools — `search_products`,
`get_product`, `compare_products`, `get_cart`, `add_to_cart` — each with a
declared permission, a Zod-validated schema and an executor that calls the
storefront's own `productService` or `cartService`. There is no query tool, no
code execution, no checkout, no payment, and no access to profiles, addresses or
order history. Product data in a reply is assembled by the server from what the
tools returned, so a product card's price is the catalogue's price regardless of
what the assistant wrote. See [docs/phase-10.md](docs/phase-10.md).

### Discovery

| Method | Path                              | Auth     | Purpose                                   |
| ------ | --------------------------------- | -------- | ----------------------------------------- |
| `POST` | `/api/search/smart`               | optional | Interpret a search into catalogue filters |
| `GET`  | `/api/products/:idOrSlug/similar` | —        | Deterministic similar products            |
| `GET`  | `/api/recommendations`            | optional | Personalised when there is signal to use  |
| `GET`  | `/api/products/colors`            | —        | Colour families worth filtering on        |
| `POST` | `/api/products/:idOrSlug/view`    | ✓        | Records an intentional product-page visit |

`/api/search/smart` returns an **interpretation**, not products: the storefront
turns it into an ordinary `/shop` URL, so paging, sorting, filters, the back
button and shared links all keep working. A short literal query never reaches a
model at all, and a model that is slow, throttled or unconfigured falls through
to keyword search rather than failing.

Similar products and recommendations involve **no model call** — they are
deterministic scoring over catalogue fields and, for a signed-in customer, their
own recent activity. `personalized: false` is returned honestly whenever there
is not enough signal, which is what stops "Recommended for you" appearing above
a list nobody was recommended. Identity always comes from the session cookie;
`?userId=` is ignored. See [docs/phase-11.md](docs/phase-11.md).

### Payments

| Method | Path                                    | Auth      | Purpose                              |
| ------ | --------------------------------------- | --------- | ------------------------------------ |
| `POST` | `/api/payments/razorpay/create`         | ✓         | Open or reuse a Checkout session     |
| `POST` | `/api/payments/razorpay/verify`         | ✓         | Verify the Checkout callback         |
| `GET`  | `/api/payments/orders/:orderRef/status` | ✓         | Authoritative payment state          |
| `POST` | `/api/payments/razorpay/webhook`        | signature | Razorpay's asynchronous notification |

An online order is created **unpaid and holding no stock**; stock is taken and
the cart cleared only when the payment is confirmed, so an abandoned Checkout
window never locks inventory. One finalisation function serves both the browser
callback and the webhook, and it is idempotent — the same payment confirmed
twice decrements stock once.

No endpoint accepts an amount. The figure charged is derived from the stored
order on the server, and is checked again against the Razorpay API before an
order is confirmed. See [docs/phase-7.md](docs/phase-7.md).

### Reviews

| Method   | Path                                       | Auth  | Purpose                              |
| -------- | ------------------------------------------ | ----- | ------------------------------------ |
| `GET`    | `/api/products/:productId/reviews`         | —     | Approved reviews, filtered and paged |
| `GET`    | `/api/products/:productId/reviews/summary` | —     | Average, count and distribution      |
| `GET`    | `/api/reviews/eligibility/:productId`      | ✓     | May I review this, and have I?       |
| `POST`   | `/api/reviews`                             | ✓     | Write one                            |
| `PATCH`  | `/api/reviews/:reviewId`                   | ✓     | Edit your own                        |
| `DELETE` | `/api/reviews/:reviewId`                   | ✓     | Delete your own                      |
| `GET`    | `/api/reviews/me`                          | ✓     | Everything you have written          |
| `GET`    | `/api/admin/reviews`                       | ADMIN | Moderation queue                     |
| `PATCH`  | `/api/admin/reviews/:reviewId/status`      | ADMIN | Approve or reject                    |

A review can only be created once the server has found a **delivered order
belonging to the authenticated customer containing that product** — there is no
field through which a client can claim a purchase, set `isVerifiedPurchase` or
choose a status. One review per customer per product, enforced by a unique
index. Ratings are derived from approved reviews and maintained atomically. See
[docs/phase-8.md](docs/phase-8.md).

### Catalogue

| Method | Path                              | Purpose                                |
| ------ | --------------------------------- | -------------------------------------- |
| `GET`  | `/api/products`                   | Paginated list with search/filter/sort |
| `GET`  | `/api/products/featured`          | Featured rail                          |
| `GET`  | `/api/products/best-sellers`      | Best sellers rail                      |
| `GET`  | `/api/products/new-arrivals`      | New arrivals rail                      |
| `GET`  | `/api/products/:idOrSlug`         | One product                            |
| `GET`  | `/api/products/:idOrSlug/related` | Same category, excluding itself        |
| `GET`  | `/api/categories`                 | Active categories with product counts  |
| `GET`  | `/api/brands`                     | Active brands                          |

Products, categories and brands also expose `POST`, `PATCH` and `DELETE`. Those
write endpoints require an `ADMIN` session — they were unauthenticated until
Phase 9 closed that gap. Reads stay public, because the storefront needs them.

**Response `200`**

```json
{
  "success": true,
  "data": [{ "id": "...", "name": "Air Max Heritage Runner", "price": 8495 }],
  "pagination": { "page": 1, "limit": 12, "total": 36, "totalPages": 3 }
}
```

Full schemas, every query parameter and more examples are in
[docs/phase-3.md](docs/phase-3.md).

### Admin

Every path below `/api/admin` passes through `requireAuth` and then
`requireRole('ADMIN')` before any handler runs — the guard is mounted once, on
the router, so a route added later cannot be unprotected by omission.

| Method   | Path                                  | Purpose                                        |
| -------- | ------------------------------------- | ---------------------------------------------- |
| `GET`    | `/api/admin/dashboard`                | Metrics, revenue series, attention counts      |
| `GET`    | `/api/admin/products`                 | Catalogue listing, **including inactive**      |
| `POST`   | `/api/admin/products`                 | Create                                         |
| `GET`    | `/api/admin/products/:id`             | One product                                    |
| `PATCH`  | `/api/admin/products/:id`             | Update                                         |
| `DELETE` | `/api/admin/products/:id`             | Delete                                         |
| `GET`    | `/api/admin/categories`               | With product counts                            |
| `POST`   | `/api/admin/categories`               | Create                                         |
| `PATCH`  | `/api/admin/categories/:id`           | Update                                         |
| `DELETE` | `/api/admin/categories/:id`           | Delete                                         |
| `GET`    | `/api/admin/brands`                   | With product counts                            |
| `POST`   | `/api/admin/brands`                   | Create                                         |
| `PATCH`  | `/api/admin/brands/:id`               | Update                                         |
| `DELETE` | `/api/admin/brands/:id`               | Delete                                         |
| `GET`    | `/api/admin/orders`                   | Every order, filterable                        |
| `GET`    | `/api/admin/orders/:orderRef`         | One order + customer + `allowedStatuses`       |
| `PATCH`  | `/api/admin/orders/:orderRef/status`  | **Fulfilment state only**                      |
| `PATCH`  | `/api/admin/orders/bulk-status`       | Up to 50 orders, per-order outcomes            |
| `GET`    | `/api/admin/inventory`                | Stock, scarcest first, filterable              |
| `GET`    | `/api/admin/inventory/summary`        | Health counts, sellable units, thresholds      |
| `GET`    | `/api/admin/inventory/movements`      | The store-wide stock ledger                    |
| `GET`    | `/api/admin/inventory/:id`            | Stock, variants, totals, recent movements      |
| `GET`    | `/api/admin/inventory/:id/movements`  | One product's ledger, paged                    |
| `POST`   | `/api/admin/inventory/:id/adjust`     | **Signed change + reason**, applied atomically |
| `PATCH`  | `/api/admin/inventory/:id/threshold`  | Per-product low-stock threshold                |
| `GET`    | `/api/admin/operations`               | Attention counts and fulfilment queue depth    |
| `GET`    | `/api/admin/audit-logs`               | Every administrative change, filterable        |
| `GET`    | `/api/admin/audit-logs/actors`        | Options for the actor filter                   |
| `GET`    | `/api/admin/customers`                | Customers with lifetime spend                  |
| `GET`    | `/api/admin/customers/:id`            | One customer (addresses counted, not listed)   |
| `PATCH`  | `/api/admin/customers/:id/status`     | Deactivate / reactivate                        |
| `GET`    | `/api/admin/reviews`                  | Every review, filterable by status             |
| `GET`    | `/api/admin/reviews/:reviewId`        | One review + its order evidence                |
| `PATCH`  | `/api/admin/reviews/:reviewId/status` | Approve / reject                               |

Four things are deliberately absent:

- **No `mark-paid`.** Payment state is grounded in what Razorpay reports. An
  administrative shortcut that asserted it would make every **Paid** badge in
  ZyCart mean less. Cancelling an order whose payment has settled is refused
  for the administrator exactly as it is for the customer.
- **No role change.** Promotion to administrator is not a dropdown in a
  customer list.
- **No `stock` on `PATCH /api/admin/products/:id`.** Setting a total silently
  discards whatever happened between the form loading and saving, and carries
  no reason for the change. Stock moves through the adjustment endpoint, which
  takes a signed amount and a reason and applies both in one atomic update. An
  older client still sending the field gets a successful update in which it is
  simply not honoured.
- **No bulk cancellation.** Cancelling restores stock and may owe a refund, so
  it stays a single-order, confirmed decision. `bulk-status` accepts only
  forward moves, and the schema is what enforces that.

Adjusting stock:

```http
POST /api/admin/inventory/671f2a8c.../adjust
{ "quantityChange": -7, "reason": "DAMAGED", "note": "Crushed in transit" }
```

```json
{
  "success": true,
  "data": {
    "productName": "Nike Air Max",
    "quantityBefore": 24,
    "quantityChange": -7,
    "quantityAfter": 17,
    "stockState": "in_stock",
    "stale": false
  }
}
```

The response carries the quantity the server actually found, not the one the
browser was showing — so a screen that had gone stale is told so rather than
reporting a number nobody predicted. A reduction larger than the stock on hand
is refused with `409` and a sentence naming the real quantity.

**Not signed in - `401`** · **Signed in as a customer - `403`**

```json
{
  "success": false,
  "message": "You do not have permission to perform this action"
}
```

#### Granting administrator access

No account is an administrator by default, and no page creates one. Run from
the repository root:

```bash
pnpm make-admin owner@example.com          # grant
pnpm make-admin owner@example.com --revoke # revoke
pnpm make-admin --list                     # who currently has it
```

Full detail — metric definitions, the status transition table, the role gate and
the responsive strategy — is in [docs/phase-9.md](docs/phase-9.md).

### Errors

Every error returns the same shape.

**Unknown route - `404`**

```json
{
  "success": false,
  "message": "Route not found"
}
```

**Validation failure - `400`**

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [{ "path": "email", "message": "Invalid email" }]
}
```

**Unexpected failure - `500`**

```json
{
  "success": false,
  "message": "Internal server error"
}
```

Internal details are logged server-side and never returned to the client.

---

## Roadmap

Phase 1 established the frontend, backend, and MongoDB foundation. Phase 2 built
the storefront UI on mock data. Phase 3 replaced that mock data with a real
MongoDB catalogue and the API that serves it. Phase 4 added customer accounts,
sessions and saved addresses. Phase 5 made the cart and wishlist real and
persistent, for guests and customers alike. Phase 6 added checkout, cash-on-
delivery orders, order history and cancellation. Phase 7 added Razorpay online
payment — server-created gateway orders, signature and webhook verification,
idempotent payment finalisation and atomic inventory. Phase 8 added reviews and
ratings, written only by customers with a delivered order for the product they
are rating. Phase 9 added the admin console — dashboard, catalogue, orders,
customers and review moderation — reusing the storefront's own services rather
than forking them, and closed the unauthenticated catalogue write endpoints.
Phase 10 added ZyCart AI — a shopping assistant that reads the live catalogue
and writes to the real cart through five permission-checked server-side tools,
with no route to the database and no ability to place an order or take a
payment. Phase 11 took discovery out of the chat window: natural-language search
that resolves to ordinary shareable filters, deterministic similar products, and
recommendations built from a customer's own recent activity — with the model
used for reading sentences and nothing else, and every path still working when
it is unavailable. It also proved the Phase 10 provider boundary by adding a
second vendor, Gemini, in one file. Phase 12 turned the admin console into an
operations console: an inventory ledger that records every stock movement with a
reason and an actor, an atomic adjustment endpoint that takes a signed amount
rather than a total, per-product low-stock thresholds, an audit trail of every
administrative change, an exception queue built from rules that are decidable
from stored data, order timelines assembled only from recorded timestamps, and
safe bulk fulfilment that reports per-order outcomes. It also closed the last
path through which stock could be set silently — the product form's stock field.

Later phases can build on that foundation: semantic and vector search, review
summaries, image search, saved conversations, and a granular permission model
for staff who should see stock without being able to move it. None of them
require reopening the boundaries these phases established.
