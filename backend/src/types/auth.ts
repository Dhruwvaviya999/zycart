import type { UserRole } from '../models/user.model';

/**
 * What `requireAuth` attaches to the request: an identity, not a profile.
 * Anything richer should be read from the database by the service that needs it.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}
