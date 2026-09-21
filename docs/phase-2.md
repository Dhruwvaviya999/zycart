# Phase 2 — Storefront UI Foundation

## Goal

Give ZyCart a complete, premium storefront front end: a design system, a set of
reusable components, and every customer-facing route built on top of them. No
backend work — the catalogue is mock data in `frontend/data/`.

## Design system

Everything lives in `frontend/app/globals.css`. Components consume tokens; they
never hard-code a raw colour, radius or shadow.

| Token group | Where it is defined                | Notes                                                     |
| ----------- | ---------------------------------- | --------------------------------------------------------- |
| Colour      | `:root` and `.dark`                | OKLCH throughout, so both themes stay perceptually even   |
| Brand       | `--brand*`                         | Iris. The one colour that is unmistakably ZyCart          |
| Commerce    | `--sale`, `--success`, `--surface` | Semantics the storefront needs that shadcn does not ship  |
| Radius      | `--radius` + `--radius-*`          | One base value; every step derives from it                |
| Elevation   | `--elevation-*` → `--shadow-*`     | Re-tuned per theme rather than reused                     |
| Motion      | `--ease-brand`                     | One easing curve for the whole site                       |
| Typography  | `.text-display` … `.text-label`    | Fluid `clamp()` steps, no per-breakpoint overrides needed |
| Rhythm      | `.section`, `.section-tight`       | Every merchandised band breathes the same way             |

Dark mode is designed, not inverted: it sits on a deep blue-black with lifted
surfaces so product photography keeps its contrast, and the brand hue is
re-picked for the darker ground.

## Routes

| Route              | Rendering | What it is                                                    |
| ------------------ | --------- | ------------------------------------------------------------- |
| `/`                | Static    | Hero, categories, trending, promos, AI section, best sellers  |
| `/shop`            | Dynamic   | Catalogue with search, five filter groups and six sort orders |
| `/products/[slug]` | SSG       | 36 prerendered product pages; unknown slugs return a real 404 |
| `/cart`            | Static    | Cart, saved-for-later and order summary                       |
| `/wishlist`        | Static    | Saved products with move-to-cart                              |
| `/account`         | Dynamic   | Profile, orders, wishlist, addresses and settings             |

`/shop` and `/account` are dynamic because they read `searchParams`. Cart and
wishlist are static shells that fill in from `localStorage` after hydration.

## Components

```text
components/
├── account/     account-client
├── cart/        cart-client
├── common/      breadcrumbs, empty-state, error-state, loading-state
├── layout/      navbar, mobile-nav, announcement-bar, footer, container,
│                section-heading, logo, theme-provider, theme-toggle,
│                store-hydrator
├── product/     product-card, product-grid, product-gallery,
│                product-purchase-panel, price, rating, product-badge,
│                quantity-selector, wishlist-button
├── search/      search-trigger, search-overlay, use-product-search
├── shop/        shop-client, filter-panel, active-filters, use-shop-filters
├── store/       hero, category-section, category-card, product-section,
│                promo-banner, ai-shopping, newsletter
├── ui/          shadcn/ui primitives
└── wishlist/    wishlist-client
```

`ProductCard` is the component that matters most. It carries the image
cross-fade, badge, wishlist toggle, rating, price and quick-add, and takes an
optional `footer` slot — which is how the wishlist gets its own action row
without a second copy of the card.

## Design decisions

**Persisted stores rehydrate from an effect.** zustand's `persist` reads
`localStorage` synchronously at module scope, so the first client render would
have had a full cart while the server rendered an empty one. Both stores use
`skipHydration` and `<StoreHydrator/>` rehydrates them in `useEffect`; every
consumer gates on the store's `hydrated` flag until then. The cost is a skeleton
on first paint, which is the honest representation of what is actually known.

**One search matcher, two consumers.** `matchesSearch()` in `data/products.ts`
splits the query into words and requires each to appear in the product's name,
brand, tagline, category or `tags`. The shop filters and the search overlay both
call it, so they can never disagree about what matches. `tags` exists because
nothing in the catalogue literally says "shoes" — searching for the word people
actually type has to be made to work.

**`dynamicParams = false` on the product route.** The catalogue is fully known at
build time, so an unknown slug is a genuine 404. Without it Next streams the
not-found page with a `200`, which search engines would index.

**Filter state is local, not in the URL.** Query strings seed the initial state
(`?q=`, `?category=`, `?brand=`, `?sort=`) but are not written back on every
change. Sharing a filtered view is a Phase 3 concern; keeping the reducer local
keeps the interaction instant.

**Images go through one function.** `img()` in `data/products.ts` builds every
catalogue URL, so repointing the whole catalogue at Cloudinary later is a
one-function change.

## Deliberately excluded

Authentication, product/cart/order APIs, MongoDB models, payments, Cloudinary,
the AI backend, recommendations, admin, Redis, Docker, LangChain, RAG, vector
databases and WebSockets. Phase 2 is the visual foundation only; the Phase 1
health-check client (`services/api.ts`, `store/health-store.ts`) is retained
untouched for the API work that follows.
