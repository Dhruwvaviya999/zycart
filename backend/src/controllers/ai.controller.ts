import type { Request, Response } from 'express';
import { isAiConfigured } from '../config/ai';
import * as aiService from '../services/ai/ai.service';
import { getAiProvider } from '../services/ai/runtime';
import { aiChatSchema } from '../validators/ai.validator';

/**
 * Whether the assistant is available at all.
 *
 * Public and deliberately uninformative: the storefront needs to know whether
 * to offer the launcher, and nothing more. No provider name, no model, no
 * reason — an operator reads why from the server log at startup.
 */
export function getAiStatus(req: Request, res: Response): void {
  res.json({ success: true, data: { enabled: isAiConfigured(req.env) } });
}

export async function chat(req: Request, res: Response): Promise<void> {
  const provider = getAiProvider(req.env);
  const input = aiChatSchema.parse(req.body);

  /**
   * Stops the work when the customer stops it.
   *
   * A model call is the most expensive thing this server does, so a closed tab
   * or a pressed Stop button should end it rather than pay it out in full.
   * `writableFinished` distinguishes that from the `close` every completed
   * response also fires.
   */
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();
  });

  const data = await aiService.chat(input, {
    provider,
    // Identity comes from the verified session. `optionalAuth` has
    // already run; nothing in the request body can name a customer.
    userId: req.user?.id ?? null,
    signal: controller.signal,
  });

  res.json({ success: true, data });
}
