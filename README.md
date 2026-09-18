# Zycart

AI-powered e-commerce application.

This repository currently contains **Phase 1: project foundation only** — a working
Next.js frontend, an Express + TypeScript backend, and a MongoDB connection. No
storefront, authentication, cart, payment, or AI functionality exists yet.

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
│   ├── app/               # Routes, layout, global styles
│   ├── components/        # Shared React components (ui/ holds shadcn primitives)
│   ├── hooks/             # Custom React hooks
│   ├── lib/               # Framework-agnostic helpers (utils.ts)
│   ├── services/          # API clients - services/api.ts holds the Axios instance
│   ├── store/             # Zustand stores
│   ├── types/             # Shared TypeScript types
│   └── public/            # Static assets
│
├── backend/
│   └── src/
│       ├── config/        # env.ts (validation), database.ts (Mongoose connection)
│       ├── controllers/   # Request handlers
│       ├── middleware/    # Error handling, 404
│       ├── models/        # Mongoose models (empty in Phase 1)
│       ├── routes/        # Route definitions only
│       ├── services/      # Business logic (empty in Phase 1)
│       ├── utils/         # AppError, asyncHandler
│       ├── validators/    # Zod request schemas (empty in Phase 1)
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

Then edit `backend/.env` and set `MONGODB_URI`. The server refuses to start without
it — no default connection string is assumed.

### 5. Start MongoDB

Local install:

```bash
mongod --dbpath /path/to/data
```

Then set `MONGODB_URI=mongodb://127.0.0.1:27017/zycart`.

MongoDB Atlas: create a cluster, allow your IP, and paste the connection string into
`MONGODB_URI`. Never commit it.

### 6. Start the backend

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

### 7. Start the frontend

```bash
pnpm dev:frontend
```

Open <http://localhost:3000>. The homepage shows the project title and a **Backend
Status** card reporting the result of a live `/api/health` call.

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

Per application:

| Location    | Command      | Effect                               |
| ----------- | ------------ | ------------------------------------ |
| `backend/`  | `pnpm dev`   | `tsx watch src/server.ts`            |
| `backend/`  | `pnpm build` | Compile TypeScript to `dist/`        |
| `backend/`  | `pnpm start` | Run the compiled server from `dist/` |
| `frontend/` | `pnpm dev`   | Next.js dev server                   |
| `frontend/` | `pnpm build` | Production build                     |
| `frontend/` | `pnpm start` | Serve the production build           |

---

## Environment Variables

### `backend/.env`

| Variable      | Required | Default                 | Description                      |
| ------------- | -------- | ----------------------- | -------------------------------- |
| `PORT`        | No       | `5000`                  | API port                         |
| `NODE_ENV`    | No       | `development`           | development, test, or production |
| `MONGODB_URI` | **Yes**  | none                    | Mongoose connection string       |
| `CLIENT_URL`  | No       | `http://localhost:3000` | Origin allowed by CORS           |
| `JWT_SECRET`  | No       | none                    | Reserved for a later phase       |

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

Phase 1 (this repository) establishes the frontend, backend, and MongoDB
foundation. Authentication, products, cart, orders, payments, and AI features
arrive in later phases.
