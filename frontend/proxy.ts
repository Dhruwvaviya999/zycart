import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isProtected = createRouteMatcher([
  '/account(.*)',
  '/checkout',
  '/order-confirmation(.*)',
  '/invoice(.*)',
]);

/**
 * Clerk's middleware, on every page.
 *
 * Next 16 renamed this convention from `middleware` to `proxy`.
 *
 * It does two jobs. Everywhere, it keeps Clerk's short-lived session token
 * fresh before a page renders, which is what lets server components read
 * `auth()` and hand a valid token to the API. On the account area it is also
 * a cheap first gate: a visitor Clerk does not recognise is sent to sign in
 * with their destination intact, before any rendering happens.
 *
 * It is only a first gate. Whether a Clerk user has a usable ZyCart account —
 * one that exists and is not deactivated — is the API's answer, so the account
 * layout still resolves the session properly.
 */
export default clerkMiddleware(async (auth, request) => {
  if (!isProtected(request)) return NextResponse.next();

  const { userId } = await auth();
  if (userId) return NextResponse.next();

  const signIn = new URL('/login', request.url);
  signIn.searchParams.set('redirect', request.nextUrl.pathname);

  return NextResponse.redirect(signIn);
});

export const config = {
  // Every page, skipping Next internals and static files. `/api` is not here:
  // it belongs to the Express service, which verifies sessions itself.
  matcher: [
    '/((?!_next|api/|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
  ],
};
