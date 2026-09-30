# Phase 19 — Virtual Try-On

## Overview

A shopper deciding whether something suits them wants to see it on themselves.
Phase 19 adds a virtual fitting room to the product page: on any product whose
category allows it, a signed-in customer uploads or takes a photo, and an image
model returns the same photo with the product worn — a shirt on their torso,
shoes on their feet, glasses on their face, a bag on their shoulder.

Two providers render it, chosen by `TRY_ON_PROVIDER`:

| Provider     | Model                                                       | Cost                                                               | Likeness                                |
| ------------ | ----------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------- |
| `cloudflare` | FLUX.2 [klein] 4B (`@cf/black-forest-labs/flux-2-klein-4b`) | **Free**: ~80 previews a day per store on the Workers AI Free plan | Good; photos are sent at 512 px         |
| `gemini`     | Nano Banana 2 (`gemini-3.1-flash-image`)                    | ~$0.067 a preview; needs a billing-enabled Google project          | Best; photos are sent at up to 1,536 px |

The Gemini path reuses the assistant's integration — the same SDK
(`@google/genai`) and, by default, the same key. The Cloudflare path is one
REST call with a Workers AI token, and exists so the feature can run at no
cost: no Gemini image model has a free tier.

## The flow

1. The product page asks `GET /api/try-on/status` once it is in the browser. The
   **Try it on** button appears only when the product's category has try-on
   switched on _and_ the store has it configured. A guest who presses it is
   asked to sign in.
2. The customer chooses a photo or takes one (the front camera on a phone). It
   is **redrawn on the device** — at most 1,536 px on its longest side,
   re-encoded as JPEG — which shrinks a 10 MB camera file to a few hundred
   kilobytes and, because only the pixels are redrawn, **drops its EXIF
   metadata, including GPS coordinates**.
3. They tick a consent box — _this is me, I am 18 or over, and I agree to it
   being sent to Cloudflare Workers AI_ (or _Google's Gemini AI_ — the status
   endpoint names whichever the store uses) — and press **Create my preview**.
4. `POST /api/try-on/:productRef` carries the photo as the raw body, the consent
   header and the chosen colourway. The server checks the photo by its own
   bytes, loads the product and its category, fetches the product photo,
   reserves one try, and sends person + product + instruction to the model.
5. The preview comes back as a `data:` URL with `Cache-Control: no-store` and is
   shown beside the original, with **Add to cart**, **Save** and **Another
   photo**. Add to cart uses the page's own handler, so size and colour rules
   are unchanged.

## Privacy

The customer's photo is personal data of the most personal kind, and the design
keeps as little of it as possible for as short a time as possible.

- **Never stored.** The photo lives in the request body and is gone when the
  request ends. It is not written to disk, to MongoDB, to object storage, or to
  a log — not even its size. The preview is not stored either; it exists in
  the customer's tab until they close the dialog.
- **Location stripped** on the device before upload (see above).
- **Consent is required by the server**, not only by the checkbox: a request
  without `X-Try-On-Consent: granted` is refused.
- **What ZyCart keeps:** a count of tries per account per day
  (`TryOnUsage`), expired after a week by a TTL index.
- **What the provider sees:** the two photos and the instruction, for the
  duration of the request. The consent text names the provider actually in use
  (`TRY_ON_PROCESSOR`), so the sentence a customer agrees to cannot drift from
  where their photo goes.
  - **Cloudflare** states it does not use Workers AI customer content to train
    any model or improve any service, and stores nothing unless the account
    pairs Workers AI with a storage product (ZyCart does not).
  - **Google** — use a billing-enabled key: on Google's free tier, submitted
    content may be used to improve Google's products. Gemini previews carry
    Google's invisible **SynthID** watermark.

## Cost control

Every try is a paid image generation.

- **Signed-in customers only**, so every try is counted against an account.
- **Daily allowance** (`TRY_ON_DAILY_LIMIT`, default 10), reset at midnight
  IST. It lives in the database, not in the in-memory rate limiter, because a
  serverless deployment runs many processes and each would otherwise hand out
  its own allowance.
- **Race-safe.** A try is reserved by one conditional upsert — _increment where
  the count is below the limit_ — against a unique `{ user, day }` pair. The
  duplicate-key case is retried once, because two first-of-the-day tries race
  to create the document without either being over any limit. Verified against
  a real replica set: six concurrent tries against a limit of three produce
  exactly three previews and three refusals, and the count never passes three.
- **Failures are free.** A try that produced no picture — a refusal, a timeout,
  a rejected key — is given back. Everything that can fail on its own merits
  (the photo, the product, the colour, the product image) is checked _before_
  the reservation, so it never touches the allowance.
- **Burst limit.** Four requests a minute per account, so one tab cannot hold
  several slots at once.
- **Eligibility.** A category must have try-on switched on
  (`Category.tryOnEnabled`, off by default; the seed switches on Fashion,
  Footwear and Accessories). Nobody pays to see a speaker "worn".

## When the provider says no

Google answers two different problems with the same 429 (sometimes a 403) and
`RESOURCE_EXHAUSTED`. Only the body tells them apart:

| Body says                  | Meaning                                                                                      | Customer sees                                      | Try-on                    |
| -------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------- |
| `limit: 10` (any non-zero) | Allowance spent; refills by itself                                                           | "Try-on is busy right now…" (503)                  | Carries on                |
| `limit: 0`                 | The key has **no** allowance for the model — a free-tier key; no image model has a free tier | "Virtual try-on is not available right now." (503) | **Paused for 10 minutes** |
| 401 / non-quota 403        | Key rejected                                                                                 | "Virtual try-on is not available right now." (503) | **Paused for 10 minutes** |

`limit: 0` becomes the failure kind `no_quota` (`services/ai/gemini.provider.ts`,
`hasNoQuota`). It never clears on its own, so telling a customer to try again
in a minute would be a promise the store cannot keep.

Cloudflare says no by error code (`toCloudflareError` in
`services/ai/cloudflare-image.provider.ts`), never quoted:

| Code              | Meaning                                 | Customer sees                                           | Try-on                                 |
| ----------------- | --------------------------------------- | ------------------------------------------------------- | -------------------------------------- |
| 3036 / 4006 (429) | The day's free 10,000 neurons are spent | "Virtual try-on has reached its limit for today." (503) | **Paused until 00:00 UTC**, `warn` log |
| 3040 (429)        | Workers AI out of capacity              | "Try-on is busy right now…" (503)                       | Carries on                             |
| 5035 (403)        | Model needs the Workers Paid plan       | "Virtual try-on is not available right now." (503)      | **Paused for 10 minutes**              |
| 5007 / 3042       | No such model — check `TRY_ON_MODEL`    | "Virtual try-on is not available right now." (503)      | **Paused for 10 minutes**              |
| 401 / other 403   | Token rejected, or not this account's   | "Virtual try-on is not available right now." (503)      | **Paused for 10 minutes**              |

A spent daily allowance is the failure kind `daily_quota`: expected on a free
plan, so it is a warning rather than an alert, and it pauses until the reset
time Cloudflare's allowance follows (never more than a day).

A failure only the operator can fix pauses try-on in that process: the status
endpoint answers `available: false`, so the button disappears, and any try
still in flight is refused before its photo is read, its allowance is touched
or Google is called. The log line is `try_on_failed` at `error` level with
`needsManualAction: true` and a `detail` naming the fix — ZyCart's sentence,
never Google's body. The pause expires by itself, because the fix (enabling
billing, replacing a key) happens outside the process and tells it nothing;
the next try after that finds out whether it worked.

## The instruction

`services/try-on/prompt.ts` decides **where** the product goes from the
product's own words and its category — a footwear category is decisive (so a
"cap-toe" shoe is not a cap); otherwise whole-word patterns for eyewear,
wristwear, bags, headwear and jewellery; otherwise clothing for apparel and a
generic accessory placement. Most of the instruction is about what must **not**
change: the same face and identity, skin tone, body shape and proportions, hair,
pose, expression and background — _do not slim, reshape, retouch or beautify_.
A try-on that flattered the customer would answer the wrong question.

`services/try-on/response.ts` takes the **last non-thought image** from the
answer (reasoning image models can return drafts marked `thought: true`),
ignores accompanying text, and classifies no-image answers as a refusal (a
block reason or a safety finish reason) or empty.

## Where it lives

| Piece                     | File                                                                   |
| ------------------------- | ---------------------------------------------------------------------- |
| Configuration             | `backend/src/config/try-on.ts`                                         |
| Choosing the provider     | `backend/src/services/try-on/generator.ts`                             |
| The Cloudflare call       | `backend/src/services/ai/cloudflare-image.provider.ts`                 |
| Placement + prompt (pure) | `backend/src/services/try-on/prompt.ts`                                |
| Reading the answer (pure) | `backend/src/services/try-on/response.ts`                              |
| Daily allowance           | `backend/src/services/try-on/quota.ts`, `models/try-on-usage.model.ts` |
| Orchestration             | `backend/src/services/try-on/try-on.service.ts`                        |
| The one Gemini image call | `backend/src/services/ai/gemini-image.provider.ts`                     |
| Routes                    | `backend/src/routes/try-on.routes.ts`                                  |
| Photo preparation         | `frontend/lib/photo.ts`                                                |
| Button + dialog           | `frontend/components/product/try-on-button.tsx`, `try-on-dialog.tsx`   |
| Admin switch              | Categories → edit → **Virtual try-on**                                 |

The generator is a parameter with a production default, the same pattern as
`PaymentGatewayReads`: the service's rules can be exercised with a stub, and
nothing reachable over HTTP can supply one.

## Configuration

| Variable                | Default                                | Purpose                                                                                                                                                                          |
| ----------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TRY_ON_ENABLED`        | `true`                                 | `false` hides try-on everywhere                                                                                                                                                  |
| `TRY_ON_PROVIDER`       | `gemini`                               | `cloudflare` for the free Workers AI path                                                                                                                                        |
| `TRY_ON_MODEL`          | the provider's default                 | Gemini: `gemini-3.1-flash-lite-image` is cheaper, `gemini-3-pro-image` better. Cloudflare: `@cf/black-forest-labs/flux-2-klein-9b` is better and uses ~10× more of the allowance |
| `CLOUDFLARE_ACCOUNT_ID` | none                                   | The Workers AI account (32 hex characters)                                                                                                                                       |
| `CLOUDFLARE_API_TOKEN`  | none                                   | A Workers AI token; never sent to the browser, registered with the log redactor                                                                                                  |
| `TRY_ON_API_KEY`        | `AI_API_KEY` when `AI_PROVIDER=gemini` | A Gemini key; never sent to the browser, registered with the log redactor                                                                                                        |
| `TRY_ON_DAILY_LIMIT`    | `10`                                   | Tries per account per day                                                                                                                                                        |
| `TRY_ON_TIMEOUT_MS`     | `90000`                                | One generation's ceiling                                                                                                                                                         |

Readiness reports the state (`Try-on: configured (gemini-3.1-flash-image)`) and
warns a production store that has it enabled with no Gemini key.

A `TRY_ON_MODEL` that belongs to the other provider — a Gemini name with
`TRY_ON_PROVIDER=cloudflare`, or an `@cf/…` name with `gemini` — stops startup,
because it would otherwise fail every try at the moment a customer pressed the
button.

### Running it for free (Cloudflare)

1. Create a free Cloudflare account — no card is needed.
2. Dashboard → **AI** → **Workers AI** → **Use REST API**: copy the **Account
   ID**, and **Create a Workers AI API Token**.
3. In `backend/.env`: `TRY_ON_PROVIDER=cloudflare`, `CLOUDFLARE_ACCOUNT_ID`,
   `CLOUDFLARE_API_TOKEN`, and remove any Gemini `TRY_ON_MODEL`. Restart.

The Free plan's 10,000 neurons a day are shared by the whole store; a preview
costs roughly 90–115 at 768×1024 (two 512-px input tiles and three or four
output tiles), so 80 or more a day. When they run out Cloudflare refuses
further requests — it never bills the Free plan — and try-on pauses itself
until 00:00 UTC (05:30 IST).

Photos go to Workers AI at 512 px at most (its limit for reference images), so
a face in a full-length photo carries less detail than with Gemini. Waist-up
photos work best.

### Running it on Gemini

**The key must be on a paid (billing-enabled) Google AI project.** No Gemini
image model has a free tier: a free-tier key gets `limit: 0` for every one of
them, so switching `TRY_ON_MODEL` does not help — see
[When the provider says no](#when-the-provider-says-no). Paid-tier content is
also not used to improve Google's products; free-tier content is.

### Deploying on Vercel

- A generation takes 10–20 seconds. Make sure the backend function's maximum
  duration allows at least 60 seconds.
- Vercel caps request and response bodies at 4.5 MB. The device-side resize
  keeps uploads well under it, and the model's default 1K output keeps the
  `data:` URL under it; do not raise the output size without checking.

## Testing

- `backend/tests/try-on.test.ts` — 38 tests: key resolution (never handing
  Google another vendor's key), redaction, readiness, placement for every
  kind of product including the "cap-toe" and "earring/string" edge cases, the
  prompt's identity-preservation and colourway clauses, reading answers
  (final image, skipped thoughts, block reasons, safety stops, empty, non-image
  attachments), the IST day boundary, `limit: 0` versus a spent allowance (429
  and 403 forms, Google's body never echoed), and the pause — status hidden,
  tries refused before the photo is read or the model called, never paused for
  a timeout or a busy provider, the operator's log line.
- `backend/tests/try-on-cloudflare.test.ts` — 30 tests: provider choice and
  its credentials (never the Gemini key), the model/provider mismatch that
  stops startup, the token's redaction, the readiness finding, the processor
  the consent box names, the FLUX.2 description, photos fitted inside 512×512
  as JPEG and never enlarged, the preview's size, reading base64, data-URL and
  raw-bytes answers, every Cloudflare error code, the exact multipart request
  (URL, token, fields, image sizes), network failures and timeouts, and the
  pause until midnight UTC — including a reset time that is past or too far
  away.
- Verified against a real replica set with a stubbed model: eligibility,
  unknown product, non-image and empty photos, unknown colour — none spending a
  try; success; refusal, empty, timeout and rejected-key failures each giving
  the try back; the fourth try refused at a limit of three without reaching the
  model; and the six-way concurrency race above.
- HTTP guards: no session (401), no consent (400), markup posing as PNG (415),
  wrong content type (400), ineligible category (409), 7 MB body (413), burst
  limit (429), spent allowance (429), and the category switch reaching the
  product page.

## Known limitations

- It is a rendering, not a fit prediction: it cannot tell a customer whether a
  medium fits them.
- A product photographed on a busy background, or a flat-lay with several items,
  can confuse the model about which object is being sold.
- Google's safety filters may decline some photos; the customer is told what
  kind of photo to try instead, and the try is not counted.
- Per-colour product photos do not exist in the catalogue, so a colourway other
  than the photographed one is described to the model in words and a hex value.
