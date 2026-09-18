import { AiShopping } from '@/components/store/ai-shopping';
import { CategorySection } from '@/components/store/category-section';
import { Hero } from '@/components/store/hero';
import { Newsletter } from '@/components/store/newsletter';
import { ProductSection } from '@/components/store/product-section';
import { PromoBanner } from '@/components/store/promo-banner';
import { bestSellers, editorsPicks, newArrivals, trendingProducts } from '@/data/products';
import { promoBanner, secondaryPromo } from '@/data/banners';

export default function Home() {
  return (
    <>
      <Hero />

      <CategorySection />

      <ProductSection
        eyebrow="Right now"
        title="Trending Now"
        description="Discover what's popular right now."
        products={trendingProducts}
        action={{ label: 'View all', href: '/shop?sort=rating' }}
      />

      <PromoBanner banner={promoBanner} />

      <ProductSection
        eyebrow="Just landed"
        title="New Arrivals"
        description="Fresh products, just added."
        products={newArrivals}
        action={{ label: 'View all', href: '/shop?sort=newest' }}
      />

      <AiShopping />

      <ProductSection
        eyebrow="Proven"
        title="Best Sellers"
        description="Products customers keep coming back for."
        products={bestSellers}
        action={{ label: 'View all', href: '/shop' }}
      />

      <PromoBanner banner={secondaryPromo} reverse />

      <ProductSection
        eyebrow="Curated"
        title="The Editors' Collection"
        description="Eight pieces chosen for how they are made, not how they sell."
        products={editorsPicks}
        action={{ label: 'Browse everything', href: '/shop' }}
      />

      <Newsletter />
    </>
  );
}
