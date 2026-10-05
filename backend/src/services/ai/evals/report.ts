import type { CaseResult, EvalCategory } from './types';

/**
 * Turns a run's case results into the numbers worth acting on, and writes them
 * down as JSON (for machines and baselines) and Markdown (for people).
 *
 * The pass rate is computed over *scored* cases only. A case that errored —
 * the provider throttled it three times running — says nothing about whether
 * the assistant is right, so counting it as a failure would let an outage pose
 * as a regression. Errors are reported beside the rate, never folded into it.
 */

export interface Rate {
  passed: number;
  total: number;
  rate: number;
}

/** USD per million tokens, as supplied by whoever runs the harness. */
export interface TokenPrices {
  inputPerMillion: number;
  outputPerMillion: number;
}

export interface EvalReport {
  version: 1;
  provider: string;
  startedAt: string;
  durationMs: number;
  totals: { cases: number; passed: number; failed: number; errored: number; passRate: number };
  /** Of the scored cases, the share that quoted a price no tool returned. */
  hallucinatedPriceRate: number;
  checks: Record<string, Rate>;
  categories: Partial<Record<EvalCategory, Rate>>;
  latencyMs: { p50: number; p95: number; max: number };
  perCase: {
    modelCalls: number;
    toolCalls: number;
    inputTokens: number | null;
    outputTokens: number | null;
  };
  /** Present only when prices were supplied: estimates are not invented here. */
  costUsdPer1kConversations: number | null;
  results: CaseResult[];
}

const ratio = (passed: number, total: number): Rate => ({
  passed,
  total,
  rate: total === 0 ? 0 : passed / total,
});

/** Nearest-rank percentile: a value that actually occurred, not an interpolation. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1] ?? 0;
}

const mean = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

export function buildReport(input: {
  provider: string;
  startedAt: Date;
  durationMs: number;
  results: CaseResult[];
  prices?: TokenPrices;
}): EvalReport {
  const { results } = input;
  const scored = results.filter((result) => result.status !== 'error');
  const passed = scored.filter((result) => result.status === 'pass').length;

  const checks: Record<string, Rate> = {};
  for (const result of scored) {
    for (const check of result.checks) {
      const entry = (checks[check.id] ??= { passed: 0, total: 0, rate: 0 });
      entry.total += 1;
      if (check.passed) entry.passed += 1;
    }
  }
  for (const entry of Object.values(checks)) entry.rate = entry.passed / entry.total;

  const categories: Partial<Record<EvalCategory, Rate>> = {};
  for (const category of new Set(scored.map((result) => result.category))) {
    const inCategory = scored.filter((result) => result.category === category);
    categories[category] = ratio(
      inCategory.filter((result) => result.status === 'pass').length,
      inCategory.length,
    );
  }

  const latencies = scored.map((result) => result.latencyMs);
  const tokenKnown = scored.filter(
    (result) => result.inputTokens !== null && result.outputTokens !== null,
  );
  const inputTokens =
    tokenKnown.length > 0 ? mean(tokenKnown.map((r) => r.inputTokens ?? 0)) : null;
  const outputTokens =
    tokenKnown.length > 0 ? mean(tokenKnown.map((r) => r.outputTokens ?? 0)) : null;

  const hallucinated = scored.filter((result) =>
    result.checks.some((check) => check.id === 'grounded_prices' && !check.passed),
  ).length;

  return {
    version: 1,
    provider: input.provider,
    startedAt: input.startedAt.toISOString(),
    durationMs: Math.round(input.durationMs),
    totals: {
      cases: results.length,
      passed,
      failed: scored.length - passed,
      errored: results.length - scored.length,
      passRate: scored.length === 0 ? 0 : passed / scored.length,
    },
    hallucinatedPriceRate: scored.length === 0 ? 0 : hallucinated / scored.length,
    checks,
    categories,
    latencyMs: {
      p50: Math.round(percentile(latencies, 50)),
      p95: Math.round(percentile(latencies, 95)),
      max: Math.round(Math.max(0, ...latencies)),
    },
    perCase: {
      modelCalls: mean(scored.map((result) => result.modelCalls)),
      toolCalls: mean(scored.map((result) => result.toolCalls)),
      inputTokens,
      outputTokens,
    },
    costUsdPer1kConversations:
      input.prices && inputTokens !== null && outputTokens !== null
        ? ((inputTokens * input.prices.inputPerMillion +
            outputTokens * input.prices.outputPerMillion) /
            1_000_000) *
          1_000
        : null,
    results,
  };
}

// ---------------------------------------------------------------------------
// Markdown

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;
const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;
const count = (value: number | null): string =>
  value === null ? 'n/a' : Math.round(value).toLocaleString('en-US');
const usd = (value: number | null): string => (value === null ? 'n/a' : `$${value.toFixed(2)}`);
const cell = (text: string): string => text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

/** What each check means, for a reader who has not opened `scorers.ts`. */
export const CHECK_DESCRIPTIONS: Record<string, string> = {
  answered: 'Produced an answer instead of giving up or failing',
  grounded_prices: 'Every ₹ amount in the reply came from a tool result',
  no_phantom_cart: 'Never claimed a cart change that did not happen',
  no_prompt_leak: 'Never quoted its instructions or tool names',
  valid_tool_calls: 'Every tool call had a real tool name and valid arguments',
  tools_required: 'Called the tools a correct answer needs',
  tools_forbidden: 'Did not call tools the request did not need',
  cards: 'Product cards matched the request (category, brand, price, stock)',
  reply_says: 'Reply contained what it must',
  reply_avoids: 'Reply avoided what it must never say',
  asks_question: 'Asked when it should ask, answered when it should answer',
  cart: 'Cart changes matched the request exactly',
  comparison: 'Built a comparison when, and only when, asked',
};

export function renderMarkdown(report: EvalReport): string {
  const lines: string[] = [];
  const { totals } = report;

  lines.push(`# ZyCart AI evaluation — ${report.provider}`, '');
  lines.push(
    `Run ${report.startedAt} · ${String(totals.cases)} cases · ${seconds(report.durationMs)} total`,
    '',
  );

  lines.push('| Metric | Value |', '| --- | --- |');
  lines.push(
    `| Pass rate | **${percent(totals.passRate)}** (${String(totals.passed)}/${String(totals.passed + totals.failed)}) |`,
  );
  lines.push(`| Hallucinated-price rate | ${percent(report.hallucinatedPriceRate)} |`);
  lines.push(`| Errored (not scored) | ${String(totals.errored)} |`);
  lines.push(
    `| Latency p50 / p95 | ${seconds(report.latencyMs.p50)} / ${seconds(report.latencyMs.p95)} |`,
  );
  lines.push(`| Model calls per conversation | ${report.perCase.modelCalls.toFixed(2)} |`);
  lines.push(`| Tool calls per conversation | ${report.perCase.toolCalls.toFixed(2)} |`);
  lines.push(
    `| Tokens per conversation (in / out) | ${count(report.perCase.inputTokens)} / ${count(report.perCase.outputTokens)} |`,
  );
  lines.push(`| Cost per 1,000 conversations | ${usd(report.costUsdPer1kConversations)} |`, '');

  lines.push('## By check', '', '| Check | What it means | Pass rate |', '| --- | --- | --- |');
  for (const [id, rate] of Object.entries(report.checks)) {
    lines.push(
      `| \`${id}\` | ${CHECK_DESCRIPTIONS[id] ?? ''} | ${percent(rate.rate)} (${String(rate.passed)}/${String(rate.total)}) |`,
    );
  }
  lines.push('');

  lines.push('## By category', '', '| Category | Pass rate |', '| --- | --- |');
  for (const [category, rate] of Object.entries(report.categories)) {
    lines.push(
      `| ${category} | ${percent(rate.rate)} (${String(rate.passed)}/${String(rate.total)}) |`,
    );
  }
  lines.push('');

  const failures = report.results.filter((result) => result.status !== 'pass');
  lines.push('## Failures and errors', '');

  if (failures.length === 0) {
    lines.push('None.', '');
  } else {
    lines.push('| Case | Check | Detail |', '| --- | --- | --- |');
    for (const result of failures) {
      if (result.status === 'error') {
        lines.push(`| \`${result.id}\` | error | ${cell(result.error ?? '')} |`);
        continue;
      }
      for (const check of result.checks.filter((candidate) => !candidate.passed)) {
        lines.push(`| \`${result.id}\` | \`${check.id}\` | ${cell(check.detail ?? '')} |`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** Several runs side by side — one per provider or model. */
export function renderComparison(reports: EvalReport[]): string {
  const lines: string[] = [
    '| Provider | Pass rate | Hallucinated prices | p50 | p95 | Model calls | Tokens in / out | Cost / 1k chats |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const report of [...reports].sort((a, b) => b.totals.passRate - a.totals.passRate)) {
    lines.push(
      `| ${report.provider} | **${percent(report.totals.passRate)}** | ${percent(report.hallucinatedPriceRate)} | ${seconds(report.latencyMs.p50)} | ${seconds(report.latencyMs.p95)} | ${report.perCase.modelCalls.toFixed(2)} | ${count(report.perCase.inputTokens)} / ${count(report.perCase.outputTokens)} | ${usd(report.costUsdPer1kConversations)} |`,
    );
  }

  return lines.join('\n');
}

/**
 * Cases that passed in the baseline and fail now.
 *
 * The pass rate alone hides a swap — one case fixed, another broken — and the
 * broken one is exactly what a reviewer needs to see.
 */
export function regressions(baseline: EvalReport, current: EvalReport): string[] {
  const before = new Map(baseline.results.map((result) => [result.id, result.status]));
  return current.results
    .filter((result) => result.status === 'fail' && before.get(result.id) === 'pass')
    .map((result) => result.id);
}
