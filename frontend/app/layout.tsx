import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { AuthProvider } from '@/components/auth/auth-provider';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getSessionUser } from '@/lib/server-auth';
import './globals.css';

const geistSans = Geist({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'ZyCart — Smart shopping, beautifully simplified',
    template: '%s · ZyCart',
  },
  description:
    'ZyCart is a curated e-commerce storefront: electronics, fashion, footwear, accessories, home and beauty, with an AI assistant that understands what you actually asked for.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#101219' },
  ],
};

/**
 * The document, and nothing else.
 *
 * Deliberately thin: fonts, global styles and the three providers that every
 * route needs — theme, session and tooltips — and no chrome. The shop's navbar
 * and footer belong to the `(storefront)` group; the admin console brings its
 * own shell. A layout that rendered both would force one onto the other, which
 * is exactly what it used to do.
 *
 * `getSessionUser` is `cache`d, so the storefront chrome reading it again a
 * moment later costs nothing.
 */
export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const user = await getSessionUser();

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body className="flex min-h-full flex-col overflow-x-hidden antialiased">
        <ThemeProvider>
          <AuthProvider user={user}>
            <TooltipProvider>{children}</TooltipProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
