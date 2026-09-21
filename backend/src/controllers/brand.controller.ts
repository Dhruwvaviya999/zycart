import type { Request, Response } from 'express';
import * as brandService from '../services/brand.service';
import {
  brandQuerySchema,
  createBrandSchema,
  updateBrandSchema,
} from '../validators/brand.validator';
import { idParamSchema, slugParamSchema } from '../validators/common';

export async function getBrands(req: Request, res: Response): Promise<void> {
  const { includeInactive } = brandQuerySchema.parse(req.query);
  res.json({ success: true, data: await brandService.listBrands(includeInactive) });
}

export async function getBrand(req: Request, res: Response): Promise<void> {
  const { slug } = slugParamSchema.parse(req.params);
  res.json({ success: true, data: await brandService.getBrandBySlug(slug) });
}

export async function createBrand(req: Request, res: Response): Promise<void> {
  const input = createBrandSchema.parse(req.body);
  res.status(201).json({ success: true, data: await brandService.createBrand(input) });
}

export async function updateBrand(req: Request, res: Response): Promise<void> {
  const { id } = idParamSchema.parse(req.params);
  const input = updateBrandSchema.parse(req.body);

  res.json({ success: true, data: await brandService.updateBrand(id, input) });
}

export async function deleteBrand(req: Request, res: Response): Promise<void> {
  const { id } = idParamSchema.parse(req.params);
  await brandService.deleteBrand(id);

  res.json({ success: true, message: 'Brand deleted' });
}
