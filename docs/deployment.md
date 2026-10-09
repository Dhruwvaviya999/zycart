# Deploying ZyCart to Vercel

ZyCart deploys as **one Vercel project containing two services**: the Next.js
storefront and the Express API. Both are built from this repository, both ship
in the same deployment, and both answer on the same domain.

That last part is the reason for the arrangement. When the storefront is at
`https://zycart.example` and the API is at `https://zycart.example/api`, the
browser is making same-origin requests: no preflight, no `Access-Control-Allow-*`
negotiation, and Clerk's session cookie is first-party, so the API can read it
even before Clerk's script has loaded in the browser and started sending its
token as a header.

## Contents

- [The shape of the deployment](#the-shape-of-the-deployment)
- [Before you start](#before-you-start)
- [Environment variables](#environment-variables)
- [Four ways this fails](#four-ways-this-fails)
- [Deploying](#deploying)
- [Verifying](#verifying)
- [When the API returns 404 or 500](#when-the-api-returns-404-or-500)

## The shape of the deployment

`vercel.json` at the repository root is the whole configuration:

```json
{
  "services": {
    "frontend": {
      "root": "frontend/",
      "framework": "nextjs",
      "bindings": [
        { "type": "service", "service": "backend", "format": "url", "env": "BACKEND_URL" }
      ]
    },
    "backend": {
      "root": "backend/",
      "framework": "express",
      "entrypoint": "src/server.ts",
      "buildCommand": "echo 'No tsc build: the Express runtime compiles src/server.ts itself.'"
    }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": { "service": "backend" } },
    { "source": "/(.*)",     "destination": { "service": "frontend" } }
  ]
}
```

Three things about it are worth stating plainly, because each one is otherwise
a rule you discover by breaking it.

**A service is unreachable until a top-level rewrite names it.** Services are
internal by default. The two rewrites are not routing conveniences — they are
the only public entrances the deployment has.

**The backend receives the path unchanged.** `GET /api/products` arrives at the
Express app as `/api/products`, not as `/products`. That is why
`app.use('/api', apiRouter)` is correct as written and must not be shortened to
`app.use(apiRouter)`.

**Routing into a service is final.** If Express answers 404, Vercel returns that
404. It does not fall back to the `/(.*)` rewrite and try the storefront.

### Why the binding exists

The browser can use a relative URL, because it knows what origin it is on. A
server component cannot: Node has no current origin, and Axios refuses a
relative URL rather than guessing. A page whose rails are fetched on the server
renders empty, with nothing in the browser console to explain it.

The `bindings` entry is what solves that. Vercel injects `BACKEND_URL` into the
frontend service at runtime, pointing at *this deployment's* backend — a preview
talks to its own API rather than production's — and the call travels the
internal network, skipping the CDN, the firewall and Deployment Protection.
`resolveBaseUrl` in `frontend/services/api.ts` is the one place that reads it.

Two consequences follow. Bindings resolve **at runtime only**, so nothing may
depend on `BACKEND_URL` during `next build`; every page that reads the API is
already `force-dynamic`, so nothing does. And bindings are **not available in
middleware**, which is why `frontend/proxy.ts` only asks Clerk who is signed in
and never calls the API.

### Why the backend's build command does nothing

`backend/package.json` has a `build` script — `tsc -p tsconfig.json` — and a
`main` of `dist/server.js`. Both are correct for running the API on an ordinary
server, and both are actively harmful here.

Left alone, Vercel runs that script, finds `dist/`, and roots the function
there. The result is a bundle whose top level is the compiled `app.js` and
`server.js` and nothing else: `backend/node_modules` is one directory *above*
the root, so it is not in the bundle, and the first line of the first request
fails with

```
Cannot find module 'cors'
Require stack:
- /var/task/app.js
```

which names one dependency but means all of them.

The Express runtime compiles TypeScript itself, from `entrypoint`, with the
service rooted at `backend/` where `node_modules` actually is. The no-op
`buildCommand` is what keeps `tsc` out of the way so it can. `pnpm build` is
still the right thing to run locally and on any non-Vercel host — it is only
this deployment target that must not use it.

## Before you start

- **Vercel Services must be enabled on your account.** It is a Beta feature
  gated by a permission. If the build log never mentions building two services,
  or `vercel.json` is reported as invalid, that is the reason — request access
  before debugging anything else.
- **MongoDB Atlas must accept connections from anywhere.** Vercel functions have
  no stable egress IP. In Atlas: Network Access → Add IP Address → `0.0.0.0/0`.
  An allowlist containing only your laptop is the most common cause of a
  deployment whose every API call times out.
- The repository must be connected to the Vercel project with the **Root
  Directory left at the repository root** — not `frontend/`. `vercel.json` lives
  at the root and describes both services from there.

## Environment variables

All of these are set once, on the project, under Settings → Environment
Variables. Services within one project share them.

| Variable | Required | Value in production |
| --- | --- | --- |
| `MONGODB_URI` | **yes** | The Atlas SRV connection string, including the database name. |
| `JWT_SECRET` | **yes** | At least 32 characters of randomness — `openssl rand -base64 48`. Signs the one-click links in email. |
| `CLERK_SECRET_KEY` | **yes** | The production instance's `sk_live_…`. Read by both services. |
| `CLERK_PUBLISHABLE_KEY` | **yes** | The matching `pk_live_…`, for the API. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | **yes** | The same `pk_live_…`, for the storefront. |
| `CLERK_WEBHOOK_SIGNING_SECRET` | recommended | From the Clerk webhook endpoint for `https://<domain>/api/webhooks/clerk`. |
| `CLERK_JWT_KEY` | recommended | The PEM "JWKS public key", so sessions verify without a call to Clerk. |
| `CLIENT_URL` | **yes** | Your production origin, e.g. `https://zycart.example`. Absolute, `https://`, no trailing slash. |
| `LOG_FORMAT` | no | Leave unset. Production resolves to `json`, which is what Vercel's log search can parse. |
| `LOG_LEVEL` | no | `info`. Raise to `debug` during an incident. |
| `AI_PROVIDER` | no | `gemini` or `huggingface`. **Never `mock`** — see below. |
| `AI_API_KEY` | no | Required for the assistant to answer anything at all. |
| `AI_ENABLED` | no | `false` hides the assistant entirely, rather than shipping it broken. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | no | All three, or none. See below. |
| `EMAIL_PROVIDER` | no | `smtp` for a real store. `mock` delivers nothing. |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM_ADDRESS` | with smtp | All four become required once `EMAIL_PROVIDER=smtp`. |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | with payments | Must equal `RAZORPAY_KEY_ID`. Published to the browser by design. |

Clerk's production instance is created from the development one in the Clerk
dashboard, and needs the DNS records it lists under **Domains** before it will
issue sessions on your domain. Google sign-in there uses your own OAuth client
(Clerk's shared one is development-only). Readiness refuses `sk_test_` keys in
production, so a deploy cannot go out on the development instance by accident.

Two variables must **not** be set:

- **`NEXT_PUBLIC_API_URL`** — leave it unset on Vercel. It is a
  local-development variable. Setting it makes the browser call an absolute URL,
  which turns every same-origin request into a cross-origin one and puts CORS
  and third-party cookie rules back in the path for no benefit. If it currently
  holds `http://localhost:5000`, that alone explains a storefront whose API
  calls all fail.
- **`BACKEND_URL`** — Vercel generates and injects it from the binding. A value
  set by hand would be a fixed hostname, which is precisely what the binding
  exists to avoid.

`PORT` is likewise unnecessary; nothing listens on a port under Vercel.

## Four ways this fails

`loadEnv()` runs at module scope in `src/server.ts`. When it throws, the
function crashes during import and *every* API route returns 500 with no body
worth reading. Three of its rules bite specifically in production, because
Vercel sets `NODE_ENV=production` for you and there is no opting out:

1. **A test Razorpay key in production is fatal.** `RAZORPAY_KEY_ID` beginning
   `rzp_test_` with `NODE_ENV=production` fails validation and the API will not
   boot. That is deliberate — real customers paying into a sandbox is worse than
   an outage. Either use live keys, or unset all three Razorpay variables and
   run cash-on-delivery only.
2. **`AI_PROVIDER=mock` in production is fatal.** The mock returns scripted
   replies over live catalogue data. Use a real provider, or `AI_ENABLED=false`.
3. **Half-configured is fatal, for both payments and mail.** One Razorpay
   variable set and the others missing refuses to boot; so does
   `EMAIL_PROVIDER=smtp` without the host, credentials and sender address.
   Configuring *none* of a group is always a valid choice.

The fourth is not fatal, and so is the one that gets missed:
`EMAIL_PROVIDER=mock` in production is reported at startup as a readiness
**error**, the process starts anyway, and every order confirmation is recorded
as sent and delivered to nobody. `pnpm smoke:deploy` refuses the same findings
before a build starts — run it.

## Deploying

```bash
pnpm install
pnpm typecheck
pnpm smoke:deploy     # refuses a configuration that would disappoint a customer
git push              # Vercel builds both services from the one commit
```

To deploy from your machine instead of from Git:

```bash
vercel login
vercel link           # link the repository root, not frontend/
vercel --prod
```

`vercel dev` runs both services together locally with the binding injected, so
service-to-service calls behave as they do in production.

## Verifying

```bash
curl -i https://<your-domain>/api/health
```

A healthy deployment answers `200` with a JSON body naming the version and the
database. A `503` with a *valid* body means the API is running and cannot reach
MongoDB — that is the Atlas allowlist, or a bad `MONGODB_URI`. Anything else —
an HTML error page, a Vercel 404, `FUNCTION_INVOCATION_FAILED` — means the
request never reached Express.

Then load the storefront. If the product rails render, the frontend service is
reaching the backend over the binding, which is the part no browser tab can
tell you about.

## When the API returns 404 or 500

Work down this list; it is ordered by how often each one is the answer.

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Cannot find module '<any dependency>'`, require stack `/var/task/app.js` | The function was rooted at `backend/dist/`, which has no `node_modules` | Keep the no-op `buildCommand` on the backend service. See [Why the backend's build command does nothing](#why-the-backends-build-command-does-nothing). |
| Every `/api/*` route returns 500 | `loadEnv()` threw at import | Vercel → Logs, filtered to the backend service. The thrown message names each offending variable. |
| Every `/api/*` route times out | Atlas is refusing Vercel's IP | Allow `0.0.0.0/0` in Atlas Network Access. |
| `/api/*` returns Vercel's 404 page | The rewrite never matched, or the service did not build | Check the build log lists **both** services. Confirm Services Beta is enabled on the account. |
| Storefront renders but every rail is empty | Server-side calls have no absolute base | Confirm the `bindings` block is present in `vercel.json` and the deployment is newer than it. |
| Browser calls go to `localhost:5000` | `NEXT_PUBLIC_API_URL` is set on the project | Delete it and redeploy. `NEXT_PUBLIC_*` values are baked in at build time, so a redeploy is required. |
| Signed in, but every API call is 401 | The session token was minted for another origin, or by another Clerk instance | `CLIENT_URL` must be the exact origin the storefront is served from — the API accepts tokens for that origin only. Both services must use keys from the same production instance. |

Runtime logs are per service: Vercel → your project → Logs, then filter by
service. The backend writes one JSON record per request carrying the
`x-request-id` the browser was given, so a customer quoting a reference from an
error screen can be traced to the exact request that produced it.
