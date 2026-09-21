# Phase 16 — Observability, Health Checks & Pre-Deploy Verification

## Overview

Phase 15 ended by naming what it had not done. ZyCart's log lines already
carried the fields that mattered — operation, event, id, attempt, reason — but
carried them as English sentences that nothing could parse. The health endpoint
reported `mongoose.connection.readyState`, which is the driver's *belief* about
its socket rather than a fact about the database. And nothing answered the
question asked immediately before every deployment: will this build start?

Phase 16 is those three things. It adds no customer-facing feature, no
infrastructure and no runtime dependency.

| Gap | What closes it |
| --- | --- |
| Log lines were prose, and unparseable | A centralised logger: one JSON object per line, a closed list of event names, structural redaction |
| Nothing correlated a failure to the request that caused it | `X-Request-Id`, in, out, and ambient through every service call |
| Health reported a driver flag, not a database | A real `ping`, with a timeout, and an honest 503 |
| Nothing checked a production build before it was deployed | `pnpm smoke:deploy` — ten stages, cross-platform, read-only |

### What did not change

Every external contract except one. The API's error envelope, the webhook
contract, the payment outcomes, the notification states, the retry policy, the
audit trail and the inventory ledger are exactly as Phase 15 left them.

The exception is the health response, which changed shape — see
[Health](#health). Its only consumers were the frontend's own client and a
developer-facing card, both updated in the same change.

---

## Structured logging

### The contract

```ts
logger.info('payment_finalized', { orderNumber, razorpayPaymentId, method });
```

An event name, then fields. The event is positional and required because a log
line whose event has to be inferred from its message cannot be aggregated; the
fields are a flat bag because a log line is a row, not a document.

```json
{"timestamp":"2026-09-20T17:17:07.776Z","level":"info","event":"server_started","service":"zycart-api","port":5000,"environment":"production","version":"1.0.0"}
```

Four fields are always present and always first: `timestamp` (ISO-8601, UTC),
`level`, `event`, `service`. A caller cannot overwrite them.

### Where it goes

stdout for `debug` and `info`, stderr for `warn` and `error`. Nowhere else.

There is no file, no database and no remote sink, and each of those is a
deliberate refusal:

- **No file** — a disk that fills, a rotation policy to get wrong, and a thing
  that does not exist on the platform ZyCart deploys to.
- **No database** — logging to MongoDB would mean that losing the database, the
  most likely serious incident, also loses the record of it. Diagnostics must
  not share a failure domain with the thing being diagnosed.
- **No remote sink** — an HTTP call inside a log statement puts a third party's
  latency on ZyCart's request path and their availability on ZyCart's.

Shipping logs somewhere is a deployment's job, done by reading these two
streams.

### Levels

| Level | What belongs at it |
| ----- | ------------------ |
| `debug` | Detail that is only wanted during an incident: successful health checks, notification claims, the text of a search query |
| `info` | Something happened that an operator would want to find later: a payment finalised, a message sent, stock adjusted |
| `warn` | Something an operator may need to act on: a rejected webhook, a slow request, a 4xx, a stale delivery |
| `error` | A fault: a 5xx, a failed refund, a provider that could not be built |

`LOG_LEVEL` sets the floor. A record below it costs one integer comparison and
allocates nothing.

**`debug` is not a secret-revealing mode.** Redaction runs identically at every
level; the only difference is volume.

### Format

`LOG_FORMAT=json` writes one machine-readable object per line. `LOG_FORMAT=text`
writes a short aligned line carrying **identical fields**:

```
2026-09-20T17:17:07.776Z INFO  server_started  port=5000 environment=development version=1.0.0
```

Left unset it resolves to JSON in production, where something will parse it, and
text elsewhere, where a person reads it. Nothing decides *what* to log based on
which format is active.

### Event names

Every name ZyCart emits is in one list, in `src/utils/log-events.ts`, and the
type is derived from it — so `logger.info('payment_finalised', …)` with a name
that is not in the list is a **compile error**.

The convention is `snake_case`, `subject_verb`, and it is enforced mechanically
by `tests/logger.test.ts`, which also refuses two names that differ only in
separators. The failure this prevents is one file writing `payment_failed`, a
second `paymentFailed` and a third `payment-failed` — at which point a search
for any of them finds a third of the truth.

<details>
<summary>The full list</summary>

**Process** — `server_started`, `server_start_failed`, `server_stopping`,
`server_stopped`, `uncaught_exception`, `unhandled_rejection`

**Database** — `database_connected`, `database_connection_failed`

**HTTP** — `request_completed`, `request_failed`

**Health** — `health_degraded`

**Payments** — `payment_webhook_received`, `payment_webhook_rejected`,
`payment_webhook_duplicate`, `payment_webhook_ignored`,
`payment_verification_attempted`, `payment_rejected`, `payment_finalized`,
`payment_marked_failed`, `payment_gateway_failed`,
`payment_gateway_order_created`

**Refunds** — `refund_initiated`, `refund_processed`, `refund_failed`

**Notifications** — `notification_claimed`, `notification_sent`,
`notification_failed`, `notification_stale`, `notification_provider_failed`

**Inventory** — `inventory_adjusted`, `inventory_restocked`,
`inventory_threshold_changed`

**Activity and discovery** — `activity_record_failed`, `search_completed`,
`search_interpretation_failed`

**ZyCart AI** — `ai_request_completed`, `ai_request_failed`,
`ai_provider_failed`

</details>

### What is instrumented, and what is not

Boundaries, not functions: startup and shutdown, the database connection, every
HTTP request, the Razorpay webhook, payment finalisation, refunds, notification
delivery, inventory mutations, and the two provider edges (mail and the model).

Not instrumented: everything else. An event that would only ever be emitted
from one line, and that nobody would ever search for, is a comment wearing a
log line's clothes.

**CLI scripts keep `console`.** `pnpm seed`, the migrations, the verify scripts
and the drain are commands a person watches, and their output is a report.
Mixing structured records into it would produce something readable as neither.

---

## Request correlation

### The id

Sixteen characters of base64url — 96 bits, opaque by construction. It is not a
JWT, not a session id, not an account id, not an order number and not an IP
address, because an id carrying any of those would turn every log line and every
error response into a disclosure.

```
X-Request-Id: z_zCVF3AbJ03r-9o
```

Sent on **every** response, and exposed to the browser through CORS so the
storefront's own client can read it.

### Incoming ids

An `X-Request-Id` on the way in is accepted if it matches
`^[A-Za-z0-9_.:-]{8,64}$` — which admits UUIDs, ULIDs, base64url ids and the
common tracing formats, and admits no whitespace, no control characters and no
punctuation a log parser treats as structure.

Anything else is **replaced**, not rejected. A malformed correlation header is
the client's problem to notice; failing a customer's checkout over it would be
absurd.

The bounds matter as much as the character class. Without an upper bound a
caller could put a megabyte in a header and have it written on every line;
without a lower bound, unrelated requests would silently collapse together.

The id is also the one field written to the log **verbatim**, skipping the
PII scrubber — because an id containing ten consecutive digits would otherwise
be rewritten by the phone-number rule and would no longer match the header the
caller was given. A correlation id that does not correlate is worse than none.

### Reaching the services

The middleware has the id; `payment.service` does not. There were two honest
ways to bridge that: thread a logger through every service signature, or carry
the id in ambient context.

Threading would have meant a new parameter on roughly a hundred functions,
almost none of which log, in order to reach the eight that do — and the first
call site that could not reach a threaded logger would quietly log without an
id, which is the failure the exercise was meant to prevent.

So `AsyncLocalStorage` carries it, from Node's standard library, with no
dependency. It survives `await`, promise chains and callbacks, and code outside
a request simply gets no field.

**Exactly one immutable string is permitted in it.** Ambient state is genuinely
dangerous — code that reads it behaves differently depending on who called it —
and that bound is what keeps it from becoming a request-scoped service locator.
The type in `request-store.ts` enforces it.

### One record per request

```json
{"timestamp":"…","level":"info","event":"request_completed","service":"zycart-api","requestId":"z_zCVF3AbJ03r-9o","method":"GET","route":"/api/products/:idOrSlug","path":"/api/products/linen-shirt","status":200,"durationMs":41.2}
```

Not two. A "started" line is only useful for requests that never finish, and
those are already visible as the absence of a completion.

`route` is the Express pattern, which aggregates; `path` is the concrete one,
which is what an incident asks about. **The query string is never logged** — it
is unbounded, attacker-controlled, and on this API it carries search terms,
which are a customer's words rather than ZyCart's to keep.

Also never logged: the body, any header, the cookie, the `Authorization` value,
or anything from the session.

### Levels for a finished request

| Condition | Level | Event |
| --- | --- | --- |
| 5xx | `error` | `request_failed` |
| 4xx | `warn` | `request_completed` |
| Slower than `SLOW_REQUEST_MS` | `warn` | `request_completed`, with `slow: true` |
| `GET /api/health`, under 400 | `debug` | `request_completed` |
| CORS preflight | `debug` | `request_completed` |
| Everything else | `info` | `request_completed` |

Health is polled every few seconds forever; at `info` it would be the entire
log. A **failing** health check is not quiet — it keeps the level its status
earns, because the one time health matters is the time it stops being boring.

A slow request that succeeded is not logged as a failure. The event stays
`request_completed` and the duration is the finding.

### Errors

`errorHandler` does not log. It attaches a serialised error to the request, and
the single request record carries it — so one failure is one line, with the
duration and the status beside the fault, rather than two lines correlated by
timestamp.

The client still gets what it always got: a sanitised sentence, and on a **5xx
only**, the correlation id.

```json
{ "success": false, "message": "Internal server error", "requestId": "z_zCVF3AbJ03r-9o" }
```

4xx responses are byte-identical to Phase 15. A validation failure needs no
incident reference, and the storefront parses that shape field-by-field.

---

## Redaction

Three independent layers, in `src/utils/redact.ts`. Everything handed to the
logger passes through them, and there is no route around it — a redaction
policy enforced by convention has already failed.

### 1. Key names

A field called `password`, `authorization`, `cookie`, `signature`, `apiKey`,
`jwt`, `smtp…`, `…secret`, `…token` becomes `[redacted]`, whatever its value.
Matching is case-insensitive with separators removed, so `SMTP_PASSWORD`,
`smtpPassword` and `smtp-password` are one rule.

Two near-misses are instructive, because over-redaction is a failure mode too:

- `auth` is **not** a fragment, because it would swallow `author`.
  `authorization` is, because it cannot.
- `razorpay` is **not** a fragment, because it would swallow
  `razorpayOrderId` and `razorpayPaymentId` — which are not secrets. The order
  id is sent to the browser to open Checkout and the payment id comes back from
  it. Redacting them would cost the most useful correlation ZyCart has while
  protecting nothing. The secrets are caught by `secret` regardless.

### 2. Known values

The process registers its own credentials at startup — `MONGODB_URI`,
`JWT_SECRET`, `AI_API_KEY`, both Razorpay secrets, the SMTP user and password —
and any string containing one has it replaced, wherever it appears and whatever
the field is called.

This is the layer that catches the cases where the key name is innocent and the
value is not: a Mongo driver error quoting the connection string back, a
nodemailer rejection quoting the credentials it just tried. Values shorter than
eight characters are refused, because scanning every logged string for a
six-character needle would redact ordinary words.

### 3. Shape, and structure

- Email addresses are masked to `d***@example.com`. The domain survives because
  "every failure is to one provider" is a finding; which mailbox it was is not.
- Runs of 10–15 digits are reduced. Best-effort, and documented as such: the
  real policy is not to log a phone number in the first place.
- `phone`, `address`, `pincode` and similar are removed outright — an address
  has no useful partial form, and walking a `shippingAddress` object would put
  a customer's street into a log line one field at a time.
- Control characters, `\n`, `\r`, `\t`, `U+2028` and `U+2029` are replaced, so
  one record cannot become two.
- Strings are truncated at 512 characters; objects at depth 3, 30 keys and 20
  array items. This is what stops `logger.info('…', { order })` — which nothing
  should write and somebody eventually will — from putting a customer's whole
  basket in a log file. It gets `[object]` instead.

### Errors are never serialised generically

An error is an object carrying whatever the library that threw it attached. An
Axios error carries the request config, headers included — so
`logger.error('…', { error })` on a failed outbound call would publish an
`Authorization` header.

`serializeError` reads four named fields — name, message, code/statusCode and
optionally a trimmed stack — and drops everything else. Any `Error` reached
through ordinary field sanitisation collapses to `"name: message"` rather than
being walked.

Stacks are kept at `error` and dropped below it, trimmed to eight frames, and
joined with ` | ` so a record stays one line. A stack never reaches a client.

### PII policy

Routine logs identify things by `userId`, `orderNumber`, `returnNumber`,
`notificationId`, `productId`, `sku` and `requestId` — never by name, address or
phone number. The assistant logs `session: "account" | "guest"` rather than an
account id, because otherwise every conversation would become attributable to a
person in a log file.

Redaction is the net under that policy, not a licence to ignore it.

---

## Health

### `GET /api/health`

```json
{
  "success": true,
  "message": "API is healthy",
  "data": {
    "status": "ok",
    "service": "zycart-api",
    "version": "1.0.0",
    "environment": "production",
    "uptimeSeconds": 4821,
    "timestamp": "2026-09-20T17:17:12.836Z",
    "checks": {
      "database": "ok",
      "email": "configured",
      "payments": "configured",
      "ai": "configured"
    }
  }
}
```

Unauthenticated, because everything that needs to poll it — a load balancer, a
container runtime, `pnpm smoke:deploy` — has no session and never will. It is
safe to be public because there is nothing in it worth having.

The field list is the whole disclosure surface, and it is asserted exactly in
`tests/health.test.ts` rather than sampled.

### Liveness versus readiness

| Question | How it is answered |
| --- | --- |
| Is the process alive? | By getting any response at all. A dead process does not reply, and no field can say so more truthfully than silence. |
| Is it ready to serve? | `status`, which on this API means one thing: can it reach the database. |

`uptimeSeconds` is present on a 503 as well as a 200, because it is how a
reader tells a restart loop from an outage.

### Statuses

| `status` | HTTP | Meaning |
| --- | --- | --- |
| `ok` | `200` | The database answered. The API can serve. |
| `unavailable` | `503` | The database did not answer. Take this instance out of rotation. |

503 is the status every load balancer, container runtime and uptime checker
already understands. A 500 would be wrong: nothing in the health endpoint
failed — it successfully found out that something else had.

### Why configuration does not change the verdict

The other three checks report configuration, and configuration cannot break at
run time: `loadEnv` refuses to start a half-configured process.

More importantly, "not configured" is frequently correct. A cash-on-delivery
store has no Razorpay credentials and is not degraded — it is a store that takes
cash. A development machine runs mock mail and is not broken — it is a laptop. A
readiness endpoint that returned 503 for either would be removed from the load
balancer within a week, which is the failure mode every honest health check is
trying to avoid.

So configuration is **reported, not judged**. Whether a given deployment is
*permitted* to run with mock mail is a different question, asked by
`checkReadiness` at boot and by `pnpm smoke:deploy` before the boot happens.

### The database check

```js
db.admin().command({ ping: 1 })
```

A real round trip, and deliberately the smallest one there is: no collection, no
index, no documents, no aggregation, no write.

`readyState` alone would not do. It says what the driver believes about its
socket, which stays `connected` through a network partition until something
actually uses it — so a health check built on it reports `ok` for exactly as
long as nobody is watching. It is still checked *first*, because when the driver
knows it is disconnected there is no reason to spend two seconds confirming it.

The probe is bounded at **2 seconds**. A health endpoint that can hang is worse
than one that can be wrong: the caller is a load balancer with a timeout of its
own, and a probe that outlives it turns an outage into a pile of stuck sockets.

Measured cost against a real Atlas replica set: **16 ms**, asserted under 250 ms
by `pnpm health:verify`.

### The other three

| Check | Values | Notes |
| --- | --- | --- |
| `email` | `configured`, `mock` | No SMTP connection is opened. `mock` records messages and delivers nothing. There is no `incomplete` state because `loadEnv` refuses to boot on one. |
| `payments` | `configured`, `not_configured` | No request reaches Razorpay. |
| `ai` | `configured`, `disabled`, `not_configured` | `disabled` is a deployment that turned the assistant off on purpose; `not_configured` is one that meant to have it and does not. |

### What is never in it

No connection string, no host, no port, no credential, no key id, no sender
address, no file path, no stack trace, no environment dump, and no count of
anything a competitor would want. Every field is a fixed enum value or a fact a
customer can already observe.

There is deliberately **no** `/admin/system/env`, no `/admin/debug/config`, and
no admin-only configuration endpoint. One would be the obvious place to put "a
bit more detail for an operator", and it is exactly the endpoint that turns an
admin session into a configuration disclosure. The admin console reads the same
public endpoint everything else does.

### Version

Read once from `backend/package.json`, by walking up from the module's own
directory until a manifest named `zycart-backend` is found — which works under
`tsx` from `src/` and from `dist/` after a build.

Not a constant in source, because a version literal is a version literal
somebody forgets to bump. Not `git describe`, because that would fork a process
per health check and there is usually no `.git` beside a built artefact. If the
manifest cannot be read the field is `null`; nothing is invented, and no request
fails for want of a version string.

---

## Configuration

### New variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, `error` |
| `LOG_FORMAT` | No | JSON in production, text elsewhere | `json` or `text`; identical fields |
| `SLOW_REQUEST_MS` | No | `1000` | Above this, a completed request is logged at WARN |

None is a credential. `SLOW_REQUEST_MS` is defined once and read in one place.

### Two different questions

`loadEnv` asks **is this configuration coherent?** — three Razorpay variables or
none, SMTP credentials whenever SMTP is selected, a secret long enough to be
one. Those are contradictions, and a process must not boot with one. Unchanged
from earlier phases.

`checkReadiness` asks **is this configuration appropriate?** A production
deployment running the mock mail provider is perfectly coherent. Every variable
is valid. It will also silently fail to tell a single customer that their order
shipped, and nobody will find out until somebody asks why.

These cannot be one check, because the answer depends on where the process is
running and the consequences differ: a contradiction stops a boot, an
inappropriate-but-valid setting should stop a **deploy** while still letting a
developer work.

### The rules

| Condition | Severity | Why |
| --- | --- | --- |
| `EMAIL_PROVIDER=mock` in production | **error** | Deliveries are recorded as sent and nothing reaches a customer. No state in the admin console would reveal it. |
| `CLIENT_URL` is localhost in production | **error** | CORS would refuse the real storefront, and every link in a transactional email would be unreachable by the person who received it. |
| `CLIENT_URL` is `http://` in production | warning | Session cookies in the clear, unless TLS terminates at a proxy. |
| No Razorpay in production | warning | A real business, and not a misconfiguration — so it must not block a deploy. Said out loud because it is also how a store that meant to take cards finds out that it cannot. |
| `AI_ENABLED=true` with no key in production | warning | The assistant answers every request as unavailable. |
| `LOG_FORMAT=text` in production | warning | Identical fields, unparseable lines. |

Development trips none of them. A laptop with mock mail, no gateway and a
localhost storefront is a correct development machine.

### The report

```
  Environment     production
  Database        configured
  Authentication  configured
  Storefront      zycart.example
  Email           configured
  Payments        configured (live)
  Assistant       configured (gemini)
  Logging         info · json
```

States, never values. Not one variable's contents is printed, in any severity,
in any mode — a readiness report is something an operator pastes into a ticket,
and one that could contain `SMTP_PASSWORD=…` eventually will.

Asserted by `tests/health.test.ts`, which formats a fully-configured production
report and searches it for every secret in it.

---

## Deployment smoke

```bash
pnpm smoke:deploy                # the full run
pnpm smoke:deploy --skip-frontend
pnpm smoke:deploy --with-tests
pnpm smoke:deploy --dry-run
pnpm smoke:deploy --port 6100
pnpm smoke:deploy --help
```

### What it answers

> Can this exact production build start, reach its database, and serve the
> catalogue?

There is a category of failure that only appears in a production build: a type
`tsx` tolerated, an import that resolves in development and not from `dist/`, a
required variable nobody set, a `next build` that fails on a page never visited
in dev. None of it is caught by the unit suite, because the unit suite builds
nothing and starts nothing.

### Stages

```
[PASS] Configuration
[PASS] Typecheck
[PASS] Lint
[SKIP] Unit tests
       not requested — pass --with-tests
[PASS] Clean
       removed backend/dist, frontend/.next
[PASS] Backend build
       dist/server.js emitted
[PASS] Frontend build
[PASS] Server startup
       healthy after 3356ms (8 polls)
[PASS] Health
       database ok · email mock · payments not_configured · assistant configured
[PASS] Read-only API
       products 2 · categories 6 · brands 21 · featured products 8
```

A failed stage stops the ones that depend on it. Nothing is built after a failed
typecheck, no server is started after a failed build, no request is made against
a server that never became healthy. That rule lives in one place — `StageRunner`
— rather than as one `if` per stage, which is the form in which one of them
eventually gets written the other way round.

### What it does NOT do

- **No order is placed.** No stock moves, no return is approved, no shipment is
  touched, no customer is created.
- **No email is sent.** Pending notifications are left exactly where they are;
  this command never drains them.
- **No payment and no refund**, and no request reaches Razorpay.
- **Nothing is written to the database.** Every call is a GET against a public
  catalogue endpoint, and `smoke.ts` contains no helper capable of anything
  else. The list of endpoints is asserted exactly in `tests/smoke.test.ts`, so
  it cannot quietly grow a write.
- **No `deleteMany`, `dropDatabase`, `dropCollection` or `syncIndexes`**
  anywhere in it.

It does not check that live SMTP accepts mail, that the gateway accepts a card,
or that any customer journey completes. It reports configuration for those, and
configuration is not delivery.

### The verdict

```
Result: DEPLOYMENT SMOKE PASSED

This build starts, reaches its database and serves the catalogue.
It does not prove that mail is delivered, that a payment can be
taken, or that any customer journey completes end to end.

Not run: Unit tests.
```

Never "production verified". The verdict is about the smoke, the limits are
stated in the same breath, and anything skipped is named — a gate that
overstates itself is a gate people stop reading.

### Cross-platform

ZyCart is developed on Windows and deployed on Linux, and a gate that runs on
one of them is a gate that gets skipped on the other.

There is no `curl`, no `grep`, no `lsof`, no `kill -9` and no `pkill`. Polling
is `fetch`, the port check is `net.createServer`, and termination is
`child.kill()`, which the runtime implements per platform. The process-handling
cases in `tests/smoke.test.ts` spawn real children, bind real ports and
terminate real servers, so a regression into a Unix-only assumption fails there.

### The temporary server

Started on port **5055**, not the configured `PORT`, so a running `pnpm dev` is
neither disturbed nor mistaken for the build under test.

It is spawned as `node dist/server.js` — the real production entrypoint — and
deliberately **not** `pnpm start`. That would put a shell and a package manager
between the handle and the server, and killing the handle would leave the server
running as an orphan still holding the port. Spawned directly, the handle *is*
the server.

**A busy port is a failure, not an obstacle.** The command never finds and kills
whatever is using it:

```
[FAIL] Server startup
       port 5055 is already in use. Nothing was started, and nothing was
       terminated — stop whatever is using it, or pass --port.
```

The process on that port belongs to somebody — very often a developer's own
`pnpm dev` — and terminating it to make room for a test is a decision no
automated gate gets to make.

### It cannot hang

Three independent bounds on the startup wait, and all three are needed:

1. Each `fetch` carries its own abort signal, so a socket that accepts and never
   answers is abandoned.
2. The loop carries a deadline (`--startup-timeout`, default 45 s).
3. The child's exit is checked every pass — so a server that died on line one is
   reported immediately instead of being waited on for the full timeout.

A 503 stops the wait at once rather than being retried: the server is up, it is
honest, and every retry is another failed round trip to the same database.

### Cleanup

`finally`, plus `SIGINT` and `SIGTERM` handlers, plus `SIGTERM` then `SIGKILL`
after five seconds. Every path stops the server, including the ones that never
reached the startup stage. `tests/smoke.test.ts` asserts the port is free
afterwards — on the success path *and* on the path where the server never became
healthy.

### The clean stage, and why

The previous build output is removed before building, because a deployment
builds from a clean checkout and a run that reuses a local cache is not
reproducing it.

This is not theoretical. This command's own first run failed at the frontend
build with `Cannot read properties of null (reading 'useContext')` while
prerendering `/_global-error`, from a stale cache. The same build from a clean
directory succeeded. A gate that fails for reasons unrelated to the code is a
gate people learn to re-run until it passes.

Only `backend/dist` and `frontend/.next` are removed. Both are gitignored build
output, both are rebuilt by the next two stages, and the list is asserted
exactly in the tests.

### The build environment, and why

Builds are spawned with `backend/.env` **removed** from their environment, plus
`NODE_ENV` unconditionally.

This is also not theoretical, and it is a little uncomfortable. The smoke
command loads `backend/.env` because stage 1 must validate the configuration the
deployment will run with. `dotenv` puts `NODE_ENV=development` into
`process.env`, the frontend build inherited it, and a build that passes became a
build that fails. Nothing was wrong with the code; the gate had contaminated the
thing it was measuring.

It is recorded here rather than quietly patched, because the general rule is
what matters: **a build must see the environment CI would give it, not the
environment of the process that launched it.** The server-startup stage
deliberately does not use it — that stage runs the real entrypoint, which must
load the real configuration.

### `--dry-run`

Stage 1 alone, and it says so:

```
Result: CONFIGURATION OK — nothing was built, started or called.
A dry run is not a smoke. Run without --dry-run before deploying.
```

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Every stage that ran, passed |
| `1` | A stage failed, or the arguments were wrong |

A run in which nothing ran does not pass.

---

## Operations

### An API that is misbehaving

```bash
curl -s https://api.zycart.example/api/health | jq
```

- `status: "ok"` — the API can reach its database. The problem is elsewhere.
- `status: "unavailable"` (HTTP 503) — it cannot. The process is alive and
  telling you so; check MongoDB, then the network between them. Everything else
  in the response is still accurate.
- No response at all — the process is not there.

Then read the log:

```bash
# Everything that went wrong
jq 'select(.level == "error")' < zycart.log

# One customer's failed request, end to end
jq 'select(.requestId == "z_zCVF3AbJ03r-9o")' < zycart.log

# Slow requests, worst first
jq 'select(.slow == true) | {route, durationMs}' < zycart.log | jq -s 'sort_by(-.durationMs)'
```

### A customer quoting a reference

The `requestId` in a 5xx response body, and in the `X-Request-Id` header of
every response. It is the same string in both, and it is the same string in the
log — searching for it returns the one record that explains the failure, with
the route, the status, the duration and the serialised error.

### A payment that did not complete

```bash
jq 'select(.event | startswith("payment_") or startswith("refund_"))' < zycart.log
```

| What you see | What it means |
| --- | --- |
| `payment_webhook_rejected` with `reason: "invalid_signature"` | The request did not come from Razorpay, or the webhook secret is wrong |
| `payment_webhook_duplicate` | Razorpay redelivered an event ZyCart had already handled. Expected, and not a problem |
| `payment_webhook_ignored` with `reason: "unknown_order"` | Another application on the same Razorpay account, or a dashboard test event |
| `payment_rejected` with `reason: "amount_mismatch"` | The amount paid does not match the order. `paidPaise` and `orderTotalRupees` are both in the record |
| `refund_failed` with `needsManualAction: true` | **Money is owed and has not been sent.** The order stays `REFUND_PENDING`; this is the field to alert on |

### Notifications backlogged

```bash
pnpm notifications:drain --dry-run     # what is eligible
pnpm notifications:drain               # send it
```

`notification_stale` in the log means deliveries were abandoned mid-send and
need a **person** — whether the provider accepted them is genuinely unknown, and
reclaiming one may put a second copy in a customer's inbox. It carries the
count and the age of the oldest; the decision is made on `/admin/notifications`.

Phase 16 added no recovery logic here. The drain is Phase 15's and is unchanged.

### A deployment that will not start

```bash
pnpm smoke:deploy
```

Read the **first** failing stage; everything after it was skipped and tells you
nothing.

| Stage | What to look at |
| --- | --- |
| Configuration | The named variables, in `backend/.env`. No value is printed — the variable name and the rule are what you get |
| Typecheck / Lint | The captured tail, which is the compiler's own output |
| Backend build | Same. `dist/server.js was not emitted` means `tsc` succeeded and produced nothing |
| Frontend build | The captured tail of `next build` |
| Server startup | The server's own structured records are quoted beneath the failure |
| Health | `database ok · email … · payments …` names which subsystem |
| Read-only API | Which endpoint, and what was wrong with its shape |

---

## Security

### Secrets

| Where | What is done |
| --- | --- |
| Logs | Three redaction layers; no route around them; tested with synthetic credentials in innocent fields, inside third-party error messages, and inside objects logged whole |
| `/api/health` | No credential, host, path, key id or stack. Field list asserted exactly. `pnpm health:verify` re-checks it with this deployment's **real** secrets loaded |
| Readiness report | States, never values |
| Smoke output | No value in any mode. Stage 8 additionally searches the live health response body for every configured secret |
| Error responses | A sanitised sentence and, on 5xx, an opaque id |

### The raw-body webhook path

**Untouched.** `requestContext` is mounted ahead of `express.raw()`, and it
reads two headers and writes one — it never touches the body. Body-parser's
"already read" marking depends on the order of the *parsers*, and the new
middleware is not one. `pnpm payments:verify` re-proves the full signed pipeline
through real bytes.

Webhook logging is deliberately asymmetric. Before signature verification
nothing has been established as true, so a rejection logs **only** a reason — no
event id, no event type, no body. Logging any of it would let a stranger write
chosen fields into ZyCart's log by POSTing to a public URL. After verification
the event id and type are Razorpay's words, and are recorded.

The raw body is never logged. Reached through ordinary sanitisation, a `Buffer`
becomes `[buffer 412 bytes]`.

### Denied by design

- No `/admin/system/env`
- No `/admin/debug/config`
- No admin-only configuration endpoint of any kind
- No log sink outside the process
- No way for a smoke run to mutate anything

---

## Verification

| Suite | Result |
| --- | --- |
| `pnpm test` (backend unit) | **656 passed** — was 519; Phase 16 added 137 |
| ├ `tests/logger.test.ts` | 66 — redaction, injection, correlation, error responses |
| ├ `tests/health.test.ts` | 25 — statuses, schema, disclosure, readiness |
| └ `tests/smoke.test.ts` | 46 — arguments, stage dependencies, ports, processes |
| `pnpm health:verify` | **20 passed** — real MongoDB, connected and disconnected |
| `pnpm payments:verify` | **98 passed** |
| `pnpm notifications:verify` | **153 passed** |
| `pnpm returns:verify` | **61 passed** |
| `pnpm inventory:verify` | **48 passed** |
| `pnpm ai:verify` | **43 passed** |
| `pnpm discovery:verify` | **63 passed** |
| `pnpm smoke:deploy` | **8 stages passed**, 1 skipped, exit 0 |

### Deliberately broken

| Break | Result |
| --- | --- |
| `MONGODB_URI` unset | Configuration FAIL, every later stage skipped, exit 1, nothing built |
| Database unreachable | Server startup FAIL with the server's own records quoted, exit 1, no orphan |
| Port 5055 held by another process | Server startup FAIL, exit 1, **the other process untouched** |
| Frontend build broken | Frontend build FAIL, no server started, exit 1 |
| Health returns 503 | Startup wait stops immediately, port released |
| Database disconnected mid-process | `status: "unavailable"`, HTTP 503, process still answering |
| Request id with newlines, 65 chars, JSON, null bytes | Replaced with a generated id; one record stays one line |
| Credentials in `password`, `authorization`, `cookie`, `SMTP_PASSWORD` fields | `[redacted]` |
| A connection string inside a driver's error message | Replaced by value |
| An Axios-shaped error carrying `Authorization` | Not walked; header never written |

---

## Known limitations

- **Live SMTP has still not been exercised.** No credentials are available. The
  provider abstraction, the configuration validation and the failure
  classification are tested; whether a real mail server accepts a real message
  is not.
- **Live Razorpay has still not been exercised.** Same reason. Signatures,
  deduplication, finalisation and refund bookkeeping are tested against a
  stubbed gateway with secrets generated in-process. No money has moved.
- **The health endpoint's own HTTP layer is not integration-tested.** The
  report, the schema, the statuses and the probe are covered by `health.test.ts`
  and `health:verify`; the Express wiring is exercised by `pnpm smoke:deploy`
  against a real server, which is a smoke rather than a test.
- **Digit-run masking is best effort.** A nine-digit phone number written into a
  free-text field survives. The real control is not logging it; this is the net.
- **`AsyncLocalStorage` has a cost.** Small, and paid once per request, but it
  is not free. It was chosen over threading a logger through a hundred
  signatures, and that trade is argued in `request-store.ts`.
- **The smoke command runs against the configured database.** Read-only, but it
  is the real one if that is what `MONGODB_URI` points at. There is no separate
  smoke database, and creating one would mean the smoke no longer tests the
  deployment's own configuration.
- **The smoke server runs with the repository's `NODE_ENV`**, not a forced
  `production`. Forcing it would make `loadEnv` reject a test Razorpay key and
  demand production mail on a developer's laptop. It verifies *this*
  configuration's production **build**, not a production **environment**.
- **Log volume is not bounded by ZyCart.** One record per request, and whatever
  rotation the platform provides. There is no sampling and no rate limit.
- **No metrics, and no traces.** Counts, histograms and spans are a different
  system with a different storage story. Phase 16 emits facts about events that
  happened.
- **The rate limiter is still per process.** Unchanged, and still true behind a
  load balancer.

---

## Not in this phase

- Redis, Kafka, RabbitMQ, Docker, Kubernetes, GraphQL, Elasticsearch
- Prometheus, Grafana, Datadog, New Relic, Sentry, OpenTelemetry, Jaeger, Zipkin
- Log shipping, log aggregation, distributed tracing, metrics
- Message queues, background workers, schedulers
- Any new dependency at all
- Any customer-facing feature
- Any change to commerce behaviour
