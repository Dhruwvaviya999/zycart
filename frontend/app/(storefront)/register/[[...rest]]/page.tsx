import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SignUp } from '@clerk/nextjs';
import { AuthShell } from '@/components/auth/auth-shell';
import { embeddedAuthAppearance } from '@/lib/clerk-appearance';
import { safeRedirect } from '@/lib/redirect';
import { getClerkUserId } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Create account',
  description: 'Create a ZyCart account to save products and check out faster.',
};

/**
 * Clerk's sign-up, in ZyCart's frame. A catch-all for the same reason as
 * sign-in: verifying the address and returning from Google are steps of their
 * own under this path.
 */
export default async function RegisterPage({ searchParams }: PageProps<'/register/[[...rest]]'>) {
  const params = await searchParams;
  const redirectTo = safeRedirect(params.redirect);
  const query = redirectTo === '/account' ? '' : `?redirect=${encodeURIComponent(redirectTo)}`;

  // Signed in already: sign-in decides where they go, including the case where
  // the account cannot be opened.
  if (await getClerkUserId()) redirect(`/login${query}`);

  return (
    <AuthShell eyebrow="Create your account">
      <SignUp
        routing="path"
        path="/register"
        signInUrl={`/login${query}`}
        forceRedirectUrl={redirectTo}
        signInForceRedirectUrl={redirectTo}
        appearance={embeddedAuthAppearance}
      />
    </AuthShell>
  );
}
