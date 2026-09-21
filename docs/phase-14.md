# Phase 14 — Customer Communication, Transactional Email & Notification Reliability

## Overview

Phase 13 gave ZyCart a complete post-purchase domain: parcels with a lifecycle,
item-level returns, partial refunds settled against Razorpay. Every one of those
events was visible — to anybody who thought to open the site and look.

That is the gap this phase closes. A customer whose order shipped on Tuesday had
no way to know until they checked on Thursday; a customer whose refund settled
overnight found out whenever their bank told them. Phase 14 makes ZyCart
proactive about four transitions, and does it without letting a mail server
anywhere near the question of what is true.

### The rule the whole phase is built around

**Email is never the source of truth.**

A shipment is shipped because the shipment document says so. A refund has
completed because Razorpay said `processed` and the return moved to `REFUNDED`.
Neither fact depends in any way on whether a message left the building. So every
integration in this phase has exactly one shape:

```
begin transaction
  change the domain state
  record the intent to communicate
  write the audit row
commit
attempt delivery                    <- after the commit, and allowed to fail
```

and never:

```
send the email
if it worked, mark the order shipped
```

Which means this pair is a state ZyCart can be left holding, deliberately:

```
Order    = SHIPPED
Delivery = FAILED
```

It is visible in the admin console, it is retryable, and it does not make the
order any less shipped. The reverse — an order that could not be dispatched
because a mail server refused a connection — is not reachable.

### What this phase deliberately is not

It is **not a mailing list**. There are no campaigns, no newsletters, no
segmentation, no unsubscribe centre and no marketing copy. There is also no
endpoint anywhere in ZyCart that composes a message, names a recipient or
selects a template: messages exist because a business transition happened on the
server, and the only thing anybody — administrator included — can do to one is
ask for it to be attempted again.

It is **not a job queue**. There is no worker, no scheduler and no broker, and
[Known limitations](#known-limitations) says plainly what that costs.

---

## Architecture

```
Domain transition            transitionOrderStatus / approveReturn /
        │                    settleRefund / applyRefundOutcome
        │  (inside the transaction)
        ▼
Notification intent          queueNotification      → NotificationDelivery (PENDING)
        │                                             key = EVENT:reference  (unique)
        │  ─────────── commit ───────────
        ▼
Delivery attempt             NotificationOutbox.flush(env)
        │
        ▼
Template registry            TEMPLATE_REGISTRY[event] → subject + EmailContent
        │
        ▼
Renderer                     render.ts → { html, text }   (escaping happens here, only here)
        │
        ▼
Provider                     EmailProvider.send(message)  (smtp | mock)
        │
        ▼
Result                       SENT + providerMessageId, or FAILED + reason
```

### Where events are raised, and why there

| Event | Raised in | Why there |
| --- | --- | --- |
| `ORDER_SHIPPED` | `transitionOrderStatus`, on the move to `SHIPPED` | Both doors into "this order has shipped" — advancing the parcel, and the order's own fulfilment control — pass through this one function. One hook covers both, plus the bulk action, and cannot be bypassed by a route added later without also bypassing the order lifecycle. |
| `ORDER_DELIVERED` | `transitionOrderStatus`, on the move to `DELIVERED` | Same reason. |
| `RETURN_APPROVED` | `approveReturn`, inside its transaction | Only this decision is communicated. `rejectReturn` raises nothing — a rejection is a different message with a different tone, and Phase 14 does not send one. |
| `REFUND_COMPLETED` | `settleRefund` (when the gateway settles immediately) and `applyRefundOutcome` (when `refund.processed` arrives later) | These are the two — and only two — paths by which a return reaches `REFUNDED`. Both converge on the same idempotency key, so a refund that settles overnight produces exactly one message whichever path got there first. |

Two consequences worth naming:

- **An `EXCEPTION` on a parcel raises nothing.** Every in-transit shipment
  status implies the order is already `SHIPPED`, so no transition into `SHIPPED`
  occurs and no event fires. The notification follows the business transition,
  not the parcel's mood.
- **A failed refund raises nothing.** `applyRefundOutcome` with `failed` moves
  the return back to `RECEIVED` so it can be retried, and sends no message. "Your
  refund is complete" for money that did not move is the single worst thing this
  subsystem could produce.

### The outbox

`transitionOrderStatus` runs inside somebody else's transaction and has no
business performing network I/O, so it drops the new delivery's id into a
`NotificationOutbox` and the entry point that owns the transaction flushes after
committing.

`withTransaction` may run its callback several times, so the same id can arrive
twice, and ids from an aborted attempt can arrive for rows that no longer exist.
Neither matters: ids are de-duplicated, and every delivery begins with an atomic
claim that matches nothing for a row that was rolled back or already claimed.
Correctness comes from the claim, not from the collector being tidy.

`flush` never throws. An administrator does not get an error for an operation
that succeeded.

---

## Providers

| Provider | `EMAIL_PROVIDER` | What it does |
| --- | --- | --- |
| SMTP | `smtp` | Real mail, over the one protocol every mail vendor speaks. Nodemailer, one connection per message, 5s connection/greeting/socket timeouts. |
| Mock | `mock` (default) | Renders and records the message, delivers nothing. Captures recipient, subject, text, HTML, template and notification id so tests and the verification script can assert on them. |

SMTP rather than a vendor SDK, because SMTP is universal: a store on SES,
Postmark, Mailgun, Brevo, Zoho or its own Postfix configures the same five
variables and no code changes. Picking one vendor's REST API would have made
ZyCart depend on that vendor's account and SDK for a feature that has a
standard.

`nodemailer` is imported by exactly one file, `smtp.provider.ts`. Nothing in the
notification service, the templates, the shipment service or the frontend knows
a mail library exists.

### Configuration

```
EMAIL_PROVIDER=mock|smtp            # default: mock
EMAIL_FROM_NAME=ZyCart
EMAIL_FROM_ADDRESS=                 # required when EMAIL_PROVIDER=smtp
EMAIL_REPLY_TO=                     # only if a real, monitored support mailbox exists
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_SECURE=false                   # true for implicit TLS on 465
```

Two validation rules, both at startup:

- **`EMAIL_PROVIDER=smtp` with anything missing refuses to boot.** Host,
  user, password and sender address are all required once SMTP is selected. A
  deployment that promises delivery and has no mail server would record every
  message as `FAILED` until somebody noticed.
- **`CLIENT_URL` must be an absolute `http(s)` URL.** It is the origin every
  link in an email is built from, and a malformed value produces broken links in
  mail that cannot be recalled.

`mock` in production is a loud startup warning rather than a refusal. A store
with no mail server is a legitimate deployment — the events are still recorded,
and every delivery row and every admin screen says the transport was `mock` —
whereas refusing to boot the whole shop over an unconfigured mailbox would take
the storefront down for a subsidiary feature.

### There is no `APP_URL`

Email links are built from `CLIENT_URL`, which already exists as the CORS
origin. Those are the same fact about a deployment, and a second variable would
create a pair that can disagree — at which point an email links somewhere CORS
refuses, or the reverse, and neither failure surfaces until a customer hits it.

Links are **never** built from a request's `Host` or `X-Forwarded-Host`. See
[Security](#security).

---

## Templates

Four, matching the four events. Each has a name, a version, a Zod data contract,
a subject function and a content function.

| Template | Version | Subject | Primary CTA |
| --- | --- | --- | --- |
| `order-shipped` | 1 | Your ZyCart order ZY10482 has shipped | Track your order (or View your order when there is no tracking link) |
| `order-delivered` | 1 | Your ZyCart order ZY10482 has been delivered | View your order |
| `return-approved` | 1 | Your ZyCart return ZYR-… has been approved | View your return |
| `refund-completed` | 1 | Your ZyCart refund for ZYR-… is complete | View refund details |

### One shell, and escaping in one place

Templates return **data**, not HTML. `EmailContent` has no field whose contents
are treated as markup, and the single renderer in `render.ts` escapes every
value on its way into the document. A template physically cannot emit raw HTML,
which is what makes "did somebody forget an `escapeHtml`?" a question with one
place to look rather than four.

Both bodies — HTML and plain text — are generated from the same `EmailContent`,
so they cannot drift into saying different things.

### The HTML looks like 2004, on purpose

Outlook on Windows renders with Word's engine; Gmail rewrites or strips
`<style>` blocks; no client can be relied on for flexbox, grid, custom
properties or web fonts. So: tables for structure, inline styles throughout, a
system font stack, no JavaScript, no external images, and a single column that
is readable at 320px. The 600px cap is expressed as `max-width` for everything
and as a conditional-comment `width` only Word reads.

Dark mode is not attempted. Client support ranges from full to a forced
inversion of whatever the message specified, so the palette is light with
high-contrast text and stays legible either way.

### Nothing is fabricated

Phase 13's rule, applied to mail — and it matters more here, because a wrong
fact on a screen can be corrected by refreshing it and a wrong fact in an inbox
is permanent.

| Situation | What the email says | What it refuses to do |
| --- | --- | --- |
| Shipped with no carrier recorded | "Your parcel is on its way. We will email you again when it has been delivered." | Name a carrier |
| Shipped with a tracking number but no link | Prints the number, says it can be used on the carrier's site | Guess a tracking URL |
| Shipped with no estimated delivery | Omits the row entirely | Compute a plausible date |
| Tracking URL that is not `https:` | Renders no tracking button at all, falls back to the order page | Render a link it cannot vouch for |
| Delivered before delivery dates were recorded | Omits the delivered date | Substitute `createdAt` |
| Delivered but no longer returnable | "Returns for this order are closed" | Offer a return the server would refuse |
| Account with no first name | "Hi there," | Print "Hi ," |
| Return with no refund amount stored | ₹0, from the stored record | Recompute from current catalogue prices |

The delivered template's return call-to-action is decided by `returnability` —
the same pure function the storefront, the order API and the return service all
consult. An email that offered a return the server would refuse would send a
customer to a page that tells them no, having promised otherwise in writing.

---

## Delivery states

```
PENDING ──claim──► SENDING ──accepted──► SENT
   ▲                  │
   │                  └──refused/unreachable──► PENDING (budget left)
   └──────────────────────────────────────────► FAILED  (permanent, or budget spent)
```

| State | Means |
| --- | --- |
| `PENDING` | The intent exists and no attempt has succeeded. Either nothing has been tried yet, or every attempt so far failed temporarily with attempts still in the budget. |
| `SENDING` | An attempt is in flight. A claim held by exactly one caller. |
| `SENT` | **The configured provider accepted the message for delivery.** That is the whole of the claim. |
| `FAILED` | The provider rejected the message outright, or the automatic attempts were used up without one being accepted. Nothing automatic will touch it again; an administrator still can. |

### `SENT` does not mean delivered

There is deliberately **no `DELIVERED` state**. ZyCart has no bounce handling
and no provider delivery webhooks, so it knows whether a message was *accepted*
and nothing beyond that. A `DELIVERED` state would be a claim about a customer's
mail server this system is in no position to make, and an operator reading it
would reasonably conclude the customer had the message. The detail page says so
in words, next to the status.

### Failure classification

Separate from the status, and deliberately so:

- **`TEMPORARY`** — a 4xx SMTP reply, a timeout, a refused connection, a DNS
  failure, or anything unrecognised. A further attempt could succeed.
- **`PERMANENT`** — a 5xx SMTP reply, a refused envelope, rejected credentials,
  or a stored payload that no longer matches its template.

The status answers *will anything try this again by itself?*; the kind answers
*could a further attempt ever succeed?* Conflating them was a real bug caught
during this phase's browser verification: three connection timeouts exhaust the
budget, which is terminal, but the cause is as temporary as it was on the first
attempt — and recording it as `PERMANENT` made the console tell an operator a
retry was unlikely to help about a message that went out on the very next
attempt.

Anything unrecognised is classified `TEMPORARY`. Guessing "permanent" for an
error nobody anticipated would silently abandon messages that would have gone
through, and the bounded attempt count is what stops that costing more than two
extra attempts.

---

## Idempotency

### Notification identity

Every delivery carries a key of `EVENT:reference`:

```
ORDER_SHIPPED:ZY10482
ORDER_DELIVERED:ZY10482
RETURN_APPROVED:ZYR-20260920-7Q4K
REFUND_COMPLETED:ZYR-20260920-7Q4K
```

A **unique index** on that field is the whole of the duplicate-prevention story.
Not a check-then-insert, which two concurrent callers both pass — the index is
consulted by the database on every write and admits exactly one.

`queueNotification` does read first, because the ordinary duplicate (the same
event processed twice in sequence) should cost one indexed read rather than an
aborted transaction. That read is an optimisation; the index is the guarantee.

### What this makes safe

| Scenario | Outcome |
| --- | --- |
| Duplicate HTTP request | The domain refuses the second transition; no second message. |
| Duplicate Razorpay webhook | `applyRefundOutcome` finds the return already `REFUNDED` and returns `UNCHANGED`; no second message. |
| Double-clicked admin button | The transition graph refuses the second; no second message. |
| `withTransaction` retry | The retry finds the intent already written, or is refused by the unique index. |
| Two genuinely concurrent transitions | One commits, one is refused. Exactly one delivery record. |
| Two concurrent admin retries | The atomic claim admits one. Exactly one send. |
| Retrying an already-`SENT` message | Refused with a 409. |

All of these are asserted against a real replica set — see [Testing](#testing).

### Two guards, on purpose

The refund path has both the domain's conditional update (`status:
'REFUND_PENDING'` in the filter) and the notification key. Either alone would
be sufficient for the duplicate-webhook case. Both are there because one guard
protecting a customer's inbox is not enough.

---

## Retry behaviour

### Automatic

Bounded twice over: **3 attempts** maximum, and a **4-second wall-clock
deadline** measured from the first attempt, with 300ms and 900ms backoff between
them. The deadline exists because delivery runs between a committed transaction
and the HTTP response an administrator is waiting for — a mail server that has
gone away must cost a few seconds, not a few minutes.

Stopping early is the design, not a failure of it. The delivery is left
`PENDING` with its attempts recorded, visible on the notifications screen, and
retryable by hand. What it never does is loop.

A `PERMANENT` failure stops immediately rather than spending the budget.

### Manual

An administrator pressing Retry buys exactly one further attempt. There is no
inline loop, and the automatic budget does not bound them — a person making a
decision about one message is not a runaway process. The endpoint is rate
limited to 30 per minute per administrator, which is the only rate limit on any
admin route in ZyCart: every other one writes to ZyCart's own database, where
the damage a loop could do is bounded by the schema, while this one causes
traffic to somebody else's mail server under the store's sending reputation.

Retry **cannot** be used on a `SENT` message, and it cannot change an order, a
shipment, a return, a payment or stock. It writes to one delivery row.

### Stale `SENDING`

If the process dies mid-send, the row is left in `SENDING` and nothing else
would ever touch it. After ten minutes — far longer than any transport timeout —
an administrator may reclaim it, and the console says in words that the previous
attempt may or may not have been accepted and that retrying could send a second
copy. It is deliberately **not** automatic: that is a judgement for a person.

---

## Security

### Recipients are resolved, never supplied

`queueNotification` resolves the address from the `User` document, inside the
caller's transaction, and freezes it on the delivery row. There is no parameter
anywhere in the notification layer through which a caller can nominate an
address, and no endpoint that accepts one. A customer who changes their email
tomorrow does not retroactively change where today's shipping notice was sent —
the *next* event resolves the new address, and the record of the old one stays
accurate.

Tested: `POST /api/admin/notifications/:id/retry` with `{"to": "attacker@…"}`
returns **400**. The handler reads nothing from the body, so an ignored field
would already be harmless; it is refused anyway, because "the field is ignored"
is a guarantee that lives in whoever last read the handler and `.strict()` is a
guarantee that lives in the schema.

### There is no send endpoint

No `POST /notifications/send`, no `POST /admin/send-email`, no way to pass an
event name, a template or an entity reference. Messages originate from trusted
backend domain transitions and nowhere else. A console that could compose mail
would be a relay behind an admin login, and it would make every delivery record
stop meaning "ZyCart owed this customer this message".

### Escaping

Every dynamic value passes through `escapeHtml` — all five characters, both
quote forms — on its single route into the document. Verified end to end against
a real account whose first name is `<img src=x onerror=alert(1)>`: the message
renders it as visible text and the tag never forms.

Subjects are sanitised of control and format characters and bounded, so a value
cannot end a header and begin another. In practice every subject in this phase
interpolates only server-generated references; the sanitiser is what keeps that
true of the fifth template.

### Links

Application links are built from `CLIENT_URL` and a path this codebase controls
— never from a request header. Building an absolute URL from `Host` or
`X-Forwarded-Host` is how a link in a transactional email ends up pointing
wherever an attacker put it, and an email is the worst possible place for that:
it outlives the request, arrives with the store's branding on it, and cannot be
recalled.

External links (carrier tracking) are re-validated as absolute `https:` at
render time, not merely at write time. A delivery can be retried months after
the row was written, and "it was validated on the way in" is the assumption
every stored-XSS bug is built on. Anything else renders no link at all.

### Secrets

`SMTP_PASSWORD` and `SMTP_USER` are read by one module and appear nowhere else:
not in a delivery record, not in an API response, not in a log line, not in the
startup banner, and not in any error message. The provider **name** is recorded
and shown, because it changes how `SENT` should be read.

SMTP errors are never stringified into a stored reason. A nodemailer error can
quote the command that was in flight, and during authentication that command is
`AUTH PLAIN <base64(user\0user\0password)>` — so `classifySmtpError` uses the
error's code and reply code to *select* a sentence ZyCart wrote, and appends the
server's own reply only after scrubbing `AUTH …` out of it and truncating.
Asserted by a test.

### Authorization

Every endpoint is under `/api/admin`, guarded once at the router by `requireAuth`
then `requireRole('ADMIN')`. There is no customer-facing notification API.

Verified against the running server:

| Request | Result |
| --- | --- |
| Unauthenticated list / detail / retry / summary | 401 |
| Signed-in customer, all four | 403 |
| Admin, malformed id | 400 |
| Admin, `status=DELIVERED` (not a real status) | 400 |
| Admin, unknown query key | 400 |
| Admin, `event=PASSWORD_RESET` | 400 |
| Admin, id that does not exist | 404 |
| Admin, retry with a recipient in the body | 400 |
| Admin, retry a `SENT` message | 409 |
| Admin, 31st retry in a minute | 429 with `Retry-After` |
| `POST /api/notifications/send` | 404 — no such route |
| `POST /api/admin/send-email` | 401 at the guard, then 404 — no such route |

---

## Privacy

A delivery record stores:

- the event, entity type, entity id and the reference a customer would quote;
- the resolved recipient address and display name;
- the template name and version;
- **the template payload** — product names, a tracking number, a refund amount;
- the rendered subject;
- status, attempt count, timestamps, provider name, provider message id;
- the last failure's kind, one-sentence reason and time.

It deliberately does **not** store the rendered HTML or text body. Those are
large, reproducible from the payload, and keeping every body ever sent would
turn this collection into a mail archive nobody asked for.

The payload is the only personal data here beyond the address and the name, and
it is bounded by what the message itself contained — which the customer received
in any case. It is stored because it is what makes a retry deterministic: a
message sent again six months from now is the message that was intended then,
not whatever the templates say by then.

Log lines carry the event, the notification id, the attempt number and the
reason. No address, no name, no payload, and never a credential.

### Retention

Delivery records are kept indefinitely, and there is deliberately no TTL index.
This differs from `WebhookEvent`, which expires after thirty days — that
collection is a deduplication ledger with no value past Razorpay's retry window,
whereas "was this customer told their refund completed?" is a question that gets
asked when a dispute arrives, which can be months later. The volume is a handful
of rows per order, so growth is proportional to trade rather than to traffic.

If a retention policy is ever wanted, the honest place for it is a decision
about `payload` specifically — the status, references and metadata are cheap and
useful; the payload is the part with a privacy cost.

---

## Data model

New collection: **`notificationdeliveries`**.

| Field | Type | Notes |
| --- | --- | --- |
| `key` | String, **unique** | `EVENT:reference`. The idempotency guarantee. |
| `event` | Enum | `ORDER_SHIPPED` · `ORDER_DELIVERED` · `RETURN_APPROVED` · `REFUND_COMPLETED` |
| `entityType` | Enum | `ORDER` · `RETURN` |
| `entityId` | ObjectId | |
| `entityLabel` | String | `ZY10482`, `ZYR-20260920-7Q4K` |
| `orderNumber` | String | The order behind a return, so one search finds everything about a sale |
| `user` | ObjectId → User | |
| `recipientEmail` | String | Resolved at creation, frozen |
| `recipientName` | String | |
| `template` / `templateVersion` | String / Number | |
| `payload` | Mixed | Re-validated against the template's schema before every render |
| `subject` | String | |
| `status` | Enum | `PENDING` · `SENDING` · `SENT` · `FAILED` |
| `attempts` | Number | Incremented by the claim, so it counts sends actually begun |
| `lastAttemptAt` / `sentAt` | Date | Null until they happen |
| `provider` | String | Recorded at send time, not read from config later |
| `providerMessageId` | String \| null | Null is a legitimate answer |
| `failure` | `{ kind, reason, at }` \| null | ZyCart's own sentence, never a raw error |

Indexes:

| Index | Serves |
| --- | --- |
| `{ key: 1 }` unique | Duplicate prevention |
| `{ status: 1, createdAt: -1 }` | The console's default view and its status filter; the summary counts |
| `{ event: 1, createdAt: -1 }` | The event filter |
| `{ entityId: 1, createdAt: -1 }` | "Everything we told this customer about this order", and `lastNotifiedAt` |

### Changes to existing models

- `AUDIT_ACTIONS` gains `NOTIFICATION_RETRIED`; `AUDIT_ENTITIES` gains
  `NOTIFICATION`. One action, because creating a notification is a consequence
  of a transition that is already audited, while asking for a failed message to
  be sent again is an act by a named person with an outward-facing consequence.
- Nothing else changed. No field was added to `Order`, `Shipment`,
  `ReturnRequest` or `User`.

### No migration

There is none, and that is the point. Notifications exist only for transitions
that happen *after* this phase ships. Nothing scans for orders that reached
`SHIPPED` last March, so no customer receives mail about a sale they had long
since forgotten. Asserted by a test.

---

## Admin console

`/admin/notifications` — under **Operations**, beside the activity log, rather
than next to Orders. A delivery record is not a commercial object; nobody works
a queue of emails the way they work a queue of returns. It is infrastructure
that occasionally needs a person.

**List.** Event, customer, reference, attempts, created, last attempt, status.
A real table from `lg` up, stacked cards below it. Server-side filtering on
status, event, period and a search across order number, return number and
recipient address. Three summary counts: waiting to send, failed, accepted
today — with the provider named, because "124 accepted today" means something
very different on `mock`.

**Detail.** The failure first when there is one, then the message (event,
subject, template and version, reference), the recipient with a note explaining
that the address was frozen at creation, and the delivery panel (status,
attempts, created, last attempt, accepted, provider, provider message id).

Not shown: the SMTP host, username, password, any authentication header, or the
raw provider error. The rendered body is not stored and so is not shown.

**Retry.** Offered only when the server says it would work; the reason is shown
when it would not. On success: "Email sent successfully." On failure: "The email
could not be sent. The delivery remains failed and can be retried later." Both
sentences come from the server, which is the only party that knows.

**Operations page.** One restrained line under a Communication heading, rendered
**only** when something is failing or waiting, linking straight to the filtered
list. "Sent today" is deliberately absent from it: that is a statistic, and the
operations page is a task list. The main dashboard is untouched.

---

## Customer experience

Deliberately small. All four events are raised by an administrator or by
Razorpay, so there is no customer action whose response could report a send
result — and ZyCart therefore never tells a customer "we've emailed you" as a
prediction.

What it does do: the customer's order page and return page show

> We emailed you an update on 20 September 2026. If you cannot find it, check
> your spam folder.

and they show it **only** when a delivery for that entity reached `SENT`. Null
covers three different situations on purpose — nothing worth emailing yet, a
message still waiting, a message that failed — because the page says the same
thing in all three: nothing.

It is one indexed lookup returning one timestamp, on the detail endpoints only.
Not a list: a customer has no use for delivery history, and loading one would
put an operational subsystem on the critical path of an ordinary page view.

Nothing about email can prevent a customer viewing an order. `flush` never
throws, and the delivery record is not read by any list endpoint.

---

## Testing

### Unit suite — `backend/tests/notifications.test.ts`

**124 new tests**, taking the backend suite from **285 to 409**, all passing, no
database required.

Covers: the event vocabulary and registry completeness; escaping, including
script payloads in a customer name, a product name, a carrier, a tracking number
and an operator's note; `safeExternalUrl` against `javascript:`, `data:`,
`vbscript:`, `file:`, plain `http:` and malformed input; subject sanitisation
and header-injection; every template's HTML and text output; missing-data
behaviour for each template; the returnability-driven return CTA; money
formatting and its refusal of non-integer rupees; payload re-validation,
including one event's payload rendered by another's template; greeting fallback;
SMTP error classification and credential scrubbing; the mock provider including
forced temporary and permanent failures; and configuration validation including
the SMTP-completeness and `CLIENT_URL` rules.

Every rendered message is additionally asserted to be a complete light-only HTML
document with no `<script>`, no event-handler attributes, no images, no
`@import`, no flex or grid, a `max-width:600px` fluid card, exactly one `<h1>`,
a preheader, a real ZyCart route as its CTA, no `undefined`/`NaN`, no
unsubscribe link, no invented support address, phone number or legal entity, and
no exclamation marks.

### Database suite — `backend/src/utils/verify-notifications.ts`

**103 checks**, all passing, against the configured MongoDB Atlas replica set.
Run with `pnpm notifications:verify`.

It refuses to start unless `EMAIL_PROVIDER=mock`, creates everything under
`ZYCART-P14-` / `ZYC-P14-` / `@zycart-p14.test`, never touches a record it did
not create, and removes its own data in a `finally`.

Covers:

- **Transactional creation** — order, parcel, audit row and delivery all
  committed together; the key, the resolved recipient, the template version, the
  payload snapshot, and that no HTML body is stored.
- **Escaping end to end** — a customer whose real account first name is
  `<img src=x onerror=alert(1)>`, carried through a real transition, a stored
  payload and a real render.
- **Duplicate prevention** — a repeated shipped transition, a second approval, a
  duplicate `refund.processed` webhook.
- **`EXCEPTION` raises nothing.** **Rejection raises nothing.** **Receiving
  raises nothing.** **A failed refund raises nothing**, and puts the order's
  refunded total back.
- **Both doors** into `SHIPPED` raise the same event, and an order with no parcel
  gets a message that invents no carrier.
- **Concurrency** — two simultaneous transitions produce one delivery record and
  one message; two simultaneous retries produce one send.
- **Provider failure** — the order is still `SHIPPED`, the delivery is `FAILED`
  not `SENT`, the whole budget is used, the reason is diagnosable, and the
  failure is classified by its cause rather than by the budget.
- **Recovery** — attempt one fails, attempt two succeeds, final state `SENT`
  with an attempt count of 2.
- **Permanent failure** — fails on the first attempt and is not retried
  automatically.
- **Retry safety** — retrying changes no order status, payment state, refunded
  total or stock, and creates no second record.
- **No backfill** — an order already `SHIPPED` gets nothing, and recording a
  parcel for it afterwards gets nothing.
- **Ordering** — shipped before delivered.
- **Recipient resolution** — from the account, frozen afterwards, with the next
  event picking up a changed address.

### Regression

| Suite | Result |
| --- | --- |
| `pnpm --filter zycart-backend test` | 409 passed, 0 failed |
| `pnpm returns:verify` (Phase 13) | 61 passed, 0 failed |
| `pnpm inventory:verify` (Phase 12) | 48 passed, 0 failed |
| `pnpm ai:verify` (Phase 10) | 43 passed, 0 failed |
| `pnpm discovery:verify` (Phase 11) | 63 passed, 0 failed |
| `pnpm typecheck` (backend + tests + frontend) | clean |
| `pnpm lint` (backend + frontend) | clean |
| `pnpm build` (backend + frontend) | clean |

### Browser verification

Against the production build (`next build` + `next start`, backend `node
dist/server.js`), at **320 / 390 / 768 / 1024 / 1440px** in **light and dark**:

`/admin/notifications`, `/admin/notifications/[id]` (a failed delivery and a
sent one), plus the Phase 12/13 regression pages `/admin`, `/admin/orders`,
`/admin/returns`, `/admin/operations`, `/admin/activity` — and the customer
pages `/account/orders`, `/account/orders/[orderNumber]`, `/account/returns`,
`/account/returns/[returnNumber]`.

No horizontal overflow at any width, no console errors, no page errors, no
hydration warnings.

The retry flow was exercised through the real UI: a delivery that had exhausted
its budget went from `Failed` (3 attempts) to `Sent` (4 attempts) with a
provider message id, the success message rendered, the failure banner cleared,
and a further retry was refused with the reason shown. The audit trail recorded
`NOTIFICATION_RETRIED` with a before/after change pair.

All four templates were rendered and inspected as HTML and as plain text at 320,
375, 390, 430 and 600px, with and without tracking data, with returns open and
closed.

### Live SMTP

**Not tested, because no SMTP credentials exist in this environment.**
`SMTP_HOST`, `SMTP_USER` and `SMTP_PASSWORD` are unset, so `EMAIL_PROVIDER`
resolved to `mock` throughout and no message left the machine.

What *was* verified about the SMTP path: that incomplete SMTP configuration
refuses to boot with a message naming each missing variable; that a complete
configuration resolves correctly; that error classification and credential
scrubbing behave as documented against synthetic nodemailer errors; and that no
credential appears in any serialised configuration. The transport itself —
connection, STARTTLS, authentication, envelope — has not been exercised against
a real mail server, and this document does not claim otherwise.

---

## Known limitations

### There is no background worker

This is the honest centre of the phase. Delivery is attempted in the request
that caused the transition, after its transaction commits. So:

```
transaction commits
↓
process crashes / is redeployed
↓
the message was never attempted
```

leaves a delivery in `PENDING` with `attempts: 0`. Nothing picks it up on its
own. It is visible on `/admin/notifications` — it is counted in "waiting to
send", and the operations page raises it — and an administrator can send it with
one click.

That is a real gap and this phase does not paper over it. Closing it properly
means a scheduled sweep, which means either a worker process or a cron entry;
both are infrastructure this phase was explicitly asked not to introduce, and a
sweep bolted onto the API process would be a job queue pretending not to be one.

### Exactly-once delivery is not claimed

ZyCart guarantees **one notification intent per domain event, exactly once** —
that is what the unique index buys — and makes delivery **idempotent, bounded
and retryable**.

It does not guarantee exactly-once *email delivery*, and nothing in this design
could. Consider:

```
SMTP accepts the message
↓
the network drops before the acknowledgement arrives
```

ZyCart genuinely does not know whether the message was accepted. The attempt is
recorded as a failure, because that is the only honest reading of a response
that never came, and a retry may produce a second copy in the customer's inbox.
Closing that would need provider-side idempotency keys, which SMTP does not
have and which the Razorpay-style "claim before you act" pattern cannot supply
for a protocol with no request id.

The same ambiguity is why a stale `SENDING` row is never reclaimed
automatically, and why the console warns in words before an administrator
reclaims one.

### Delivery to the inbox is unknown

No bounce handling, no delivery receipts, no open tracking. `SENT` means the
provider accepted the message. A message accepted and then filtered, bounced or
silently dropped is indistinguishable here from one that arrived.

### Other bounds

- **The rate limiter is per process.** In-memory, like every other limiter in
  ZyCart. Behind a load balancer each instance counts separately.
- **English only.** Templates are structured so a locale could be threaded
  through `EmailContent`, but there is no language preference on the account and
  Phase 14 did not invent one.
- **One recipient per message**, the account's own address. ZyCart's user model
  has one email and this phase did not widen it.
- **No marketing/transactional preference switch.** These are transactional
  messages and there is nothing to opt out of. The separation exists in the
  architecture — `NOTIFICATION_EVENTS` is a closed list of business transitions
  — but no preference model was built, because there is nothing yet for it to
  govern.
- **Attachments, inline images and a logo file** are all absent. The masthead is
  type, because a blocked image is a blank header.

---

## Not in this phase

- SMS, push or in-app notifications
- Order-confirmation, payment-receipt, password-reset or return-rejected emails
- Bounce or complaint handling
- A scheduled sweep for stranded deliveries
- Localisation or per-customer language
- Any marketing communication of any kind
- An administrative "send an email" tool
