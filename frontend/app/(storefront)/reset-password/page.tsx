import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';
import { BackToSignIn } from '@/components/auth/forgot-password-form';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { oneParam } from '@/components/common/email-link-page';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Choose a new password',
  // The reset token is in the URL, so the page must never be indexed.
  robots: { index: false, follow: false },
};

/**
 * Where the reset email lands.
 *
 * The token is not checked here: checking it would spend nothing and prove
 * nothing, and a page that said "this link is valid" would be an oracle for
 * guessing links. It is checked once, when the new password is submitted, and
 * the form says so if it has expired.
 */
export default async function ResetPasswordPage({ searchParams }: PageProps<'/reset-password'>) {
  const token = oneParam((await searchParams).token);

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Choose a new password"
      description="Pick something you do not use anywhere else. You will be signed in straight away."
      footer={<BackToSignIn />}
    >
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p className="text-small text-pretty">
          This link is incomplete. Open the reset email again, or{' '}
          <Link
            href="/forgot-password"
            className="focus-ring rounded-sm font-medium text-brand hover:underline"
          >
            request a new link
          </Link>
          .
        </p>
      )}
    </AuthShell>
  );
}
