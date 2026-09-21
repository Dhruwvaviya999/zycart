import { model, Schema, type InferSchemaType } from 'mongoose';
import { baseSchemaOptions } from './shared';

const brandSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    logo: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true, index: true },
  },
  baseSchemaOptions,
);

export type BrandDocument = InferSchemaType<typeof brandSchema>;

export const Brand = model('Brand', brandSchema);
