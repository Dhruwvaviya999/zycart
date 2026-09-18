import type { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { getProfile } from '../services/user.service';
import { AppError } from '../utils/AppError';
import { clearAuthCookie, setAuthCookie } from '../utils/cookies';
import { loginSchema, registerSchema } from '../validators/auth.validator';

/** The token only ever travels in the HTTP-only cookie, never in a response body. */
export async function register(req: Request, res: Response): Promise<void> {
  const input = registerSchema.parse(req.body);
  const { user, token } = await authService.register(input, req.env);

  setAuthCookie(res, token, req.env);
  res.status(201).json({ success: true, data: user });
}

export async function login(req: Request, res: Response): Promise<void> {
  const input = loginSchema.parse(req.body);
  const { user, token } = await authService.login(input, req.env);

  setAuthCookie(res, token, req.env);
  res.json({ success: true, data: user });
}

/** Safe to call without a session: clearing an absent cookie is a no-op. */
export function logout(req: Request, res: Response): void {
  clearAuthCookie(res, req.env);
  res.json({ success: true, message: 'Logged out successfully' });
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError('Not authenticated', 401);
  res.json({ success: true, data: await getProfile(req.user.id) });
}
