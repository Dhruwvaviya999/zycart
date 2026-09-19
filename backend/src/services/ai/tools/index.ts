import type { AiToolDefinition } from '../provider';
import { addToCartTool } from './add-to-cart.tool';
import { compareProductsTool } from './compare-products.tool';
import { getCartTool } from './get-cart.tool';
import { getProductTool } from './get-product.tool';
import { searchProductsTool } from './search-products.tool';
import { ToolError, type AiTool, type ToolContext } from './types';

export type { AiTool, ToolContext } from './types';
export { ToolError } from './types';

/**
 * Every tool ZyCart's assistant has. The list is closed.
 *
 * There is no tool here that runs a database query, evaluates an expression,
 * reads a file or reaches the network, and no mechanism by which the model
 * could acquire one: a name that is not in this array is not executable, and a
 * tool that is in it still has to pass its permission check and its schema.
 * The model's reach is exactly this, and changing it means changing this file.
 *
 * Also absent on purpose: anything that would let the assistant check out, pay,
 * place, cancel or refund an order, or read a customer's profile, addresses or
 * order history. Buying is the customer's decision to make, and Phase 10's
 * assistant has no business knowing who they are beyond which cart is theirs.
 */
const REGISTRY: readonly AiTool[] = [
  searchProductsTool,
  getProductTool,
  compareProductsTool,
  getCartTool,
  addToCartTool,
];

/**
 * The tools offered on this request.
 *
 * A guest is not merely refused the cart tools — they are never told the tools
 * exist. Advertising a capability that will be denied invites the assistant to
 * promise it first and fail second.
 */
export function toolsFor(authenticated: boolean): AiTool[] {
  return REGISTRY.filter((tool) => authenticated || !tool.requiresAuth);
}

export function toolDefinitions(tools: AiTool[]): AiToolDefinition[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    schema: tool.schema,
  }));
}

export interface ToolOutcome {
  /** The JSON handed back to the model as this call's result. */
  payload: unknown;
  isError: boolean;
}

/**
 * Runs one tool call the model asked for — after deciding whether it may.
 *
 * Four questions in order, all of them answered here rather than in the prompt:
 * does the tool exist, is it permitted for this session, do its arguments
 * validate, and only then, what does it return. A model that asks for a tool
 * that was never offered, or one it is not signed in for, gets an error result
 * and the conversation continues; nothing runs.
 */
export async function executeTool(
  name: string,
  input: unknown,
  context: ToolContext,
  available: AiTool[],
): Promise<ToolOutcome> {
  const tool = available.find((candidate) => candidate.name === name);

  if (!tool) {
    return {
      payload: { error: `There is no tool called "${name}". Use only the tools provided.` },
      isError: true,
    };
  }

  if (tool.requiresAuth && !context.userId) {
    return {
      payload: {
        error:
          'That needs the customer to be signed in. Tell them they can sign in, and that they can still add items to the cart themselves from the product cards.',
      },
      isError: true,
    };
  }

  try {
    return { payload: await tool.run(input, context), isError: false };
  } catch (error) {
    // A business refusal — out of stock, size not offered, product not found —
    // is information the assistant should relay word for word.
    if (error instanceof ToolError) {
      return { payload: { error: error.message, ...error.details }, isError: true };
    }

    // A real fault. Logged in full on the way out of the service; the model is
    // told only that the tool failed, so nothing internal can be read back out
    // of the assistant's reply.
    throw error;
  }
}
