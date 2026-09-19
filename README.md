# Zycart

AI-powered e-commerce application.

Smart shopping, beautifully simplified.

This repository contains **Phase 1 (project foundation)**, **Phase 2 (storefront
UI)**, **Phase 3 (product catalogue)**, **Phase 4 (accounts)**, **Phase 5 (cart
& wishlist)**, **Phase 6 (checkout & orders)** and **Phase 7 (Razorpay
payments)** — a Next.js storefront backed by a real MongoDB catalogue, customer
accounts, a persistent cart, and ordering paid either online or on delivery,
served over an Express + TypeScript API.

Orders can be paid online through Razorpay or settled in cash on delivery. AI
functionality does not exist yet.

Phase notes live in [`docs/`](docs/) — [phase 1](docs/phase-1.md),
[phase 2](docs/phase-2.md), [phase 3](docs/phase-3.md), [phase 4](docs/phase-4.md),
[phase 5](docs/phase-5.md), [phase 6](docs/phase-6.md),
[phase 7](docs/phase-7.md).

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

| Tool       | Purpose                     |
| ---------- | --------------------------- |
| Node.js    | Runtime                     |
| Express    | HTTP framework              |
| TypeScript | Static typing               |
| MongoDB    | Database                    |
| Mongoose   | ODM                         |
| Zod        | Schema and env validation   |
| Razorpay   | Online payments             |
| dotenv     | Environment loading         |
| cors       | Cross-origin access control |
| helmet     | Security headers            |

### Development

pnpm workspaces, ESLint, Prettier, Git.

---

## Structure

```text
zycart/
├── frontend/              # Next.js app (App Router)
│   ├── app/               # Routes, layout, design tokens (globals.css)
│   ├── components/        # Shared React components
│   │   ├── account/       # Account dashboard
│   │   ├── cart/          # Cart
│   │   ├── common/        # Breadcrumbs, empty/loading/error states
│   │   ├── layout/        # Navbar, footer, container, theme
│   │   ├── order/         # Order card, status, timeline, cancellation
│   │   ├── payment/       # Method selector, processing, failure, status
│   │   ├── product/       # Product card, grid, gallery, price, rating
│   │   ├── search/        # Search trigger and overlay
│   │   ├── shop/          # Listing page, filters
│   │   ├── store/         # Homepage sections
│   │   ├── ui/            # shadcn/ui primitives
│   │   └── wishlist/      # Wishlist
│   ├── data/              # Marketing copy, navigation, sample reviews/account
│   ├── hooks/             # Custom React hooks
│   ├── lib/               # Framework-agnostic helpers (format.ts, utils.ts)
│   ├── services/          # API clients: api, product, category, brand,
│   │                      #   cart, wishlist, order, user, payment
│   ├── store/             # Zustand stores (cart, wishlist, UI)
│   ├── types/             # Shared TypeScript types
│   └── public/            # Static assets
│
├── backend/
│   └── src/
│       ├── config/        # env.ts (validation), database.ts (Mongoose connection)
│       ├── controllers/   # Request handlers
│       ├── middleware/    # Error handling, 404
│       ├── models/        # product, category, brand, cart, order, webhook-event
│       ├── routes/        # Route definitions only
│       ├── services/      # Database and business logic (incl. payment, razorpay)
│       ├── utils/         # AppError, asyncHandler, slugify, seed, money,
│       │                  #   payment-signature, migrate-phase7
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

If your database already holds orders created before Phase 7, run the one-off
migration as well:

```bash
pnpm migrate:phase7
```

It backfills the `stockCommitted` flag and creates the payment indexes. Additive
and idempotent — it never drops or overwrites anything.

### 7. Start the backend

```bash
pnpm dev:backend
```

Expected output:

```text
MongoDB connected: 127.0.0.1/zycart
Server listening on http://localhost:5000 (development)
Health check: http://localhost:5000/api/health
CORS origin: http://localhost:3000
```

### 8. Start the frontend

```bash
pnpm dev:frontend
```

Open <http://localhost:3000>. The storefront reads its catalogue from the API, so
**the backend must be running and the database seeded** for products to appear.

### Routes

| Route              | Page                                                        |
| ------------------ | ----------------------------------------------------------- |
| `/`                | Homepage — hero, categories, trending, promos, best sellers |
| `/shop`            | Product listing with search, filters and sorting            |
| `/products/[slug]` | Product detail — gallery, variants, specs, reviews          |
| `/cart`            | Cart, saved for later and order summary                     |
| `/wishlist`        | Saved products                                              |
| `/account`         | Profile, orders, wishlist, addresses, settings              |

Light and dark themes are both designed; the toggle sits in the navbar (and in
the mobile menu). `Ctrl`/`Cmd` + `K` opens search from anywhere.

---

## Development Commands

Run from the repository root:

| Command               | Effect                                  |
| --------------------- | --------------------------------------- |
| `pnpm dev`            | Start backend and frontend together     |
| `pnpm dev:backend`    | Start the API on port 5000 with reload  |
| `pnpm dev:frontend`   | Start Next.js on port 3000              |
| `pnpm build`          | Build both applications                 |
| `pnpm typecheck`      | Type-check both applications            |
| `pnpm lint`           | Lint both applications                  |
| `pnpm format`         | Format the repository with Prettier     |
| `pnpm seed`           | Load the development catalogue          |
| `pnpm migrate:phase7` | Backfill pre-Phase-7 orders and indexes |

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
`NEXT_PUBLIC_` variable, or anywhere the browser can reach.

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
write endpoints are unauthenticated development APIs until auth lands.

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
idempotent payment finalisation and atomic inventory. AI features
arrive in later phases.
