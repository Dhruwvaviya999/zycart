/**
 * Everything that must never reach a log line, removed before it can.
 *
 * ## The premise
 *
 * A redaction policy that depends on every developer remembering it has
 * already failed; it just has not been noticed yet. The one line that logs a
 * whole request object, the one `catch` that logs a provider's error verbatim
 * with the connection URL inside it, the one debugging statement that survives
 * review — that is how credentials end up in a log aggregator that a wider
 * group can read than could ever read `.env`.
 *
 * So redaction here is **structural**, not advisory. Everything handed to the
 * logger passes through `sanitize`, and there is no route around it.
 *
 * ## Three independent layers
 *
 * 1. **Key names.** A field called `password`, `authorization`, `cookie`,
 *    `signature`, `apiKey` — whatever its value — becomes `[redacted]`. This
 *    catches generic serialisation of objects nobody inspected.
 *
 * 2. **Known values.** The process registers its own secrets at startup
 *    (`registerSecrets`), and any string containing one has it replaced,
 *    wherever it appears and whatever the field is called. This is the layer
 *    that catches a Mongo driver error carrying the connection string, or a
 *    nodemailer error quoting the SMTP password back — cases where the key name
 *    is innocent and the value is not.
 *
 * 3. **Shape.** Email addresses are masked and long digit runs are reduced, so
 *    a customer's address or phone number does not become routine log content
 *    just because it happened to be in an error message.
 *
 * Layers 1 and 2 are security controls. Layer 3 is a privacy control, and is
 * explicitly best-effort: the real policy is "do not log PII in the first
 * place", and layer 3 is the net under it.
 *
 * ## What redaction is not
 *
 * It is not a reason to log something sensitive. `[redacted]` in a log line
 * says a field existed, which is occasionally useful and never the goal. Fields
 * chosen deliberately — `userId`, `orderNumber`, `notificationId` — are how
 * this codebase stays diagnosable; see `docs/phase-16.md`.
 */

/** What a redacted value is replaced with. One token, so it greps cleanly. */
export const REDACTED = '[redacted]';

/**
 * Field names whose values never appear in a log, at any level, in any format.
 *
 * Matched case-insensitively against the key with separators removed, so
 * `SMTP_PASSWORD`, `smtpPassword` and `smtp-password` are one rule rather than
 * three. Substring matching is deliberate: `secret` covers
 * `razorpayKeySecret` and `RAZORPAY_WEBHOOK_SECRET` without either having to be
 * listed, and a future `razorpayApiToken` is covered by `token` the day it is
 * written.
 *
 * ## Fragments chosen to be narrow
 *
 * Each entry is a substring that cannot plausibly appear in a field this
 * codebase would want to read in a log, and two near-misses are instructive:
 *
 *  - `auth` is **not** here, because it would swallow `author`. `authorization`
 *    is, because it cannot.
 *  - `razorpay` is **not** here, because it would swallow `razorpayOrderId` and
 *    `razorpayPaymentId` — which are not secrets at all. The order id is sent
 *    to the browser to open Checkout and the payment id comes back from it, so
 *    both are already known to the customer, and both are the fields that make
 *    a payment traceable from a log line to the gateway's dashboard. Redacting
 *    them would have cost the single most useful correlation ZyCart has while
 *    protecting nothing.
 *
 * Over-redaction is not the safe default. It is a different failure: logs that
 * say `[redacted]` where a diagnosis needed an id, which sends the next
 * responder to the database to reconstruct what the log should have told them.
 */
const SECRET_KEY_FRAGMENTS: readonly string[] = [
  'password',
  'passwd',
  'secret',
  'token',
  'authorization',
  'credential',
  'apikey',
  'privatekey',
  'accesskey',
  'signature',
  'cookie',
  'jwt',
  'bearer',
  'smtp',
  'mongodburi',
  'connectionstring',
  'otp',
];

/**
 * Field names that may carry an address, and are masked when they do.
 *
 * Masked rather than removed, because "there was a recipient and it ended
 * `@gmail.com`" is occasionally the difference between diagnosing a bounce and
 * not, while the full address is not.
 *
 * A value under one of these that is *not* an address passes through normal
 * scrubbing. `email` is the field ZyCart uses for the provider name, and
 * `email: "mock"` — the single most important line in the startup banner, the
 * one that says nothing is being delivered — must not come out as
 * `[redacted]`. Over-redaction is a failure mode too.
 */
const MASKED_KEY_FRAGMENTS: readonly string[] = ['email', 'recipient'];

/**
 * Field names removed outright, whatever they hold.
 *
 * Unlike an address, none of these has a partial form worth keeping. Half a
 * postcode is not a diagnostic, and a phone number cannot be usefully
 * abbreviated without still being a phone number. `shippingAddress` is an
 * object, and walking it would put a customer's street into a log line one
 * field at a time.
 */
const PERSONAL_KEY_FRAGMENTS: readonly string[] = [
  'phone',
  'mobile',
  'address',
  'postcode',
  'pincode',
];

/** Mirrors `ACCEPTABLE_REQUEST_ID` in `middleware/requestContext.ts`. */
const VERBATIM_REQUEST_ID = /^[A-Za-z0-9_.:-]{8,64}$/;

/** `SMTP_PASSWORD` → `smtppassword`, so one rule covers every spelling. */
const normaliseKey = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, '');

export function isSecretKey(key: string): boolean {
  const normalised = normaliseKey(key);
  return SECRET_KEY_FRAGMENTS.some((fragment) => normalised.includes(fragment));
}

/** A field whose value is masked when it looks like an address. */
export function isMaskedKey(key: string): boolean {
  const normalised = normaliseKey(key);
  return MASKED_KEY_FRAGMENTS.some((fragment) => normalised.includes(fragment));
}

/** A field removed outright. Checked after `isMaskedKey`, so `emailAddress` masks. */
export function isPersonalKey(key: string): boolean {
  const normalised = normaliseKey(key);
  return PERSONAL_KEY_FRAGMENTS.some((fragment) => normalised.includes(fragment));
}

/* ------------------------------------------------------------------ */
/* Layer 2 — the values this process knows are secret                  */
/* ------------------------------------------------------------------ */

/**
 * Registered at startup from validated configuration.
 *
 * Held as a module-level set rather than threaded through every call, because
 * the alternative is a logger that takes a configuration argument at every call
 * site — and the one call site that forgets is the one that leaks.
 *
 * Short values are refused. A secret of six characters scanned for in every
 * logged string would redact ordinary words and make logs unreadable, so the
 * floor is eight; nothing ZyCart treats as a credential is shorter than that,
 * and `loadEnv` already enforces far longer minimums on the ones that matter.
 */
const registered = new Set<string>();

/** The shortest value worth scanning for. See above. */
const MIN_SECRET_LENGTH = 8;

/**
 * Teaches the redactor this process's own secrets.
 *
 * Additive and idempotent, so a test that registers a synthetic secret does not
 * have to unwind global state — and so `configureLogger` can be called more
 * than once without losing what an earlier call knew.
 */
export function registerSecrets(values: readonly (string | undefined | null)[]): void {
  for (const value of values) {
    if (typeof value === 'string' && value.length >= MIN_SECRET_LENGTH) {
      registered.add(value);
    }
  }
}

/** Test-only escape hatch. Production code never needs to forget a secret. */
export function clearRegisteredSecrets(): void {
  registered.clear();
}

export function registeredSecretCount(): number {
  return registered.size;
}

/* ------------------------------------------------------------------ */
/* String scrubbing                                                     */
/* ------------------------------------------------------------------ */

/**
 * Control characters, and the two Unicode separators JSON.stringify leaves
 * alone.
 *
 * A newline inside a logged string is how one log record becomes two, the
 * second of them forged by whoever supplied the string — and ZyCart logs
 * plenty of strings a stranger chose, starting with the search query. JSON
 * escapes `\n` on its own, so the JSON writer is already safe; this exists so
 * the *text* formatter is safe too, and so a line stays a line no matter which
 * format a deployment picks.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]+/g;

/** Deliberately permissive: over-matching here costs a masked string, nothing more. */
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Runs of ten to fifteen digits, not touching another digit.
 *
 * A phone number, in every format ZyCart accepts. Amounts and timestamps are
 * logged as numbers rather than strings and so never reach this; an identifier
 * that is all digits and this long does not exist in the schema — order numbers
 * carry a `ZYC-` prefix, Razorpay ids a `pay_`/`rfnd_` one, Mongo ids are hex.
 */
const LONG_DIGIT_RUN = /(?<!\d)\d{10,15}(?!\d)/g;

/**
 * How long one logged string may be.
 *
 * Bounds the damage a hostile input can do to a log file, and bounds the cost
 * of the scans above. Generous enough for any message this codebase writes; a
 * value longer than this is a payload somebody logged by accident.
 */
const MAX_STRING_LENGTH = 512;

/**
 * `dhruw@example.com` → `d***@example.com`.
 *
 * The domain survives because it is the diagnostic half — "every failure is to
 * one provider" is a finding; which mailbox it was is not. The local part is
 * reduced to one character, which is enough to tell two addresses apart in a
 * single incident and not enough to address a person.
 */
export function maskEmail(value: string): string {
  const at = value.lastIndexOf('@');
  if (at <= 0 || at === value.length - 1) return REDACTED;

  const local = value.slice(0, at);
  const domain = value.slice(at + 1);

  return `${local.slice(0, 1)}***@${domain}`;
}

/**
 * One string, made safe to write.
 *
 * Order matters and is not arbitrary. Secrets go first, because truncating a
 * credential in half still publishes half of it. Control characters go next, so
 * nothing downstream can be tricked by what the scans leave behind. Personal
 * data is masked after that, and truncation is last so the limit applies to
 * what is actually written.
 */
export function scrubString(value: string): string {
  let out = value;

  for (const secret of registered) {
    if (out.includes(secret)) out = out.split(secret).join(REDACTED);
  }

  out = out.replace(CONTROL_CHARACTERS, ' ');
  out = out.replace(EMAIL_PATTERN, maskEmail);
  out = out.replace(LONG_DIGIT_RUN, (digits) => `***${digits.slice(-2)}`);

  return out.length > MAX_STRING_LENGTH
    ? `${out.slice(0, MAX_STRING_LENGTH)}…[truncated]`
    : out;
}

/* ------------------------------------------------------------------ */
/* Structural sanitisation                                              */
/* ------------------------------------------------------------------ */

/**
 * How deep, how wide, and how many keys.
 *
 * A log record is a fixed set of facts, not a document store. These bounds are
 * what stops `logger.info('…', { order })` — which nothing should write, and
 * which somebody eventually will — from putting a customer's whole basket,
 * address and payment record into a log file. It gets `[…]` and `[object]`
 * instead, which is both harmless and an obvious prompt to log fields.
 */
const MAX_DEPTH = 3;
const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_KEYS = 30;

/** A JSON-safe value. Everything reaching the writer has been reduced to this. */
export type SafeValue =
  | string
  | number
  | boolean
  | null
  | SafeValue[]
  | { [key: string]: SafeValue };

const isPlainRecord = (value: object): value is Record<string, unknown> =>
  Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null;

/**
 * Mongoose ids, and anything else that names itself in hex.
 *
 * Checked by capability rather than `instanceof ObjectId`, so this module needs
 * no dependency on Mongoose and keeps working for any id type that follows the
 * same convention.
 */
function hexId(value: object): string | null {
  const candidate = value as { toHexString?: unknown };
  if (typeof candidate.toHexString !== 'function') return null;

  const hex: unknown = (candidate.toHexString as () => unknown)();
  return typeof hex === 'string' ? hex : null;
}

/**
 * One value, reduced to something safe, bounded and JSON-representable.
 *
 * `seen` breaks cycles: a Mongoose document graph is full of them, and a
 * logger that can be made to recurse forever is a logger that can take the
 * process down.
 */
export function sanitize(value: unknown, depth = 0, seen: Set<object> = new Set()): SafeValue {
  if (value === null || value === undefined) return null;

  switch (typeof value) {
    case 'string':
      return scrubString(value);
    case 'number':
      // NaN and ±Infinity are not JSON; they would be written as `null`
      // silently, so say what happened instead.
      return Number.isFinite(value) ? value : String(value);
    case 'boolean':
      return value;
    case 'bigint':
      return value.toString();
    case 'function':
    case 'symbol':
      return `[${typeof value}]`;
    default:
      break;
  }

  const object = value as object;

  if (object instanceof Date) {
    return Number.isNaN(object.getTime()) ? 'Invalid Date' : object.toISOString();
  }

  if (object instanceof Error) return scrubString(`${object.name}: ${object.message}`);

  if (Buffer.isBuffer(object)) return `[buffer ${String(object.byteLength)} bytes]`;

  const hex = hexId(object);
  if (hex !== null) return hex;

  if (seen.has(object)) return '[circular]';
  if (depth >= MAX_DEPTH) return Array.isArray(object) ? '[array]' : '[object]';

  seen.add(object);

  try {
    if (Array.isArray(object)) {
      const items = object
        .slice(0, MAX_ARRAY_ITEMS)
        .map((item) => sanitize(item, depth + 1, seen));

      if (object.length > MAX_ARRAY_ITEMS) {
        items.push(`…${String(object.length - MAX_ARRAY_ITEMS)} more`);
      }

      return items;
    }

    // A class instance, a Map, a Mongoose document — anything whose own shape
    // is not a plain bag of fields. Naming the constructor is useful; walking
    // its internals is how a whole ORM document ends up in a log line.
    if (!isPlainRecord(object)) {
      const name = object.constructor.name;
      return `[${name && name !== 'Object' ? name : 'object'}]`;
    }

    return sanitizeFields(object, depth, seen);
  } finally {
    seen.delete(object);
  }
}

/**
 * The fields of one object, with the key-name rules applied.
 *
 * Exported because a log record's top level is exactly this: a bag of fields
 * that must obey the same rules as anything nested inside it.
 */
export function sanitizeFields(
  fields: Record<string, unknown>,
  depth = 0,
  seen: Set<object> = new Set(),
): Record<string, SafeValue> {
  const out: Record<string, SafeValue> = {};
  let written = 0;

  for (const [key, raw] of Object.entries(fields)) {
    // An absent field is absent. Writing `"note": null` for every optional
    // field triples the size of a log line and says nothing.
    if (raw === undefined) continue;

    if (written >= MAX_OBJECT_KEYS) {
      out['…'] = 'truncated';
      break;
    }

    written += 1;

    if (isSecretKey(key)) {
      out[key] = REDACTED;
      continue;
    }

    /**
     * The correlation id, alone, is written exactly as it arrived.
     *
     * It has already been through `resolveRequestId`, which admits only
     * `[A-Za-z0-9_.:-]{8,64}` — no control characters, no unbounded length,
     * nothing a log parser reads as structure. Scrubbing it again would be
     * actively harmful: an id that happens to contain ten consecutive digits
     * would be rewritten by the phone-number rule, and the id in the log would
     * no longer match the one in the `X-Request-Id` header the caller was
     * given. A correlation id that does not correlate is worse than none.
     *
     * The pattern is re-checked rather than assumed, so a caller passing a
     * `requestId` from somewhere else falls back to ordinary scrubbing.
     */
    if (key === 'requestId' && typeof raw === 'string' && VERBATIM_REQUEST_ID.test(raw)) {
      out[key] = raw;
      continue;
    }

    if (isMaskedKey(key)) {
      out[key] =
        typeof raw === 'string'
          ? raw.includes('@')
            ? maskEmail(raw)
            : scrubString(raw)
          : sanitize(raw, depth + 1, seen);
      continue;
    }

    if (isPersonalKey(key)) {
      out[key] = REDACTED;
      continue;
    }

    out[key] = sanitize(raw, depth + 1, seen);
  }

  return out;
}
