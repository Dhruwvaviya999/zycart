import { model, Schema } from 'mongoose';

/**
 * A named sequence, advanced atomically.
 *
 * Exists for one caller today — tax invoice numbers, which must run without
 * gaps within a financial year — and is deliberately generic rather than an
 * `InvoiceSequence` model, because "the next number in a series" is the whole
 * of what it does.
 *
 * `_id` is the sequence's name (`invoice:2026-27`), so advancing one is a single
 * upsert on the primary key: no second index, and no way for two documents to
 * claim the same series.
 */
const counterSchema = new Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0, min: 0 },
  },
  { versionKey: false, timestamps: true },
);

export const Counter = model('Counter', counterSchema);
