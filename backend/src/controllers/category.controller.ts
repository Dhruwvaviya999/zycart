import type { Request, Response } from 'express';
import * as categoryService from '../services/category.service';
import {
  categoryQuerySchema,
  createCategorySchema,
  updateCategorySchema,
} from '../validators/category.validator';
import { idParamSchema, slugParamSchema } from '../validators/common';

export async function getCategories(req: Request, res: Response): Promise<void> {
  const { includeInactive } = categoryQuerySchema.parse(req.query);
  res.json({ success: true, data: await categoryService.listCategories(includeInactive) });
}

export async function getCategory(req: Request, res: Response): Promise<void> {
  const { slug } = slugParamSchema.parse(req.params);
  res.json({ success: true, data: await categoryService.getCategoryBySlug(slug) });
}

export async function createCategory(req: Request, res: Response): Promise<void> {
  const input = createCategorySchema.parse(req.body);
  res.status(201).json({ success: true, data: await categoryService.createCategory(input) });
}

export async function updateCategory(req: Request, res: Response): Promise<void> {
  const { id } = idParamSchema.parse(req.params);
  const input = updateCategorySchema.parse(req.body);

  res.json({ success: true, data: await categoryService.updateCategory(id, input) });
}

export async function deleteCategory(req: Request, res: Response): Promise<void> {
  const { id } = idParamSchema.parse(req.params);
  await categoryService.deleteCategory(id);

  res.json({ success: true, message: 'Category deleted' });
}
