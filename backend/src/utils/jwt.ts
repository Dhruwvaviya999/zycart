import jwt from 'jsonwebtoken';
import { AppError } from './AppError';

/** The only claim we need: everything else is read from the database per request. */
export interface TokenPayload {
  sub: string;
  /** Seconds since the epoch, as JWT records it. */
  issuedAt: number;
}

/**
 * Accepts the `1h` / `7d` style values `JWT_EXPIRES_IN` uses and converts them to
 * milliseconds, so the cookie's lifetime is derived from the token's rather than
 * configured twice and allowed to drift apart.
 */
export function expiresInMs(value: string): number {
  const match = /^(\d+)\s*(s|m|h|d)$/i.exec(value.trim());
  if (!match) {
    throw new Error(`JWT_EXPIRES_IN must look like "30m", "12h" or "7d" (received "${value}")`);
  }

  const amount = Number(match[1]);
  const unit = match[2]!.toLowerCase();
  const scale = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] ?? 0;

  return amount * scale;
}

export function signToken(userId: string, secret: string, expiresIn: string): string {
  // `iat` is added by jsonwebtoken; only the subject is ours to set.
  return jwt.sign({ sub: userId }, secret, {
    expiresIn: Math.floor(expiresInMs(expiresIn) / 1000),
  });
}

/**
 * Every failure mode — expired, tampered, malformed, wrong secret — collapses to
 * the same 401. The client has nothing to gain from knowing which.
 */
export function verifyToken(token: string, secret: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, secret);

    if (typeof decoded === 'string' || typeof decoded.sub !== 'string') {
      throw new AppError('Not authenticated', 401);
    }

    return { sub: decoded.sub, issuedAt: decoded.iat ?? 0 };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Not authenticated', 401);
  }
}
