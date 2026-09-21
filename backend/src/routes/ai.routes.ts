import { Router, type Request } from 'express';
import * as controller from '../controllers/ai.controller';
import { optionalAuth } from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { asyncHandler } from '../utils/asyncHandler';

export const aiRouter = Router();

/**
 * Public and cheap: the storefront asks this once to decide whether to offer
 * the assistant at all, so a deployment without AI shows nothing rather than a
 * launcher that fails when tapped.
 */
aiRouter.get('/ai/status', controller.getAiStatus);

/**
 * The chat endpoint's guard, in order.
 *
 * `optionalAuth` first, because both of the next two need to know who is
 * asking: the limiter counts per account rather than per IP where it can, and
 * the service decides from the same verified identity whether the cart tools
 * exist at all.
 *
 * The limiter is the existing in-memory one. It counts in this process only —
 * behind a load balancer each instance would keep its own tally, so a
 * horizontally scaled deployment needs a shared store. That is documented
 * rather than pre-solved, exactly as it is for the credential endpoints, and it
 * matters more here because every request past it costs money at a provider.
 */
aiRouter.post(
  '/ai/chat',
  asyncHandler(optionalAuth),
  rateLimit({
    windowMs: 60_000,
    max: (req: Request) => (req.user ? req.env.AI_RATE_LIMIT_USER : req.env.AI_RATE_LIMIT_GUEST),
    // A signed-in customer is counted per account, so sharing an office IP does
    // not mean sharing one allowance. Guests have only their address to go on.
    keyBy: (req: Request) => (req.user ? `ai:user:${req.user.id}` : `ai:ip:${req.ip ?? 'unknown'}`),
    message: 'You are sending messages faster than the assistant can answer. Please slow down.',
  }),
  asyncHandler(controller.chat),
);
