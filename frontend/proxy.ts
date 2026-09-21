import { NextResponse, type NextRequest } from 'next/server';

const AUTH_COOKIE = 'zycart_token';

/**
 * A cheap first gate on the account area.
 *
 * Next 16 renamed this convention from `middleware` to `proxy`.
 *
 * It only checks that a session cookie exists — it cannot verify the signature,
 * which needs the API's secret. That is deliberate: this exists to send a signed
 * out visitor to the sign-in page with their destination intact, before any
 * rendering happens. The account layout still resolves the session properly, so
 * an expired or forged cookie gets no further than that.
 */
export default function proxy(request: NextRequest) {
  if (request.cookies.has(AUTH_COOKIE)) return NextResponse.next();

  const signIn = new URL('/login', request.url);
  signIn.searchParams.set('redirect', request.nextUrl.pathname);

  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: ['/account/:path*', '/checkout', '/order-confirmation/:path*'],
};
