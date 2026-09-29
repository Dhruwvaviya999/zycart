import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/auth-shell';
import { BackToSignIn, ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { oneParam } from '@/components/common/email-link-page';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Forgot password',
  description: 'Get a link to reset your ZyCart password.',
};

export default async function ForgotPasswordPage({ searchParams }: PageProps<'/forgot-password'>) {
  // Carried over from the sign-in form so it does not have to be typed twice.
  // It only pre-fills a field; nothing is sent until the customer submits.
  const email = oneParam((await searchParams).email).slice(0, 254);

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Forgot your password?"
      description="Tell us the email you signed up with and we will send a link to choose a new one."
      footer={<BackToSignIn />}
    >
      <ForgotPasswordForm initialEmail={email} />
    </AuthShell>
  );
}
