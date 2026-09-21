import { z } from 'zod';
import { AI_LIMITS } from '../config/ai';
import { objectIdSchema } from './common';

/**
 * What the browser is allowed to say to the assistant.
 *
 * The important part of this file is what it refuses. `system`, `developer`
 * and `tool` are not in the role enum, so a client cannot inject instructions,
 * forge a tool result or impersonate the server — the system prompt is built in
 * `prompts.ts` on every request and nothing here can reach it. `.strict()`
 * turns an unexpected field into a 400 rather than something quietly ignored.
 *
 * The size limits are the first line of cost control. An LLM request is priced
 * by its input, so "how much conversation may one request carry" is a bill, not
 * just a payload.
 */

/**
 * Markers the server uses to frame server-supplied context inside a turn.
 *
 * Stripped from customer text so the only `<page_context>` or
 * `<products_shown>` block in a transcript is one the service wrote. Without
 * this a customer could type their own and claim to be looking at a product
 * they are not — harmless in itself, but it is the kind of seam that stops
 * being harmless the moment a later phase trusts one of these blocks with more.
 */
const SERVER_MARKERS = /<\/?(?:page_context|products_shown)>/gi;

const messageText = z
  .string()
  .trim()
  .min(1, 'cannot be empty')
  .max(
    AI_LIMITS.maxMessageLength,
    `must be at most ${String(AI_LIMITS.maxMessageLength)} characters`,
  )
  .transform((value) => value.replace(SERVER_MARKERS, '').trim())
  .refine((value) => value.length > 0, 'cannot be empty');

const clientMessageSchema = z
  .object({
    /**
     * Only the two roles a browser can honestly claim. Everything the model is
     * told beyond these — instructions, tool definitions, tool results — is
     * assembled server-side.
     */
    role: z.enum(['user', 'assistant']),
    content: messageText,
    /**
     * Ids of the products this assistant turn put on screen, so "the second
     * one" resolves on the next request. Ids only: the server re-reads the
     * products from MongoDB, so nothing about them travels through the browser.
     */
    productIds: z.array(objectIdSchema).max(AI_LIMITS.maxReferencedIds).optional(),
  })
  .strict();

export const aiChatSchema = z
  .object({
    messages: z
      .array(clientMessageSchema)
      .min(1, 'send at least one message')
      .max(AI_LIMITS.maxSubmittedMessages, 'too many messages'),

    /**
     * The product page the assistant was opened from. An id, never the product:
     * the server looks it up, so a page left open since yesterday cannot quote
     * yesterday's price back into the conversation.
     */
    productId: objectIdSchema.optional(),
  })
  .strict()
  .refine((value) => value.messages.at(-1)?.role === 'user', {
    path: ['messages'],
    error: 'the last message must be from the customer',
  })
  .refine(
    (value) =>
      value.messages.reduce((total, message) => total + message.content.length, 0) <=
      AI_LIMITS.maxHistoryLength,
    { path: ['messages'], error: 'the conversation is too long' },
  );

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type AiChatInput = z.infer<typeof aiChatSchema>;
