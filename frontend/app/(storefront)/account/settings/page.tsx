import type { Metadata } from 'next';
import { UserProfile } from '@clerk/nextjs';
import { AccountPanel } from '@/components/account/account-panel';
import { EmailPreferencesForm } from '@/components/account/email-preferences-form';
import { LogoutButton } from '@/components/account/logout-button';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { profileAppearance } from '@/lib/clerk-appearance';
import { getSessionUser } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Sign-in, security, email, appearance and session settings.',
};

export default async function SettingsPage() {
  // The layout has already resolved it; `cache` makes this free.
  const user = await getSessionUser();

  return (
    <div className="space-y-12">
      {/* Clerk's own profile: password, Google, email addresses and signed-in
          devices all live with Clerk, so this is where they are changed. Hash
          routing keeps its sub-pages on this URL. */}
      <AccountPanel
        title="Sign-in & security"
        description="Your password, Google sign-in, email addresses and the devices you are signed in on."
      >
        <UserProfile routing="hash" appearance={profileAppearance} />
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
