import type { Metadata } from 'next';
import { AccountPanel } from '@/components/account/account-panel';
import { EmailPreferencesForm } from '@/components/account/email-preferences-form';
import { LogoutButton } from '@/components/account/logout-button';
import { PasswordForm } from '@/components/account/password-form';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { getSessionUser } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Password, email, appearance and session settings.',
};

export default async function SettingsPage() {
  // The layout has already resolved it; `cache` makes this free.
  const user = await getSessionUser();

  return (
    <div className="space-y-12">
      <AccountPanel
        title="Change password"
        description="Use a password you do not use anywhere else."
      >
        <PasswordForm />
      </AccountPanel>

      {user && (
        <AccountPanel title="Emails" description="Which optional messages ZyCart may send you.">
          <EmailPreferencesForm initial={user.emailPreferences} />
        </AccountPanel>
      )}

      <AccountPanel title="Appearance" description="How ZyCart looks on this device.">
        <div className="flex max-w-md items-center justify-between gap-4 rounded-2xl border border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-small font-medium">Theme</p>
            <p className="text-caption mt-0.5 text-muted-foreground">
              Follows your system setting until you choose one.
            </p>
          </div>
          <ThemeToggle className="shrink-0 border border-border" />
        </div>
      </AccountPanel>

      <AccountPanel title="Session" description="Sign out of ZyCart on this device.">
        <LogoutButton />
      </AccountPanel>
    </div>
  );
}
