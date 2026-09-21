import type { Request } from 'express';
import type { AuditActor } from '../services/admin/audit.service';
import { AppError } from './AppError';

/**
 * The administrator behind an audited mutation.
 *
 * Every write that records who did it takes an actor as an ordinary argument
 * rather than reaching for request-scoped state, so a service can be called
 * from a script, a seed or a test without an Express request existing. This is
 * the one place that bridges the two, and it throws rather than defaulting:
 * an audited operation running with no identity would write "System" over a
 * person's action, which is worse than failing.
 *
 * It cannot realistically throw on a guarded route — `requireAuth` ran first —
 * which is precisely why it is a 500 rather than a 401. Reaching it means the
 * route lost its guard, and that is a bug in the routing table, not a failure
 * of the caller's credentials.
 */
export function requireActor(req: Request): AuditActor {
  if (!req.user) {
    throw new AppError('This action requires an identified administrator', 500);
  }

  return { id: req.user.id, name: req.user.name, email: req.user.email };
}
