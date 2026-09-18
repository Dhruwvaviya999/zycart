import { model, Schema, type InferSchemaType } from 'mongoose';
import { baseSchemaOptions } from './shared';

const categorySchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    image: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true, index: true },
  },
  baseSchemaOptions,
);

export type CategoryDocument = InferSchemaType<typeof categorySchema>;

export const Category = model('Category', categorySchema);
