import type { Request, Response } from 'express';
import {
  buildHealthReport,
  healthHttpStatus,
  type HealthReport,
} from '../services/health/health.service';

/**
 * `GET /api/health` — readiness, in the API's own envelope.
 *
 * Unauthenticated, because everything that needs to poll it — a load balancer,
 * a container runtime, `pnpm smoke:deploy` — has no session and never will. It
 * is safe to be public because there is nothing in it worth having: four enum
 * values, a version string, an uptime and a clock. See the note on disclosure
 * in `health.service.ts`.
 *
 * Kept in the standard `{ success, message, data }` envelope rather than given
 * a bespoke shape, so the frontend's one API client parses it like every other
 * response and no special case exists to rot.
 *
 * `success` reports whether the *check ran*, not whether the answer was
 * cheerful; a 503 with `success: true` is a health endpoint working perfectly
 * and reporting bad news, which is precisely its job.
 */
export async function getHealth(req: Request, res: Response): Promise<void> {
  const report: HealthReport = await buildHealthReport(req.env);
  const status = healthHttpStatus(report);

  if (report.status !== 'ok') {
    // WARN, not ERROR: the endpoint did its job. The severity belongs to the
    // request record the middleware writes, which carries the 503 and the
    // duration alongside this.
    req.log.warn('health_degraded', { database: report.checks.database });
  }

  res.status(status).json({
    success: true,
    message: report.status === 'ok' ? 'API is healthy' : 'API is not ready',
    data: report,
  });
}
