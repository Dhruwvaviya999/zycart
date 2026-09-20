import type { UserRole } from '../models/user.model';

/**
 * What `requireAuth` attaches to the request: an identity, not a profile.
 * Anything richer should be read from the database by the service that needs it.
 *
 * `name` is the one concession, and it earns its place: every administrative
 * mutation from Phase 12 writes an audit row that has to say *who*, and a log
 * reading "671f2a… changed stock" is a log nobody consults. The alternative was
 * a second lookup per audited write; this rides along on the projection
 * `requireAuth` already performs.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}
