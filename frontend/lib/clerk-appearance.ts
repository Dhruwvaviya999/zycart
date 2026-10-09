import type { Appearance } from '@clerk/ui';
import { shadcn } from '@clerk/ui/themes';

/**
 * Clerk's components, dressed as ZyCart.
 *
 * The shadcn theme already reads this app's own design tokens — `--card`,
 * `--input`, `--ring`, `--muted` — so Clerk follows light and dark mode the
 * same way every other surface does, with no second palette to keep in step.
 * On top of it, the one ZyCart-specific decision: the primary action is the
 * brand colour, as every storefront CTA is, not shadcn's neutral primary.
 *
 * Sizes match the storefront's `cta` buttons and `lg` inputs, so a Clerk form
 * and a ZyCart form side by side are indistinguishable.
 */
export const clerkAppearance: Appearance = {
  theme: shadcn,
  variables: {
    colorPrimary: 'var(--brand)',
    colorPrimaryForeground: 'var(--brand-foreground)',
    fontFamily: 'var(--font-sans)',
    borderRadius: 'var(--radius)',
  },
  elements: {
    formButtonPrimary: 'h-11 rounded-xl text-[0.9375rem] shadow-sm',
    socialButtonsBlockButton: 'h-11 rounded-xl',
    formFieldInput: 'h-11 rounded-xl',
    footerActionLink: 'font-medium text-brand hover:text-brand',
  },
};

/**
 * Sign-in and sign-up sit inside `AuthShell`, which is already the card, so
 * Clerk's own card chrome goes and its header aligns with the shell's eyebrow.
 */
export const embeddedAuthAppearance: Appearance = {
  options: { elevation: 'flush' },
  elements: {
    rootBox: 'w-full',
    cardBox: 'w-full max-w-none',
    card: 'gap-7',
    header: 'items-start text-left',
    headerTitle: 'text-h2',
    headerSubtitle: 'text-small text-pretty text-muted-foreground',
    logoBox: 'hidden',
  },
};

/**
 * Clerk's profile inside an account panel: full width of the column, and a
 * plain bordered surface like every other panel rather than a floating card.
 */
export const profileAppearance: Appearance = {
  elements: {
    rootBox: 'w-full',
    cardBox: 'w-full max-w-none rounded-2xl border border-border shadow-none',
  },
};

/**
 * The first screen's words are ZyCart's; every later step — "Check your
 * email", "Enter your password" — keeps Clerk's, which say exactly what that
 * step needs.
 */
export const clerkLocalization = {
  signIn: {
    start: {
      title: 'Sign in to ZyCart',
      subtitle: 'Pick up where you left off — your bag, your saved products and your addresses.',
    },
  },
  signUp: {
    start: {
      title: 'Join ZyCart',
      subtitle:
        'Save products you love, keep your addresses ready and check out in a couple of taps.',
    },
  },
};
