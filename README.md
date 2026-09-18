# Zycart

AI-powered e-commerce application.

Smart shopping, beautifully simplified.

This repository contains **Phase 1 (project foundation)**, **Phase 2 (storefront
UI)**, **Phase 3 (product catalogue)** and **Phase 4 (accounts)** — a Next.js
storefront backed by a real MongoDB catalogue and customer accounts, served over
an Express + TypeScript API.

Cart, orders, payments and AI functionality do not exist yet. The cart and
wishlist keep product ids in your browser.

Phase notes live in [`docs/`](docs/) — [phase 1](docs/phase-1.md),
[phase 2](docs/phase-2.md), [phase 3](docs/phase-3.md), [phase 4](docs/phase-4.md).

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
│   │   ├── product/       # Product card, grid, gallery, price, rating
│   │   ├── search/        # Search trigger and overlay
│   │   ├── shop/          # Listing page, filters
│   │   ├── store/         # Homepage sections
│   │   ├── ui/            # shadcn/ui primitives
│   │   └── wishlist/      # Wishlist
│   ├── data/              # Marketing copy, navigation, sample reviews/account
│   ├── hooks/             # Custom React hooks
│   ├── lib/               # Framework-agnostic helpers (format.ts, utils.ts)
│   ├── services/          # API clients: api, product, category, brand
│   ├── store/             # Zustand stores (cart, wishlist, UI)
│   ├── types/             # Shared TypeScript types
│   └── public/            # Static assets
│
├── backend/
│   └── src/
│       ├── config/        # env.ts (validation), database.ts (Mongoose connection)
│       ├── controllers/   # Request handlers
│       ├── middleware/    # Error handling, 404
│       ├── models/        # product, category, brand
│       ├── routes/        # Route definitions only
│       ├── services/      # Database and business logic
│       ├── utils/         # AppError, asyncHandler, slugify, seed
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

| Command             | Effect                                 |
| ------------------- | -------------------------------------- |
| `pnpm dev`          | Start backend and frontend together    |
| `pnpm dev:backend`  | Start the API on port 5000 with reload |
| `pnpm dev:frontend` | Start Next.js on port 3000             |
| `pnpm build`        | Build both applications                |
| `pnpm typecheck`    | Type-check both applications           |
| `pnpm lint`         | Lint both applications                 |
| `pnpm format`       | Format the repository with Prettier    |
| `pnpm seed`         | Load the development catalogue         |

Per application:

| Location    | Command      | Effect                               |
| ----------- | ------------ | ------------------------------------ |
| `backend/`  | `pnpm dev`   | `tsx watch src/server.ts`            |
| `backend/`  | `pnpm build` | Compile TypeScript to `dist/`        |
| `backend/`  | `pnpm start` | Run the compiled server from `dist/` |
| `backend/`  | `pnpm seed`  | Load the development catalogue       |
| `frontend/` | `pnpm dev`   | Next.js dev server                   |
| `frontend/` | `pnpm build` | Production build                     |
| `frontend/` | `pnpm start` | Serve the production build           |

---

## Environment Variables

### `backend/.env`

| Variable         | Required | Default                 | Description                                    |
| ---------------- | -------- | ----------------------- | ---------------------------------------------- |
| `PORT`           | No       | `5000`                  | API port                                       |
| `NODE_ENV`       | No       | `development`           | development, test, or production               |
| `MONGODB_URI`    | **Yes**  | none                    | Mongoose connection string                     |
| `CLIENT_URL`     | No       | `http://localhost:3000` | Origin allowed by CORS                         |
| `JWT_SECRET`     | **Yes**  | none                    | Signing key for session tokens; 32+ characters |
| `JWT_EXPIRES_IN` | No       | `7d`                    | Session lifetime, e.g. `12h` or `7d`           |

### `frontend/.env.local`

| Variable              | Required | Default                 | Description      |
| --------------------- | -------- | ----------------------- | ---------------- |
| `NEXT_PUBLIC_API_URL` | No       | `http://localhost:5000` | Backend base URL |

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
sessions and saved addresses. Cart and order APIs, payments, and AI features
arrive in later phases.
