import { aiConfig } from './ai';
import { razorpayConfig, type Env } from './env';
import { emailConfig } from './notifications';

/**
 * Is this configuration fit for the environment it claims to be?
 *
 * ## Why this is separate from `loadEnv`
 *
 * `loadEnv` answers "is this configuration coherent?" — three Razorpay
 * variables or none, SMTP credentials whenever SMTP is selected, a secret long
 * enough to be a secret. Those are contradictions, and a process must not boot
 * with one.
 *
 * This answers a different question: "is this configuration *appropriate*?" A
 * production deployment running the mock mail provider is perfectly coherent.
 * Every environment variable is valid. It will also silently fail to tell a
 * single customer that their order shipped, and nobody will find out until
 * somebody asks why.
 *
 * Those cannot be the same check, because the answer depends on where the
 * process is running, and because the consequences differ: a contradiction
 * stops a boot, an inappropriate-but-valid setting should stop a *deploy*
 * while still letting a developer work.
 *
 * ## Where it is used
 *
 * Three places, all of which need the same verdict:
 *
 *  - `pnpm smoke:deploy`, as its first stage — before anything is built, so a
 *    deployment that cannot possibly work fails in two seconds rather than
 *    after two builds.
 *  - server startup, as a warning banner, so a running process says what it is
 *    missing rather than leaving it to be discovered.
 *  - `pnpm smoke:deploy --dry-run`, which is this check and nothing else.
 *
 * ## What it never prints
 *
 * A value. Not one, in any severity, in any message. Every finding names a
 * variable and describes a state; `summary` reports words like `configured`
 * and `mock`. A readiness report is something an operator pastes into a ticket,
 * and a readiness report that could contain `SMTP_PASSWORD=…` is one that
 * eventually will.
 */

export type ReadinessSeverity = 'error' | 'warning';

export interface ReadinessFinding {
  /** The variable or subsystem at fault. Never its value. */
  key: string;
  severity: ReadinessSeverity;
  /** One sentence, and what to do about it. */
  message: string;
}

export interface ReadinessReport {
  environment: Env['NODE_ENV'];
  /** False when any finding is an error. Warnings do not make a deploy unfit. */
  ok: boolean;
  findings: ReadinessFinding[];
  /** Safe states, for printing. `Email: mock`, never `SMTP_HOST: …`. */
  summary: Record<string, string>;
}

/** A hostname nothing outside this machine can resolve to this machine. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Evaluates one configuration. Pure — no I/O, no clock, no network.
 *
 * Which is what makes it usable as the smoke command's first stage: it costs
 * nothing, it cannot hang, and it can be tested exhaustively without a database
 * or a mail server.
 */
export function checkReadiness(env: Env): ReadinessReport {
  const findings: ReadinessFinding[] = [];
  const production = env.NODE_ENV === 'production';

  const email = emailConfig(env);
  const razorpay = razorpayConfig(env);
  const ai = aiConfig(env);
  const clientHost = hostOf(env.CLIENT_URL);

  /* Mail ----------------------------------------------------------- */

  /**
   * An error, not a warning.
   *
   * The mock provider is not "email turned off". It records a delivery, marks
   * it SENT and delivers nothing — so a production store running it reports a
   * perfectly healthy communication subsystem while every shipped order goes
   * unannounced. There is no state in the admin console that would reveal it.
   */
  if (production && email.provider === 'mock') {
    findings.push({
      key: 'EMAIL_PROVIDER',
      severity: 'error',
      message:
        'is "mock" in production — deliveries would be recorded as sent and nothing would reach a ' +
        'customer. Set EMAIL_PROVIDER=smtp and configure the SMTP variables.',
    });
  }

  /* Storefront origin ---------------------------------------------- */

  if (production && clientHost !== null && LOCAL_HOSTS.has(clientHost)) {
    findings.push({
      key: 'CLIENT_URL',
      severity: 'error',
      message:
        'points at this machine in production — CORS would refuse the real storefront, and every ' +
        'link in a transactional email would be unreachable by the customer who received it.',
    });
  }

  /**
   * Plain HTTP in production is not a preference.
   *
   * The session cookie travels on it, and so does everything the session
   * protects. It is a warning rather than an error only because a deployment
   * may legitimately terminate TLS at a proxy and address this origin
   * internally — but that is rare enough to be worth saying out loud.
   */
  if (production && env.CLIENT_URL.startsWith('http://')) {
    findings.push({
      key: 'CLIENT_URL',
      severity: 'warning',
      message:
        'is an http:// origin in production. Unless TLS terminates at a proxy in front of this ' +
        'service, session cookies would cross the network in the clear.',
    });
  }

  /* Payments -------------------------------------------------------- */

  /**
   * A warning, because cash on delivery only is a real business, and this
   * codebase supports it deliberately — checkout hides the online option and
   * says why. It is reported because a deployment that *meant* to take cards
   * and shipped without credentials would otherwise find out from a customer.
   */
  if (production && !razorpay) {
    findings.push({
      key: 'RAZORPAY_KEY_ID',
      severity: 'warning',
      message:
        'is not set, so this deployment offers cash on delivery only. Intended for a ' +
        'cash-only store; a mistake for any other.',
    });
  }

  /* Assistant -------------------------------------------------------- */

  if (production && env.AI_ENABLED && !ai) {
    findings.push({
      key: 'AI_API_KEY',
      severity: 'warning',
      message:
        'is missing while AI_ENABLED=true, so the assistant will answer every request with its ' +
        'unavailable message. Set the key, or set AI_ENABLED=false so the entry points are hidden.',
    });
  }

  /* Logging ---------------------------------------------------------- */

  if (production && env.LOG_FORMAT === 'text') {
    findings.push({
      key: 'LOG_FORMAT',
      severity: 'warning',
      message:
        'is "text" in production. The fields are identical, but the lines are not machine-readable ' +
        'and nothing downstream will be able to parse them.',
    });
  }

  return {
    environment: env.NODE_ENV,
    ok: !findings.some((finding) => finding.severity === 'error'),
    findings,
    summary: {
      Environment: env.NODE_ENV,
      Database: 'configured',
      Authentication: 'configured',
      Storefront: clientHost === null ? 'invalid' : clientHost,
      Email: email.provider === 'smtp' ? 'configured' : 'mock',
      Payments: razorpay
        ? razorpay.keyId.startsWith('rzp_live_')
          ? 'configured (live)'
          : 'configured (test)'
        : 'not configured',
      Assistant: env.AI_ENABLED ? (ai ? `configured (${ai.provider})` : 'not configured') : 'disabled',
      Logging: `${env.LOG_LEVEL} · ${env.LOG_FORMAT ?? 'default for environment'}`,
    },
  };
}

/**
 * The report as an operator reads it: a block of safe states, then the
 * findings, worst first.
 */
export function formatReadiness(report: ReadinessReport): string {
  const width = Math.max(...Object.keys(report.summary).map((key) => key.length));

  const lines = Object.entries(report.summary).map(
    ([key, value]) => `  ${key.padEnd(width)}  ${value}`,
  );

  const errors = report.findings.filter((finding) => finding.severity === 'error');
  const warnings = report.findings.filter((finding) => finding.severity === 'warning');

  for (const finding of [...errors, ...warnings]) {
    lines.push('');
    lines.push(`  ${finding.severity === 'error' ? 'ERROR  ' : 'WARNING'} ${finding.key}`);
    lines.push(`          ${finding.message}`);
  }

  return lines.join('\n');
}
