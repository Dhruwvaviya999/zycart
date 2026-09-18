import { Types } from 'mongoose';
import { Brand } from '../models/brand.model';
import { Product } from '../models/product.model';
import { AppError } from '../utils/AppError';
import { uniqueSlug } from '../utils/slugify';
import type { CreateBrandInput, UpdateBrandInput } from '../validators/brand.validator';
import { isObjectId } from '../validators/common';

export async function listBrands(includeInactive = false) {
  const brands = await Brand.find(includeInactive ? {} : { isActive: true }).sort({ name: 1 });
  return brands.map((brand) => brand.toJSON());
}

export async function getBrandBySlug(slug: string) {
  const brand = await Brand.findOne({ slug, isActive: true });
  if (!brand) throw new AppError('Brand not found', 404);
  return brand.toJSON();
}

export async function createBrand(input: CreateBrandInput) {
  const slug = await uniqueSlug(input.name, async (candidate) => {
    return (await Brand.exists({ slug: candidate })) !== null;
  });

  const brand = await Brand.create({ ...input, slug });
  return brand.toJSON();
}

export async function updateBrand(id: string, input: UpdateBrandInput) {
  const brand = await Brand.findByIdAndUpdate(id, input, { new: true, runValidators: true });
  if (!brand) throw new AppError('Brand not found', 404);
  return brand.toJSON();
}

export async function deleteBrand(id: string) {
  const inUse = await Product.countDocuments({ brand: id });
  if (inUse > 0) {
    throw new AppError(`Cannot delete: ${inUse} product(s) still use this brand`, 409);
  }

  const brand = await Brand.findByIdAndDelete(id);
  if (!brand) throw new AppError('Brand not found', 404);
}

export async function resolveBrandId(value: string): Promise<Types.ObjectId | null> {
  if (isObjectId(value)) return new Types.ObjectId(value);

  const brand = await Brand.findOne({ slug: value }).select('_id');
  return brand?._id ?? null;
}
