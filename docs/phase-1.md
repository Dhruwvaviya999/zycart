# Phase 1 — Project Foundation

## Goal

Stand up a working frontend, backend, and database connection. No business
functionality.

## What exists

### Backend (`backend/`)

| File                                   | Responsibility                                       |
| -------------------------------------- | ---------------------------------------------------- |
| `src/server.ts`                        | Entry point: load env, connect MongoDB, listen       |
| `src/app.ts`                           | Express assembly: helmet, CORS, JSON, routes, errors |
| `src/config/env.ts`                    | Zod validation of `process.env`, typed `Env` export  |
| `src/config/database.ts`               | Mongoose connect and disconnect                      |
| `src/routes/index.ts`                  | `/api` router                                        |
| `src/routes/health.routes.ts`          | `GET /health` binding                                |
| `src/controllers/health.controller.ts` | Health response body                                 |
| `src/middleware/errorHandler.ts`       | 404 handler and centralized error handler            |
| `src/utils/AppError.ts`                | Error carrying an HTTP status                        |
| `src/utils/asyncHandler.ts`            | Forwards async rejections to the error middleware    |

`models/`, `services/`, and `validators/` were intentionally empty in Phase 1;
Phase 3 filled them with the catalogue (see [phase 3](phase-3.md)).

### Frontend (`frontend/`)

| File                            | Responsibility                               |
| ------------------------------- | -------------------------------------------- |
| `app/layout.tsx`                | Root layout, fonts, metadata                 |
| `app/page.tsx`                  | Homepage shell (server component)            |
| `components/backend-status.tsx` | Client component rendering the health result |
| `hooks/use-backend-health.ts`   | Triggers the check on mount                  |
| `services/api.ts`               | Axios instance, `fetchHealth`, error mapping |
| `store/health-store.ts`         | Zustand store holding the health result      |
| `types/api.ts`                  | Shared response types                        |
| `lib/utils.ts`                  | `cn()` helper installed by shadcn/ui         |
| `components/ui/`                | shadcn/ui primitives (button, card, badge)   |

## Design decisions

**Env validation with Zod.** `loadEnv()` parses `process.env` and throws a readable
summary listing every problem. `MONGODB_URI` has no default, so a misconfigured
server fails at startup instead of pretending it has a database.

**`createApp(env)` instead of a module-level app.** Keeps configuration out of
application assembly and makes the app constructible in tests without touching the
environment.

**The connection string is never logged.** `connectDatabase` logs only the resolved
host and database name, so credentials cannot leak into terminal scrollback or CI
logs.

**One error shape.** `{ success, message }`, optionally with `errors[]` for
validation failures. Causes of 5xx responses are logged server-side and replaced
with a generic message in the response.

**Health state in Zustand rather than local `useState`.** Phase 1 needs a working
Zustand setup; putting the one piece of real client state there proves the
dependency works instead of adding a throwaway counter.

## Deliberately excluded

Redis, Docker, Kubernetes, Kafka, GraphQL, Elasticsearch, microservices,
WebSockets, LangChain, RAG, vector databases, AI agents, job queues, AWS
infrastructure, caching layers, payments, authentication, products, cart, orders,
and wishlist. These belong to later phases.
