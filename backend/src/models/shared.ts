/**
 * Applied to every model so the API speaks one shape: documents serialise with
 * `id` rather than `_id`, and Mongoose's internal version key never leaks out.
 * Populated references inherit this too, so `product.brand` is `{ id, name, … }`.
 *
 * Deliberately not annotated as `SchemaOptions`: widening the type here erases
 * Mongoose's field inference, which would make every document property `unknown`.
 */
export const baseSchemaOptions = {
  // Both of these need `as const`: widened to `boolean` they make Mongoose treat
  // the timestamp fields as only conditionally present, and reject `versionKey`.
  timestamps: true as const,
  versionKey: false as const,
  toJSON: {
    virtuals: true,
    transform(_doc: unknown, ret: Record<string, unknown>) {
      if (ret._id !== undefined) ret.id = String(ret._id);
      delete ret._id;
      return ret;
    },
  },
};
