# Phase 15 — Operational Hardening, Notification Recovery & Payment/Webhook Security

## Overview

Phase 14 shipped transactional email and ended by naming two things it had not
done: a committed notification could be stranded by a crash with nothing to
recover it, and the most security-sensitive code in the repository — signature
verification, event-id deduplication, payment finalisation — had no tests of its
own.

Phase 15 is those two things, plus the operational surface that makes them
usable. It adds no customer-facing feature, no new infrastructure and no new
dependency.

| Gap | What closes it |
| --- | --- |
| A crash between commit and send strands a `PENDING` delivery | `pnpm notifications:drain` — a finite command, run by cron |
| A crash mid-send leaves a `SENDING` row nothing will touch | Reported everywhere, recoverable by a person, never automatically |
| The Razorpay boundary had no direct tests | `tests/payments.test.ts` (69 cases) and `pnpm payments:verify` (98 checks) |
| Finalisation could not be tested without live credentials | A gateway-reads parameter with a production default |

### What did not change

The retry policy, the delivery states, the idempotency keys, the template
registry, the provider abstraction, the webhook contract and every external
response are exactly as Phase 14 left them. Phase 15 added a way to recover
work and a way to prove the existing behaviour; it did not alter the behaviour.

---

## Notification recovery

### The gap, precisely

```
begin transaction
  order → SHIPPED
  NotificationDelivery → PENDING
  audit row
commit
↓
process crashes, or is redeployed
↓
the message was never attempted
```

The delivery sits at `PENDING` with `attempts: 0`. Nothing in Phase 14 picked
it up, and Phase 14 said so rather than hiding it.

### The drain

```bash
pnpm notifications:drain
pnpm notifications:drain --dry-run
pnpm notifications:drain --limit 20
pnpm notifications:drain --include-stale
pnpm notifications:drain --help
```

It claims a bounded amount of work, does it, prints what happened and exits.
There is no `while (true)`, no lease renewal, no queue and no broker — `cron`,
which every deployment already has, is the scheduler.

**What it takes.** `PENDING` deliveries that still have attempts left in the
automatic budget, oldest first, **exactly once per run**.

**What it does not take.** `FAILED` deliveries. A message that has used its
budget is one a person should look at; a cron job quietly retrying it forever
would turn a bounded retry policy into an unbounded one. The admin Retry button
still reaches those, under its own rules.

**Why once per run.** A temporary failure leaves a message `PENDING` with one
more attempt spent, so it is immediately eligible again — and a loop that kept
picking the oldest eligible row would spend the whole run on one unreachable
recipient while a hundred others waited. Every id attempted is excluded from the
next page. The next scheduled run is the retry.

### The claim

The drain does not find-then-update. It uses the same atomic
`findOneAndUpdate` Phase 14 built for the admin Retry button, with a filter that
carries the eligibility rule:

| Caller | May claim |
| --- | --- |
| `automatic` (the request that raised the event) | `PENDING` or `FAILED`, attempts < 3 |
| `manual` (admin Retry) | anything not `SENT`, plus an abandoned `SENDING` |
| `drain` | `PENDING` only, attempts < 3 |
| `drain-stale` | as `drain`, plus an abandoned `SENDING` |

`SENT` appears in none of them.

Two drains running at once therefore cannot send the same message twice: one
claim wins, the other is told the row is not eligible, and that is counted as
`skipped` rather than treated as an error. Verified against a real replica set
with genuinely concurrent runs.

### The preflight

The transport is built **before a single row is claimed**. A misconfigured drain
that discovered its problem one message at a time would spend an attempt on
every pending delivery and push the whole backlog to `FAILED` — turning a
configuration mistake into data loss. Failing first leaves every row exactly as
it was, and exits 1.

### Abandoned `SENDING`

A delivery in `SENDING` was handed to the provider by a process that then died.
Whether the provider accepted it first is **genuinely unknown** — SMTP has no
way to ask — so reclaiming one may put a second copy of the same message in a
customer's inbox.

So:

- the ordinary drain **never** touches one;
- it **always** reports how many are waiting, in every mode including
  `--dry-run`;
- `/admin/notifications` shows a notice, and the row and the detail page both
  say **Abandoned** in words;
- `--include-stale` reclaims them, and the help text says why that is a
  decision rather than a default.

The threshold is `STALE_SENDING_MS` (10 minutes), centralised in
`config/notifications.ts` — far longer than any transport timeout, which are
seconds.

### Exit codes

```
0   ran, and everything it claimed was accepted
1   could not run — bad configuration, no database, no transport
2   ran, and at least one delivery failed
```

`1` means nothing was attempted and the run is worthless until somebody fixes
something. `2` means the mechanism worked and a message did not go out, which is
recorded, visible and retryable. An operator who wants to be paged for both
treats anything non-zero as a failure; one who only cares about the machinery
ignores `2`.

### Bounds

| Bound | Value | Why |
| --- | --- | --- |
| `DRAIN_DEFAULT_LIMIT` | 50 | Far more than a store this size strands between cron ticks |
| `DRAIN_MAX_LIMIT` | 500 | So `--limit` cannot turn a finite command into an open-ended one |
| Page size | 25 | The eligible set changes while a run works through it; re-reading in pages keeps the view fresh without loading the collection |
| `MAX_AUTOMATIC_ATTEMPTS` | 3 | Unchanged from Phase 14. The drain does not multiply it |

### Scheduling

```cron
*/5 * * * * cd /srv/zycart && pnpm notifications:drain >> /var/log/zycart-drain.log 2>&1
```

That path is an example, not a configured one. Five minutes is ample: the drain
only ever has work when a process died between a commit and a send.

`--dry-run` claims nothing, sends nothing and writes nothing. It reports
eligible work and the stale count, and deliberately prints no "Remaining" line —
a dry run did no work, so everything eligible is still there.

---

## Payment and webhook hardening

### What the tests cover

**`backend/tests/payments.test.ts` — 69 cases, no database, no network.** Every
HMAC is computed against a secret generated in the file, which is what makes it
checkable.

- **Webhook signature**: valid; wrong secret; body modified after signing; body
  re-serialised with identical content but different bytes; empty, short, long,
  non-hex and JSON-object signatures; empty body; non-Buffer body; and that the
  comparison never throws on any input.
- **Checkout signature**: the documented `order_id|payment_id` payload; wrong
  order; wrong payment; ids shifted across the `|` separator; wrong secret;
  each field missing.
- **Envelope parsing**: `payment.captured`, refund envelopes, unknown fields
  tolerated; missing/empty/non-string/oversized event names; missing payload;
  non-object payload; entity with no id; array, string, null and undefined
  envelopes; unsupported events parsed so the dispatcher can ignore them
  deliberately; `$set`/`$inc` keys inside an entity; a prototype-polluting key
  in place of a declared field.
- **Validators**: `createPaymentSchema` and `verifyPaymentSchema` refuse a
  smuggled `amount`, `total`, `userId`, `status`, `paidAt` or `currency`; refuse
  malformed and cross-typed gateway ids; refuse a query operator in place of an
  id.
- **Money**: rupee/paise conversion, refusal of fractional, `NaN`, infinite,
  negative and implausible amounts, and that `paiseMatchRupees` answers `false`
  rather than throwing for anything malformed.
- **Configuration**: half-configured Razorpay refused; none accepted; a live key
  outside production refused; a test key in production refused; malformed key
  ids refused; and that neither secret appears in anything a banner would print.

One documented finding: **an uppercase-hex signature is accepted**, because hex
decoding is case-insensitive and the same digest in capitals is the same digest.
That widens nothing — an attacker still has to know the correct bytes — so it is
asserted and explained rather than tightened, and the test confirms that
flipping a single character still fails.

**`pnpm payments:verify` — 98 checks, real replica set, stubbed gateway.**

- **The full signed pipeline**: raw bytes → signature → envelope → event-id
  claim → domain state. A forged signature, an absent signature and a body
  altered after signing are each refused, and none of them is recorded as a
  handled event or touches the order.
- **Deduplication**: the same event id twice sequentially, and twice
  concurrently. Exactly one processes; exactly one ledger row exists; a
  duplicate is acknowledged rather than errored, so Razorpay is not told to
  retry.
- **Events with nothing to do**: unknown gateway order, unhandled event type, no
  order reference, no refund id, a refund ZyCart never issued — all acknowledged
  and ignored.
- **Finalisation**: a captured payment confirms the order, takes stock, writes a
  `SALE` movement and records the gateway payment id and paid-at time. A second
  call reports `ALREADY_FINALIZED` **without reaching the gateway** (asserted by
  a call counter) and without taking stock or writing a movement twice. Two
  concurrent finalisations produce exactly one winner and one stock movement.
- **Refusals**: failed payment; authorised-but-not-captured; wrong amount;
  payment belonging to another gateway order; wrong currency; an order whose
  lines no longer sum to its stored total (refused **before** the gateway is
  consulted); a cancelled order.
- **Captured but unfulfillable**: stock gone between Checkout and capture →
  exactly one refund issued, order cancelled, payment `REFUNDED`, refund id and
  refunded total recorded, no stock taken, no `SALE` movement, and a duplicate
  arriving mid-refund does not issue a second one.
- **Refund webhooks**: `refund.processed` settles the return and raises exactly
  one customer message; a redelivery is a duplicate; the *same refund under a
  new event id* changes nothing and does not double the refunded total;
  `refund.failed` returns the request to `RECEIVED`, clears the gateway refund
  id, records a reason, raises **no** message and takes the amount back off the
  order; two concurrent settlements produce one message.
- **Hostile payloads**: a correctly signed `payment.failed` carrying `$set`,
  `$inc`, `$unset`, `status`, `pricing`, `stockCommitted` and `user` changes none
  of them; an oversized gateway message is truncated to 300 characters; a late
  failure for an already-paid order changes nothing.
- **Invariants**: every paid order has a gateway payment id and a paid-at time;
  no order is refunded beyond its total; every refunded order has a refund id;
  every refunded return records when it completed.

### The gateway seam

`finalizeSuccessfulPayment` takes its two gateway reads as a parameter:

```ts
export interface PaymentGatewayReads {
  fetchPayment: typeof razorpay.fetchPayment;
  refundPaymentInFull: typeof razorpay.refundPaymentInFull;
}

finalizeSuccessfulPayment(env, order, paymentId, gateway = LIVE_GATEWAY)
```

Every production caller — `payment.controller`, `dispatchWebhook`,
`verifyClientPayment` — uses the three-argument form and gets the live gateway.

**Why this is not a hole.** It is an ordinary function argument with a
production default. There is no exported setter, no mutable module state and no
environment variable that swaps it, so nothing reachable over HTTP can supply
one. The alternative — a `__setGatewayForTests` global — is the shape that
becomes a vulnerability, and it is deliberately not what this is.

Without it, the entire finalisation path was reachable only by a deployment
holding real credentials, which is why it had never been tested.

### The raw-body path

Checked, not assumed. `app.ts` mounts `express.raw()` on the webhook path
**before** the global `express.json()`, and body-parser marks a request once it
has read the body, so the JSON parser leaves it alone. The verification asserts
the consequence directly: a body whose bytes changed after signing is refused,
and a semantically identical re-serialisation is refused too.

Nothing about the middleware order was changed.

### Mass assignment

A webhook payload is never spread into an update. The envelope schema is
deliberately permissive about unknown fields — Razorpay adds them, and rejecting
an event because it grew one would break the integration — so the protection is
not "the parser strips them" but that every consumer names the fields it reads.
Both halves are tested: the schema keeps the keys, and the domain ignores them.

---

## Where idempotency lives

One table, because this is the architectural fact the repository most needs
written down.

| Concern | Mechanism | Where |
| --- | --- | --- |
| Notification intent | Unique index on `key` = `EVENT:reference` | `notification-delivery.model.ts` |
| Notification send | Atomic claim `→ SENDING` with `$inc: attempts`, filtered by eligibility | `notification.service.ts` |
| Drain overlap | The same claim. A lost race is `skipped`, not an error | `drain.ts` |
| Webhook delivery | Unique index on `WebhookEvent.eventId`, claimed by insert | `payment.service.ts` |
| Payment finalisation | Conditional update requiring `status: PENDING`, a finalizable payment status and `stockCommitted: false` | `payment.service.ts` |
| Unfulfillable refund | Conditional update requiring `payment.refundId: null` and a non-refunding status | `payment.service.ts` |
| Return refund claim | Conditional update requiring `RECEIVED` and `refund.claimedAt: null` | `refund.service.ts` |
| Refund settlement | Conditional update requiring `REFUND_PENDING` | `refund.service.ts` |
| Returnable quantity | Atomic `$inc` with the guard in the array filter | `return.service.ts` |
| Stock | Atomic `$inc` with sufficiency in the filter | `order.service.ts` |

Every one of these is a database-enforced precondition rather than a
read-then-decide. That is the single property the whole system rests on.

---

## Reliability, answered directly

| Question | Answer |
| --- | --- |
| Crash after a notification commits? | The drain recovers it. Verified. |
| Crash after SMTP accepted but before the response? | Still unknown, still not solved. The row is `SENDING`, it is reported everywhere, and only a person may reclaim it. |
| Two drains at once? | The atomic claim admits one. Verified with concurrent runs. |
| Duplicate webhook? | The event-id unique index admits one. Verified sequentially and concurrently. |
| Duplicate refund webhook? | No second refund and no second email — two independent guards. Verified. |
| Same refund under a *different* event id? | The conditional update on `REFUND_PENDING` catches it. Verified. |
| Email provider down? | Commerce state commits regardless. Verified: the order is `SHIPPED` and the delivery is `FAILED`. |
| Drain misconfigured? | The preflight fails before a row is claimed. Exit 1, nothing touched. |
| Can a retry trigger a domain action? | No. Verified: order status, payment state, refunded total and stock are all unchanged by a retry. |

### What is still not guaranteed

**Exactly-once email delivery.** ZyCart guarantees one notification intent per
domain event, exactly once, and makes delivery idempotent, bounded and
retryable. It cannot guarantee that a message reached a mailbox exactly once,
because SMTP can accept a message and lose the acknowledgement on the way back.
Phase 15 makes that state recoverable and visible; it does not make it
unambiguous, and no design at this layer could.

**Delivery to the inbox.** No bounce handling, no receipts. `SENT` means the
provider accepted the message.

---

## Security

### Verified in this phase

| Check | Result |
| --- | --- |
| Unsigned webhook data reaching domain logic | Refused at the signature, before the envelope is parsed |
| Body altered after signing | Refused |
| Body re-serialised identically | Refused |
| A signed payload carrying `$set` / `$inc` / `$unset` | Parsed, ignored, order unchanged |
| A smuggled `amount` on a payment request | 400 |
| A query operator in place of a gateway id | 400 |
| An oversized gateway message | Truncated to 300 characters |
| SMTP credentials in a delivery record, log line or drain output | None — asserted against a real failing transport |
| The drain's `--help` naming a secret variable | None |
| Admin notification retry rate limit | Intact: 30/minute per administrator, then 429 with `Retry-After` |

One behavioural detail worth recording: on a deployment with **no** Razorpay
configuration, the webhook endpoint answers a badly signed request with **503**
rather than 400. `requireConfig` throws before the HMAC comparison, because
there is no webhook secret to compare against — which is the honest answer for
a store that does not take online payments, and which still processes nothing.
With Razorpay configured, a forged signature is a 400 and never reaches the
envelope parser, let alone the domain; `payments:verify` asserts that directly.

### Credential scrubbing, against a real transport

The SMTP provider was pointed at an unreachable local port with
`SMTP_USER` and `SMTP_PASSWORD` set, and two deliveries were driven through it.
The recorded failure was ZyCart's own sentence — *"Could not reach the mail
server (ESOCKET)."* — and neither the password, the username, nor even the host
appeared in the delivery records, the log lines or the command's output.

### The drain's exposure

It is a command line utility, not an endpoint. There is no route through which a
customer, or an administrator, can invoke it. It prints no secret in any mode,
including on a configuration error — an incomplete SMTP configuration is
reported by naming the *variables*, never their values.

---

## Operational runbook

### "A customer says they never got the email"

1. `/admin/notifications`, search the order or return number.
2. `Sent` — the provider accepted it. Check their spam folder; ZyCart has no
   delivery receipts and cannot say more.
3. `Failed` — the reason is on the detail page. Fix the cause, then **Retry**.
4. `Pending` — it is waiting. Run the drain, or wait for the next scheduled run.
5. `Abandoned` — a send was interrupted and nobody knows whether it went out.
   Retrying may send a second copy; that is the operator's call.

### "Emails are piling up as Pending"

```bash
pnpm notifications:drain --dry-run    # what is waiting
pnpm notifications:drain              # send it
```

An exit code of 2 means messages failed; the reasons are in the output and on
each delivery's page. An exit code of 1 means the drain could not run at all —
check `EMAIL_PROVIDER`, the SMTP variables and `MONGODB_URI`.

### "Deliveries are stuck in Sending"

A process died mid-send. Decide whether a possible duplicate is acceptable:

```bash
pnpm notifications:drain --include-stale
```

or retry them individually from `/admin/notifications`, where the page states
what is and is not known.

### "Is mail actually configured?"

The startup banner says so, without printing a secret:

```
Transactional email: SMTP via smtp.example.com:587 as ZyCart <no-reply@zycart.example>
Email links point at: https://zycart.example
```

or

```
Transactional email: mock provider - messages are rendered and recorded, and nothing is delivered.
```

Every drain run repeats it on a line of its own, and the admin console shows a
notice while the mock provider is active.

### "A webhook problem"

`payment.service` logs every event it receives with its event id and outcome.
A signature failure logs `webhook rejected: signature mismatch`; a shape failure
logs `webhook rejected: unexpected payload shape`. The `WebhookEvent` collection
is the ledger of what was accepted — one row per event id, with the outcome — and
it expires after 30 days.

---

## Testing

### Counts

Every figure below is from a run of the command named. The concurrency suites
were run four times each, because a race that passes once has not been tested.

```
Backend unit:            519 passed, 0 failed   (409 before Phase 15 → +110)
  payments.test.ts        69 new
  drain.test.ts           41 new

Database verification:
  notifications:verify   153 passed, 0 failed   (103 before Phase 15 → +50)
  payments:verify         98 passed, 0 failed   (new)
  returns:verify          61 passed, 0 failed
  inventory:verify        48 passed, 0 failed
  ai:verify               43 passed, 0 failed
  discovery:verify        63 passed, 0 failed
                         ───────────────────
                         466 checks

Browser:                 100 page renders — 0 overflow, 0 console errors
Builds:                  backend + frontend clean; typecheck + lint clean
```

### Concurrency, against the real replica set

| Case | Result |
| --- | --- |
| Two drains, three stranded deliveries | Three sent, exactly once each; every row `attempts: 1` |
| Two admin retries of one delivery | One send, and exactly one caller reports having performed it |
| Two webhook deliveries of one event id | One processed, one duplicate, one ledger row |
| Two finalisations of one payment | One `FINALIZED`, one stock movement |
| Two refund settlements of one return | One `SETTLED`, one customer message |
| Two order transitions to `SHIPPED` | One commits, one delivery record, one message |

### A finding the concurrency checks produced

Running the suite repeatedly surfaced a genuine ambiguity in the retry API. Two
administrators clicking Retry at the same instant produce exactly one send — the
atomic claim guarantees that, and it was never in question. But the *loser* of
that race re-reads the row, and depending on timing finds it either already
`SENT` or still `SENDING`. `RetryResult.sent` therefore answered "is it sent?"
while reading like "did I send it?", and a count of `sent` responses said two
sends had happened when one had.

`RetryResult` now carries `claimed` — whether *this* request performed the
attempt — alongside `sent`. Exactly one of two concurrent retries can be
`claimed`, because exactly one can win the claim. The console uses `sent` for
tone and the server's sentence for wording, so the losing administrator is told
"This message has been sent. Another attempt got there first." and never that
they sent it.

The behaviour was always correct; the reporting was not. It took a timing
difference between runs to show it, which is the argument for running
concurrency checks against a real replica set more than once.

### The drain, verified end to end

Deliveries were stranded by running a real domain transition inside a
transaction with no outbox — which is exactly what a crash between commit and
send leaves behind, produced by the real service rather than by inserting a row.

Verified: a dry run claims nothing and spends no attempt; a real run sends it on
its first attempt; a second run finds nothing; a `FAILED` delivery is never
picked up but the admin Retry still reaches it; an abandoned `SENDING` row is
left alone and reported, and `--include-stale` reclaims it with the extra
attempt counted; `--limit` stops the run and the next one picks up the
remainder.

### Live SMTP

**Partially exercised, and not against a real mail server.**

No SMTP credentials exist in this environment, so no message was delivered
anywhere. What *was* exercised for the first time is the transport itself: the
SMTP provider was built with nodemailer, pointed at an unreachable local port,
and two real deliveries were driven through it. That verified connection
failure, error classification (`ESOCKET` → temporary), the failure reason
written to the delivery record, credential scrubbing against a genuine transport
error, the drain's exit code 2, and recovery on a later run.

Not exercised: a successful SMTP connection, STARTTLS negotiation, authentication
against a real server, envelope acceptance, or a provider message id from a real
transport. Those need credentials this environment does not have, and this
document does not claim otherwise.

### Live Razorpay

**Not tested.** All three Razorpay variables are blank in this environment — a
pre-existing condition, not one this phase introduced — so no live gateway call
was made and no money moved.

The webhook pipeline was driven with a **synthetic** webhook secret: random
bytes generated in the verification process, used to sign payloads that the same
process then verifies. That is not a credential, it reaches no network, and the
events driven through it resolve entirely against the database. Finalisation was
driven with a stub. `payment.captured` is deliberately never driven through
`handleWebhookEvent`, because that path would reach the live SDK.

### Cleanup

Every verification fixture is created under a reserved prefix — `ZYCART-P14-` /
`ZYC-P14-` for notifications, `ZYCART-P15-` / `ZYC-P15-` / `evt_p15_` for
payments — and removed in a `finally`. Both scripts report `clean` at the end,
and the `notificationdeliveries`, `webhookevents` and order collections were
confirmed empty of fixture data afterwards. Neither script contains
`deleteMany({})`, `dropDatabase`, `dropCollection` or `syncIndexes`, and neither
reads or writes a record it did not create.

---

## Changes

### New files

| File | Purpose |
| --- | --- |
| `services/notifications/drain.ts` | The drain: eligibility, paging, bounds, summary |
| `services/notifications/drain-cli.ts` | Argument parsing, usage text, output formatting — side-effect free, so it is testable |
| `utils/drain-notifications.ts` | The executable shell: parse, connect, run, report, exit |
| `utils/verify-payments.ts` | Payment and webhook verification against a real replica set |
| `tests/payments.test.ts` | The gateway boundary, pure |
| `tests/drain.test.ts` | The drain's command surface |

### Modified

| File | Change |
| --- | --- |
| `notification.service.ts` | Claim rules extracted into `eligibilityFilter` with four named modes; `eligibleForDrain`; `deliverForDrain`; `stale` on rows and the summary |
| `payment.service.ts` | Gateway reads as a defaulted parameter; six deprecated `{ new: true }` options replaced with `returnDocument: 'after'` |
| `verify-notifications.ts` | 49 drain, concurrency and ledger-consistency checks |
| Admin console | Abandoned deliveries surfaced on the list, the detail and the operations page |

### New scripts

```bash
pnpm notifications:drain     # recover stranded deliveries
pnpm payments:verify         # payment and webhook verification
```

### Dependencies

**None added.** No queue library, no scheduler, no worker framework.

### Indexes

**None added.** The drain's query is `{ status, attempts }` sorted by
`{ createdAt, _id }`, served by the existing `{ status: 1, createdAt: -1 }`
index. The stale count uses the same one. The webhook lookup uses the existing
unique index on `eventId`.

---

## Known limitations

- **The drain must be scheduled.** ZyCart does not install a cron entry; a
  deployment that never runs the command still strands deliveries after a crash.
  The startup banner does not warn about this, because the server has no way to
  know whether cron is configured.
- **Abandoned deliveries need a human.** By design, and for a reason that cannot
  be engineered away at this layer.
- **The rate limiter is per process.** Unchanged from earlier phases: behind a
  load balancer each instance counts separately.
- **A live mail server has still not been exercised.** See above.
- **A live gateway has still not been exercised.** See above.
- **`payment.captured` through the webhook is untested end to end**, because
  that path reaches the live SDK. Its two halves are tested separately: the
  dispatch (unknown order, no payment id, duplicate event) and the finalisation
  (with a stub).
- **No structured logging.** Log lines carry the fields that matter — operation,
  event, id, attempt, reason — as text. A log aggregator would want JSON; that is
  a deployment decision, not a code one, and adding a logging framework was out
  of scope.

---

## Not in this phase

- A worker, a queue, a broker or a scheduler daemon
- Structured or shipped logs, metrics, tracing
- Live SMTP or live gateway verification
- Bounce handling or delivery receipts
- Any customer-facing change
- Any new notification event, template or channel
