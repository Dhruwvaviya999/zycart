import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/auth-shell';
import { RegisterFooter, RegisterForm } from '@/components/auth/register-form';
import { getSessionUser } from '@/lib/server-auth';
import { safeRedirect } from '@/lib/redirect';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Create account',
  description: 'Create a ZyCart account to save products and check out faster.',
};

export default async function RegisterPage({ searchParams }: PageProps<'/register'>) {
  const params = await searchParams;
  const redirectTo = safeRedirect(params.redirect);

  if (await getSessionUser()) redirect(redirectTo);

  return (
    <AuthShell
      eyebrow="Create your account"
      title="Join ZyCart"
      description="Save products you love, keep your addresses ready and check out in a couple of taps."
      footer={<RegisterFooter redirectTo={redirectTo} />}
    >
      <RegisterForm redirectTo={redirectTo} />
    </AuthShell>
  );
}
