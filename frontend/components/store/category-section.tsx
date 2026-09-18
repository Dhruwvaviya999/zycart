import Image from 'next/image';
import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { SectionHeading } from '@/components/layout/section-heading';
import { categories } from '@/data/categories';
import type { Category } from '@/types/product';

export function CategorySection() {
  return (
    <section id="categories" className="section-tight scroll-mt-24">
      <Container>
        <SectionHeading
          eyebrow="Browse"
          title="Shop by category"
          description="Six ranges, each one curated rather than catalogued."
          action={{ label: 'View all products', href: '/shop' }}
        />

        <div className="mt-9 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6">
          {categories.map((category) => (
            <CategoryCard key={category.slug} category={category} />
          ))}
        </div>
      </Container>
    </section>
  );
}

export function CategoryCard({ category }: { category: Category }) {
  return (
    <Link
      href={`/shop?category=${category.slug}`}
      className="focus-ring group relative flex flex-col overflow-hidden rounded-2xl bg-surface ring-1 ring-border/70 transition-shadow duration-300 ease-brand hover:shadow-md"
    >
      <span className="relative block aspect-square overflow-hidden">
        <Image
          src={category.image}
          alt=""
          fill
          sizes="(min-width: 1024px) 16vw, 46vw"
          className="object-cover transition-transform duration-500 ease-brand group-hover:scale-[1.07]"
        />
      </span>

      <span className="flex flex-col gap-0.5 px-3 py-3">
        <span className="text-small font-semibold">{category.name}</span>
        <span className="text-caption text-muted-foreground">{category.itemCount} items</span>
      </span>
    </Link>
  );
}
