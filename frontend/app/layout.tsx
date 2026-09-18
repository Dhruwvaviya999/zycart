import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { AnnouncementBar } from '@/components/layout/announcement-bar';
import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { SearchOverlay } from '@/components/search/search-overlay';
import { TooltipProvider } from '@/components/ui/tooltip';
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

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body className="flex min-h-full flex-col overflow-x-hidden antialiased">
        <ThemeProvider>
          <TooltipProvider>
            <a
              href="#main"
              className="focus-ring text-small sr-only rounded-lg bg-background px-4 py-2 font-medium shadow-lg focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
            >
              Skip to content
            </a>

            <AnnouncementBar />
            <Navbar />

            <main id="main" className="flex-1">
              {children}
            </main>

            <Footer />
            <SearchOverlay />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
