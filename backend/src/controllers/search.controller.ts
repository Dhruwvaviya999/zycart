import type { Request, Response } from 'express';
import { aiConfig } from '../config/ai';
import { record } from '../services/activity/activity.service';
import { getAiProvider } from '../services/ai/runtime';
import { smartSearch } from '../services/search/smart-search.service';
import { smartSearchSchema } from '../validators/search.validator';

/**
 * Interprets a search. Never fails because of the model.
 *
 * When no provider is configured, or one is configured and unreachable, the
 * request still answers — with the keyword criteria the shopper would have got
 * from the ordinary search box. Smart search is an enhancement to search, not a
 * dependency of it, and this controller is where that promise is kept.
 */
export async function smartSearchQuery(req: Request, res: Response): Promise<void> {
  const input = smartSearchSchema.parse(req.body);

  /**
   * Resolved here rather than inside the service so that "no AI configured" is
   * a null provider — an ordinary, expected argument — instead of an exception
   * the search path would have to catch.
   */
  const provider = aiConfig(req.env) ? getAiProvider(req.env) : null;

  // Abandon the interpretation if the shopper navigates away mid-search; the
  // model call is the only expensive part of this request.
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();
  });

  const data = await smartSearch(input, { provider, signal: controller.signal });

  /**
   * A submitted search, not a keystroke — this endpoint is called on submit.
   * Recorded only for a signed-in customer, and only what they searched for.
   */
  if (req.user) record({ userId: req.user.id, event: 'search', term: input.query });

  res.json({ success: true, data });
}
