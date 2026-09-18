import type { Category, CategorySlug } from '@/types/product';
import { products } from './products';

function countFor(slug: CategorySlug) {
  return products.filter((product) => product.category === slug).length;
}

export const categories: Category[] = [
  {
    slug: 'electronics',
    name: 'Electronics',
    tagline: 'Audio, wearables and machines',
    image:
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=700&q=80',
    itemCount: countFor('electronics'),
  },
  {
    slug: 'fashion',
    name: 'Fashion',
    tagline: 'Everyday layers worth keeping',
    image:
      'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=700&q=80',
    itemCount: countFor('fashion'),
  },
  {
    slug: 'footwear',
    name: 'Footwear',
    tagline: 'Court, road and everything after',
    image:
      'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=700&q=80',
    itemCount: countFor('footwear'),
  },
  {
    slug: 'accessories',
    name: 'Accessories',
    tagline: 'The pieces that finish the outfit',
    image:
      'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=700&q=80',
    itemCount: countFor('accessories'),
  },
  {
    slug: 'home',
    name: 'Home',
    tagline: 'Objects for the everyday',
    image:
      'https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=700&q=80',
    itemCount: countFor('home'),
  },
  {
    slug: 'beauty',
    name: 'Beauty',
    tagline: 'Short ingredient lists, honest claims',
    image:
      'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=700&q=80',
    itemCount: countFor('beauty'),
  },
];

export const categoryBySlug = (slug: string) =>
  categories.find((category) => category.slug === slug);

export const categoryName = (slug: CategorySlug) => categoryBySlug(slug)?.name ?? slug;
