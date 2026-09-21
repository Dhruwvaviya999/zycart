import bcrypt from 'bcrypt';
import type { Env } from '../config/env';
import { User } from '../models/user.model';
import { AppError } from '../utils/AppError';
import { signToken } from '../utils/jwt';
import type { LoginInput, RegisterInput } from '../validators/auth.validator';
import { toSafeUser, type SafeUser } from './user.service';

/**
 * Cost 12 is the current sensible default: comfortably above the old 10 without
 * making a login noticeably slow.
 */
const BCRYPT_ROUNDS = 12;

export const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, BCRYPT_ROUNDS);

export interface AuthResult {
  user: SafeUser;
  token: string;
}

function issue(userId: string, env: Env): string {
  return signToken(userId, env.JWT_SECRET, env.JWT_EXPIRES_IN);
}

export async function register(input: RegisterInput, env: Env): Promise<AuthResult> {
  // Checked explicitly so the caller gets a clear 409 rather than relying on the
  // unique index to raise a duplicate-key error. The index is still the
  // authority under a race; this is the readable path.
  if (await User.exists({ email: input.email })) {
    throw new AppError('An account with this email already exists', 409);
  }

  // `role` is never taken from input: it is not in the schema, and the model's
  // default is USER. Registration cannot mint an administrator.
  const user = await User.create({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    password: await hashPassword(input.password),
    lastLoginAt: new Date(),
  });

  return { user: toSafeUser(user), token: issue(String(user._id), env) };
}

export async function login(input: LoginInput, env: Env): Promise<AuthResult> {
  const user = await User.findOne({ email: input.email }).select('+password');

  /**
   * One message and one shape for every failure — unknown email, wrong password,
   * deactivated account — so the endpoint cannot be used to discover which
   * addresses are registered. The password is still compared against a dummy
   * hash when no user matched, so the response time does not give it away either.
   */
  const stored = user?.password ?? '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const matches = await bcrypt.compare(input.password, stored);

  if (!user || !matches || !user.isActive) {
    throw new AppError('Invalid email or password', 401);
  }

  user.lastLoginAt = new Date();
  await user.save();

  return { user: toSafeUser(user), token: issue(String(user._id), env) };
}

/** Used after a password change, which invalidates the session that made it. */
export function issueFor(userId: string, env: Env): string {
  return issue(userId, env);
}
