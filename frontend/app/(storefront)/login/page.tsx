import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/auth-shell';
import { LoginFooter, LoginForm } from '@/components/auth/login-form';
import { getSessionUser } from '@/lib/server-auth';
import { safeRedirect } from '@/lib/redirect';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your ZyCart account.',
};

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams;
  const redirectTo = safeRedirect(params.redirect);

  // Already signed in: send them where they were going rather than showing a
  // form they do not need.
  if (await getSessionUser()) redirect(redirectTo);

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in to ZyCart"
      description="Pick up where you left off — your bag, your saved products and your addresses."
      footer={<LoginFooter redirectTo={redirectTo} />}
    >
      <LoginForm redirectTo={redirectTo} />
    </AuthShell>
  );
}
