import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SignIn } from '@clerk/nextjs';
import { AccountUnavailable } from '@/components/auth/account-unavailable';
import { AuthShell } from '@/components/auth/auth-shell';
import { embeddedAuthAppearance } from '@/lib/clerk-appearance';
import { safeRedirect } from '@/lib/redirect';
import { getClerkUserId, getSessionUser } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your ZyCart account.',
};

/**
 * Clerk's sign-in, in ZyCart's frame.
 *
 * A catch-all route, because Clerk's flow has steps of its own under this path
 * — a second factor, a password reset, the return from Google — and each is a
 * URL. `redirect` is sanitised here, as it always was, and handed to Clerk as
 * the one place to land; Clerk checks it against the app's own origin again.
 */
export default async function LoginPage({ searchParams }: PageProps<'/login/[[...rest]]'>) {
  const params = await searchParams;
  const redirectTo = safeRedirect(params.redirect);
  const query = redirectTo === '/account' ? '' : `?redirect=${encodeURIComponent(redirectTo)}`;

  if (await getClerkUserId()) {
    // Already signed in: send them where they were going rather than showing a
    // form they do not need — unless ZyCart will not open the account, in which
    // case redirecting would only bring them straight back here.
    if (await getSessionUser()) redirect(redirectTo);

    return (
      <AuthShell
        eyebrow="Signed in"
        title="We could not open your account"
        description="You are signed in, but this ZyCart account is not available right now."
      >
        <AccountUnavailable />
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow="Welcome back">
      <SignIn
        routing="path"
        path="/login"
        signUpUrl={`/register${query}`}
        forceRedirectUrl={redirectTo}
        signUpForceRedirectUrl={redirectTo}
        appearance={embeddedAuthAppearance}
      />
    </AuthShell>
  );
}
