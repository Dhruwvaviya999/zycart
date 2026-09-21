# Phase 4 — Authentication & Customer Accounts

## Goal

Give ZyCart real customer accounts: registration, sign-in, a session, a profile
and saved addresses — all under the existing Express API, with no third-party
authentication platform.

```text
Next.js → Express → MongoDB
   ↑                   │
   └──── HTTP-only cookie ──┘
```

## Architecture

A signed JWT carried in an **HTTP-only cookie**. Nothing else.

- The token never appears in a response body, and the browser cannot read it —
  no `localStorage`, no `sessionStorage`, nothing persisted by Zustand.
- The cookie is set by the API and sent automatically by the browser. Server
  components have no browser to do that for them, so `lib/server-auth.ts`
  forwards the incoming cookie header explicitly.
- The server is the authority on who is signed in. The client store exists so the
  navbar can react to a sign-in without a round trip, not as a second source of
  truth.

### The JWT

| Aspect   | Value                                         |
| -------- | --------------------------------------------- |
| Payload  | `{ sub: <user id>, iat }` — nothing else      |
| Secret   | `JWT_SECRET`, required, minimum 32 characters |
| Lifetime | `JWT_EXPIRES_IN`, default `7d`                |
| Verified | On every protected request                    |

The payload is deliberately thin. Role and account status are read from the
database on each protected request — one indexed lookup by `_id` — so
deactivating an account takes effect immediately rather than whenever the token
happens to expire.

### The cookie

| Attribute  | Value                         |
| ---------- | ----------------------------- |
| Name       | `zycart_token`                |
| `httpOnly` | `true`                        |
| `secure`   | `true` in production only     |
| `sameSite` | `lax`                         |
| `path`     | `/`                           |
| `maxAge`   | Derived from `JWT_EXPIRES_IN` |

`sameSite: 'lax'` is deliberate. The storefront and the API share a site both
locally (`localhost:3000` / `localhost:5000` — ports do not make a request
cross-site) and in a domain + subdomain deployment. A genuinely cross-site API
would need `sameSite: 'none'` with `secure: true`.

`maxAge` is computed from the token's own lifetime rather than configured twice,
so the cookie and the token cannot drift out of step.

## User model

`backend/src/models/user.model.ts`

| Field               | Type                     | Notes                                          |
| ------------------- | ------------------------ | ---------------------------------------------- |
| `firstName`         | String, required         |                                                |
| `lastName`          | String, required         |                                                |
| `email`             | String, required, unique | Lowercased and trimmed before it is stored     |
| `password`          | String, required         | bcrypt hash, cost 12, `select: false`          |
| `passwordChangedAt` | Date                     | Revokes tokens issued before it                |
| `phone`             | String                   |                                                |
| `avatar`            | String                   | URL                                            |
| `role`              | `USER` \| `ADMIN`        | Defaults to `USER`                             |
| `isActive`          | Boolean, default true    | A false value fails authentication             |
| `isEmailVerified`   | Boolean, default false   | Foundation only; verification is a later phase |
| `lastLoginAt`       | Date                     |                                                |
| `addresses`         | Embedded array           | See below                                      |

Addresses are embedded rather than a collection of their own: they are only ever
read through their owner and there are a handful per user. Each carries `label`,
`fullName`, `phone`, `addressLine1`, `addressLine2`, `landmark`, `city`, `state`,
`postalCode`, `country` and `isDefault`.

The only index added is the unique one on `email`.

## Endpoints

### Authentication

| Method | Path                 | Auth | Purpose                                  |
| ------ | -------------------- | ---- | ---------------------------------------- |
| `POST` | `/api/auth/register` | —    | Create an account and start a session    |
| `POST` | `/api/auth/login`    | —    | Start a session                          |
| `POST` | `/api/auth/logout`   | —    | Clear the cookie; safe without a session |
| `GET`  | `/api/auth/me`       | ✓    | The signed-in customer                   |

### Profile

| Method  | Path                     | Purpose                    |
| ------- | ------------------------ | -------------------------- |
| `GET`   | `/api/users/me`          | Read the profile           |
| `PATCH` | `/api/users/me`          | Update name, phone, avatar |
| `PATCH` | `/api/users/me/password` | Change the password        |

### Addresses

| Method   | Path                                         | Purpose        |
| -------- | -------------------------------------------- | -------------- |
| `GET`    | `/api/users/me/addresses`                    | List           |
| `POST`   | `/api/users/me/addresses`                    | Create         |
| `PATCH`  | `/api/users/me/addresses/:addressId`         | Update         |
| `DELETE` | `/api/users/me/addresses/:addressId`         | Delete         |
| `PATCH`  | `/api/users/me/addresses/:addressId/default` | Set as default |

Every address write answers with the **whole list**, so the client never has to
recompute what the default-address rules did on the server.

Responses follow the Phase 3 conventions: `{ success: true, data }` or
`{ success: false, message }` with `errors[]` on a validation failure.

## Security decisions

**Registration cannot mint an administrator.** The register schema is `.strict()`
and has no `role` key, so `{"role":"ADMIN"}` is a `400`, not a silently ignored
field. The service never reads a role from input either.

**Authentication failures are indistinguishable.** An unknown email, a wrong
password and a deactivated account all return the same `401 Invalid email or
password`. When no user matched, the password is still compared against a dummy
hash, so response timing does not reveal which addresses are registered.

**The response body is built by allowlist.** `toSafeUser()` names every field it
returns rather than deleting the sensitive ones, so a field added to the schema
later is private until someone deliberately exposes it. Combined with
`select: false` on the password, no endpoint can leak the hash.

**A password change ends other sessions.** A stateless JWT carries no revocation,
so `passwordChangedAt` is stamped on the user and every token issued before it is
refused. The session that made the change is re-issued a fresh cookie, so the
customer is not signed out of the tab they are sitting in — but every other
device is. The stored timestamp is backdated one second because `iat` is whole
seconds and a token minted in the same second would otherwise be rejected too.

**Protected fields are unreachable through the profile endpoint.** The update
schema is `.strict()` and omits `role`, `isActive`, `isEmailVerified` and
`email`; the service then assigns field by field rather than calling `set(input)`,
so the validator is not the only thing standing between a client and `role`.

**Addresses are only reachable through their owner.** There is no route that
takes another user's id — every address path is scoped to `/users/me` — so a
foreign address id simply is not found.

**Rate limiting.** `POST /api/auth/login` allows 10 attempts per IP per 15
minutes; `POST /api/auth/register` allows 5 per hour. The counters live in this
process's memory, which is the right size of solution for a single instance and
nothing more: behind a load balancer each instance would count separately, so a
horizontally scaled deployment needs a shared store. That trade is documented
rather than pre-solved.

## Frontend

### Session flow

1. The root layout resolves the session on the server and passes it to
   `<AuthProvider>` and the navbar.
2. `AuthProvider` copies it into the Zustand store **in an effect**. The store is
   a module singleton, and writing to it while rendering on the server would let
   one request's session leak into another's.
3. `useAuthUser(serverUser)` reads the store but falls back to the server value
   until the store is seeded — which is why the navbar never renders a signed-out
   state for a frame and hydration has nothing to reconcile.
4. Signing in or out updates the store and calls `router.refresh()`, so the
   server components re-render against the new cookie.

There is no bootstrap `useEffect` that fetches `/api/auth/me` on load: the server
already knows, so the client never has to ask.

### Protected routes

`/account`, `/account/profile`, `/account/addresses` and `/account/settings`.

Two layers, deliberately:

- **`middleware.ts`** turns away visitors with no cookie before any rendering
  happens, and preserves the destination —
  `/account/addresses` → `/login?redirect=%2Faccount%2Faddresses`. It cannot
  verify the signature, which needs the API's secret.
- **`app/account/layout.tsx`** resolves the session properly. An expired, forged
  or revoked cookie gets past the cookie test and is stopped here.

`?redirect=` is attacker-controlled, so `safeRedirect()` accepts only same-origin
paths — an absolute URL or a protocol-relative `//evil.com` falls back to
`/account`.

The reverse check (a signed-in visitor landing on `/login`) is done in the page
rather than middleware **on purpose**: middleware cannot tell a valid cookie from
an invalid one, so a deactivated customer holding a live cookie would ping-pong
between `/login` and `/account`.

### Pages and components

| Route                | What it is                                           |
| -------------------- | ---------------------------------------------------- |
| `/login`             | Sign in                                              |
| `/register`          | Create an account                                    |
| `/account`           | Overview: shortcuts and an honest empty orders state |
| `/account/profile`   | Name, phone, avatar; email is read-only              |
| `/account/addresses` | Address CRUD with a default-address rule             |
| `/account/settings`  | Change password, appearance, sign out                |

```text
components/
├── auth/       auth-provider, auth-shell, login-form, register-form,
│               password-field, form-field, auth-error
├── account/    account-header, account-navigation, account-panel,
│               profile-form, password-form, address-card, address-form,
│               address-manager, logout-button
└── layout/     user-menu
```

The authentication pages reuse the storefront's split-panel composition from the
promotional banners rather than inventing a second visual language, so signing in
reads as part of ZyCart. The editorial half is decorative and is dropped below
`lg`, where the form should have the screen to itself.

`FormField` renders its message line **always**, so an error appearing does not
push the rest of the form down — the hint simply gives way to it.

## Environment

```env
JWT_SECRET=      # required, 32+ characters
JWT_EXPIRES_IN=7d
```

Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

The server refuses to start without `JWT_SECRET`, the same way it refuses to
start without `MONGODB_URI`.

## Known limitations

**Logout does not revoke the token.** It clears the cookie, which ends the
session for that browser. A token copied out beforehand stays valid until it
expires — inherent to stateless JWTs without a denylist, and out of scope here.
A password change _does_ revoke everything, via `passwordChangedAt`.

**`redirect()` from a server component answers with HTTP 200.** A signed-in
visitor opening `/login` is sent to `/account` by the redirect payload and a
`meta refresh`, which browsers honour, but the status line says `200`. This is
the same Next.js 16.3.5 streaming behaviour documented in
[phase 3](phase-3.md#known-limitations) for `notFound()`; middleware redirects
(the ones protecting `/account`) are real `307`s.

**Not implemented, and not faked.** Password recovery is shown as unavailable
rather than as a link that goes nowhere. There is no email verification, no
social sign-in and no OTP. `isEmailVerified` and the `ADMIN` role exist as
foundations for later phases; there is no admin UI.

**Cart and wishlist remain local.** They still keep product ids in the browser
and are untouched by signing in or out, so shopping data is never erased by an
authentication event. Moving them server-side belongs to a later phase.
