import { ApiError, request, send, sendMessage, type RequestOptions } from '@/services/api';
import type { AuthUser, LoginInput, RegisterInput } from '@/types/user';

export function register(input: RegisterInput): Promise<AuthUser> {
  return send<AuthUser>('post', '/api/auth/register', input);
}

export function login(input: LoginInput): Promise<AuthUser> {
  return send<AuthUser>('post', '/api/auth/login', input);
}

export function logout(): Promise<string> {
  return sendMessage('post', '/api/auth/logout');
}

export function getCurrentUser(options?: RequestOptions): Promise<AuthUser> {
  return request<AuthUser>('/api/auth/me', undefined, options);
}

/**
 * Being signed out is the normal state for most visitors, not an error — every
 * caller that just wants to know "who is this, if anyone" uses this variant so
 * a 401 never reaches an error boundary.
 *
 * A genuine failure (the API being down) is also treated as "no session": the
 * storefront stays browsable, which is the right call for a shop.
 */
export async function getCurrentUserSafe(options?: RequestOptions): Promise<AuthUser | null> {
  try {
    return await getCurrentUser(options);
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthenticated) return null;
    return null;
  }
}
