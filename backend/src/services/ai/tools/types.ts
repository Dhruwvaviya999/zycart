import { z, ZodError, type ZodType } from 'zod';
import { AppError } from '../../../utils/AppError';
import type { AiToolSchema } from '../provider';
import type { PriceBounds } from '../search/budget';
import type { AiProductView } from './product-view';

/**
 * What a tool is allowed to know about the person it is acting for.
 *
 * `userId` is taken from the verified session and nothing else. There is
 * no field here a client could set, so no request can name whose cart it is
 * operating on — the same rule the cart controller has always enforced.
 */
export interface ToolContext {
  userId: string | null;
  /**
   * Products this request has actually put in front of the customer, in the
   * order they were shown. The response is assembled from this rather than from
   * anything the model wrote, which is what keeps a product card's price and
   * stock the database's numbers instead of the model's.
   */
  shown: Map<string, AiProductView>;
  /**
   * What this request's searches must respect. Absent outside a chat request —
   * a verification script calling a tool directly — where nothing is imposed.
   */
  search?: SearchGuard;
}

/**
 * The customer's own limits for one request, and what its searches have found.
 *
 * Kept in code rather than left to the prompt because each search's products
 * become cards on the page: a model that quietly retries without the budget,
 * or browses the whole catalogue after finding nothing, puts things in front
 * of the customer that they said they did not want.
 */
export interface SearchGuard {
  /** Price limits written in the message being answered. Every search is held to them. */
  budget: PriceBounds;
  /** Set once a search in this request has matched nothing. */
  foundNothing: boolean;
}

export interface AiTool {
  readonly name: string;
  readonly description: string;
  readonly schema: AiToolSchema;
  /**
   * Declared per tool rather than inferred from anything the client sends.
   * The registry checks it before a tool can run; the prompt is not consulted.
   */
  readonly requiresAuth: boolean;
  run(input: unknown, context: ToolContext): Promise<unknown>;
}

/**
 * A tool failure the assistant is meant to read and relay — "that size is sold
 * out", "only 2 left". Distinct from a crash: the tool worked, the answer is no.
 */
export class ToolError extends Error {
  constructor(
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ToolError';
  }
}

interface ToolDefinition<TInput> {
  name: string;
  description: string;
  requiresAuth: boolean;
  input: ZodType<TInput>;
  execute: (input: TInput, context: ToolContext) => Promise<unknown>;
}

/**
 * Wires a Zod schema to an executor and derives the model-facing JSON Schema
 * from the same object.
 *
 * One schema, two uses: the model is told the shape, and the arguments it sends
 * back are validated against that shape before anything runs. They cannot drift
 * apart, and a model that sends `quantity: 999999` or a `productId` of
 * `"../../etc/passwd"` is rejected here rather than reaching a service.
 */
export function defineTool<TInput>(definition: ToolDefinition<TInput>): AiTool {
  const generated = z.toJSONSchema(definition.input, { io: 'input' }) as Record<string, unknown>;
  // `$schema` is metadata for validators, not something the model needs.
  delete generated.$schema;

  const schema: AiToolSchema = {
    ...generated,
    type: 'object',
    properties: (generated.properties ?? {}) as Record<string, unknown>,
    additionalProperties: false,
  };

  return {
    name: definition.name,
    description: definition.description,
    requiresAuth: definition.requiresAuth,
    schema,

    async run(input: unknown, context: ToolContext): Promise<unknown> {
      const parsed = definition.input.safeParse(input);

      if (!parsed.success) {
        throw new ToolError(
          `Invalid arguments: ${parsed.error.issues
            .map((issue) => `${issue.path.join('.') || 'input'} ${issue.message}`)
            .join('; ')}`,
        );
      }

      try {
        return await definition.execute(parsed.data, context);
      } catch (error) {
        // A business refusal is an answer, so it is handed to the assistant to
        // relay. Anything else is a fault and is not described to a customer.
        if (error instanceof AppError && error.statusCode < 500) {
          throw new ToolError(error.message);
        }

        /**
         * A tool that re-parses its arguments through one of the storefront's
         * own schemas — as `search_products` does, to be held to exactly the
         * rules a shopper is — can fail that second parse on something the
         * tool's own schema could not express, such as a minimum price above
         * the maximum. That is the schema refusing a nonsensical request, not
         * a fault, so the assistant is told and asks again.
         */
        if (error instanceof ZodError) {
          throw new ToolError(
            error.issues
              .map((issue) => `${issue.path.join('.') || 'input'} ${issue.message}`)
              .join('; '),
          );
        }

        throw error;
      }
    },
  };
}
