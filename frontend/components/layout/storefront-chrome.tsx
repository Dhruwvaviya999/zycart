import { AiLauncher } from '@/components/ai/ai-launcher';
import { AnnouncementBar } from '@/components/layout/announcement-bar';
import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';
import { ShopSync } from '@/components/layout/shop-sync';
import { SearchOverlay } from '@/components/search/search-overlay';
import { getCategoriesSafe } from '@/services/category.service';
import { getSessionUser } from '@/lib/server-auth';

/**
 * The storefront's frame: promo bar, navigation, footer, search and cart sync.
 *
 * This used to live in the root layout, which meant *every* route inherited it
 * — including the admin console, which sat beneath a shop navbar, a promo
 * banner and a footer it has no use for, with its own `<main>` nested inside
 * the storefront's. The chrome now belongs to the routes that want it: the
 * `(storefront)` group wraps its pages in this, and the admin console brings
 * its own shell instead.
 *
 * It is also used directly by the root `not-found`, which Next renders in the
 * root layout rather than in any group — so a mistyped URL still arrives
 * somewhere recognisably ZyCart, with a way out of it.
 *
 * Returns a fragment on purpose: `body` is the flex column that keeps the
 * footer at the bottom, and an extra wrapper here would break that.
 */
export async function StorefrontChrome({ children }: { children: React.ReactNode }) {
  // Neither throws: the shell must still render when the API is unreachable, and
  // being signed out is the normal state rather than an error.
  const [categories, user] = await Promise.all([getCategoriesSafe(), getSessionUser()]);

  return (
    <>
      <a
        href="#main"
        className="focus-ring text-small sr-only rounded-lg bg-background px-4 py-2 font-medium shadow-lg focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to content
      </a>

      <AnnouncementBar />
      <Navbar categories={categories} user={user} />

      <main id="main" className="flex-1">
        {children}
      </main>

      <Footer />
      <SearchOverlay />
      <ShopSync user={user} />

      {/*
        One launcher for the whole storefront, so the assistant is reachable
        from the homepage, the shop and every product page without any of them
        carrying a widget of their own. It renders nothing when this deployment
        has no assistant configured.
      */}
      <AiLauncher />
    </>
  );
}
