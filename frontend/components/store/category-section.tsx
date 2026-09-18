import { Container } from '@/components/layout/container';
import { SectionHeading } from '@/components/layout/section-heading';
import { CategoryCard } from '@/components/store/category-card';
import { categories } from '@/data/categories';

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

        <div className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
          {categories.map((category) => (
            <CategoryCard key={category.slug} category={category} />
          ))}
        </div>
      </Container>
    </section>
  );
}
