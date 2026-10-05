import type { CategoryDef } from '../types';
import { accessories } from './accessories';
import { appliances } from './appliances';
import { beauty } from './beauty';
import { electronics } from './electronics';
import { fashion } from './fashion';
import { footwear } from './footwear';
import { home } from './home';
import { sports } from './sports';

/**
 * The taxonomy the generator draws from: eight categories, forty-eight
 * subcategories.
 *
 * The first six slugs are the storefront's existing categories, so generated
 * products land in the same places as the hand-written catalogue and the
 * footer links keep working. `appliances` and `sports` are new.
 *
 * The Category model has no parent field, so a subcategory is not a document:
 * it is carried on each product as a search tag (`smartphones`,
 * `running shoes`) and in the product's SKU, which is how the storefront's
 * search already finds things.
 */
export const CATALOG: CategoryDef[] = [
  electronics,
  fashion,
  footwear,
  accessories,
  home,
  appliances,
  beauty,
  sports,
];
