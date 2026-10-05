import type { AiChatResult } from '../ai.service';
import type { AiStopReason, AiUsage } from '../provider';

/**
 * The vocabulary of the evaluation harness.
 *
 * A case is a conversation a real customer could have, plus what a correct
 * assistant must and must not do in it. A transcript is what actually happened
 * — every model call, every tool call and its result, the reply and the cards.
 * A scorer compares the two. Nothing here calls a model; that is the runner's
 * job, and keeping it out means the scoring rules can be unit-tested against
 * hand-written transcripts.
 */

export type EvalCategory =
  | 'search'
  | 'budget'
  | 'filters'
  | 'no_match'
  | 'product_facts'
  | 'compare'
  | 'follow_up'
  | 'cart'
  | 'clarify'
  | 'policy'
  | 'safety';

/** A rule on the product cards the final turn put on the page. */
export interface CardExpectation {
  min?: number;
  max?: number;
  /** Every card is in one of these category slugs. */
  categories?: string[];
  /** Every card is from one of these brand slugs. */
  brands?: string[];
  /** Every card is priced at or under this, in rupees. */
  maxPrice?: number;
  /** Every card is priced at or over this, in rupees. */
  minPrice?: number;
  /** Every one of these slugs is among the cards. */
  includes?: string[];
  /** The first card is this slug — for "cheapest", "best rated". */
  first?: string;
  /** No card is sold out. */
  inStockOnly?: boolean;
}

export interface ReplyExpectation {
  /** Each pattern must match somewhere in the reply. */
  mustMatch?: RegExp[];
  /** No pattern may match anywhere in the reply. */
  mustNotMatch?: RegExp[];
  /** The reply asks the customer something rather than guessing. */
  asksQuestion?: boolean;
}

export interface CartExpectation {
  /** Successful cart additions in the final turn. */
  added: number;
  /** When added > 0: the product that went in, by slug fragment. */
  productSlug?: string;
  quantity?: number;
}

/**
 * A rule no declarative field can express, such as "searched with a rating
 * floor *or* sorted by rating". Returns true for a pass, or a string saying
 * what was wrong. `history` is every turn of the case, final one included, for
 * a follow-up that has to be checked against what an earlier turn showed.
 */
export interface CustomCheck {
  id: string;
  test: (turn: TurnTranscript, history: TurnTranscript[]) => true | string;
}

export interface EvalCase {
  /** Stable, kebab-case, unique. Reports and baselines key on it. */
  id: string;
  category: EvalCategory;
  /** One line a reviewer reads to know why the case exists. */
  description: string;
  /** What the customer types, one entry per turn. The last turn is scored. */
  turns: string[];
  /** Signed in. Guests are never offered the cart tools. */
  authenticated?: boolean;
  expect: {
    tools?: { required?: string[]; forbidden?: string[] };
    cards?: CardExpectation;
    reply?: ReplyExpectation;
    cart?: CartExpectation;
    comparison?: boolean;
    custom?: CustomCheck[];
  };
}

/** One tool the model asked for, and what ZyCart answered. */
export interface ToolExchange {
  name: string;
  input: unknown;
  /** The JSON string the model was handed. */
  content: string;
  isError: boolean;
}

/** One provider round trip, as the recorder saw it. */
export interface ModelCall {
  latencyMs: number;
  stopReason: AiStopReason;
  toolCallCount: number;
  usage?: AiUsage;
}

/** One customer message and everything it caused. */
export interface TurnTranscript {
  userText: string;
  result: AiChatResult;
  tools: ToolExchange[];
  calls: ModelCall[];
  latencyMs: number;
}

export interface CheckResult {
  id: string;
  passed: boolean;
  detail?: string;
}

export type CaseStatus = 'pass' | 'fail' | 'error';

export interface CaseResult {
  id: string;
  category: EvalCategory;
  description: string;
  status: CaseStatus;
  checks: CheckResult[];
  /** Set when status is `error`: the run broke, so nothing was scored. */
  error?: string;
  attempts: number;
  /** Final turn, so a failure can be read without re-running it. */
  reply: string;
  cardSlugs: string[];
  toolsCalled: string[];
  /** Across every turn of the case. */
  latencyMs: number;
  modelCalls: number;
  toolCalls: number;
  inputTokens: number | null;
  outputTokens: number | null;
}
