import { Types } from 'mongoose';
import { Category } from '../models/category.model';
import { Product } from '../models/product.model';
import { AppError } from '../utils/AppError';
import { uniqueSlug } from '../utils/slugify';
import type { CreateCategoryInput, UpdateCategoryInput } from '../validators/category.validator';
import { isObjectId } from '../validators/common';

/** How many active products sit in each category, in one round trip. */
async function productCounts(): Promise<Map<string, number>> {
  const rows = await Product.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { isActive: true } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]);

  return new Map(rows.map((row) => [String(row._id), row.count]));
}

export async function listCategories(includeInactive = false) {
  const [categories, counts] = await Promise.all([
    Category.find(includeInactive ? {} : { isActive: true }).sort({ name: 1 }),
    productCounts(),
  ]);

  return categories.map((category) => ({
    ...category.toJSON(),
    productCount: counts.get(String(category._id)) ?? 0,
  }));
}

export async function getCategoryBySlug(slug: string) {
  const category = await Category.findOne({ slug, isActive: true });
  if (!category) throw new AppError('Category not found', 404);

  const productCount = await Product.countDocuments({ category: category._id, isActive: true });
  return { ...category.toJSON(), productCount };
}

export async function createCategory(input: CreateCategoryInput) {
  const slug = await uniqueSlug(input.name, async (candidate) => {
    return (await Category.exists({ slug: candidate })) !== null;
  });

  const category = await Category.create({ ...input, slug });
  return category.toJSON();
}

export async function updateCategory(id: string, input: UpdateCategoryInput) {
  const category = await Category.findByIdAndUpdate(id, input, {
    new: true,
    runValidators: true,
  });

  if (!category) throw new AppError('Category not found', 404);
  return category.toJSON();
}

/** Refused while products still point at it, so the catalogue cannot be orphaned. */
export async function deleteCategory(id: string) {
  const inUse = await Product.countDocuments({ category: id });
  if (inUse > 0) {
    throw new AppError(`Cannot delete: ${inUse} product(s) still use this category`, 409);
  }

  const category = await Category.findByIdAndDelete(id);
  if (!category) throw new AppError('Category not found', 404);
}

/** Resolves an id or a slug to an `_id`, or null when nothing matches. */
export async function resolveCategoryId(value: string): Promise<Types.ObjectId | null> {
  if (isObjectId(value)) return new Types.ObjectId(value);

  const category = await Category.findOne({ slug: value }).select('_id');
  return category?._id ?? null;
}
