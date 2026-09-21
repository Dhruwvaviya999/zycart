import { model, Schema, type InferSchemaType } from 'mongoose';
import { baseSchemaOptions } from './shared';

export const USER_ROLES = ['USER', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * Addresses are embedded rather than a collection of their own: they are only
 * ever read through their owner, and there are a handful per user.
 */
const addressSchema = new Schema(
  {
    label: { type: String, trim: true, maxlength: 40, default: 'Home' },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    addressLine1: { type: String, required: true, trim: true, maxlength: 200 },
    addressLine2: { type: String, trim: true, maxlength: 200, default: '' },
    landmark: { type: String, trim: true, maxlength: 120, default: '' },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    state: { type: String, required: true, trim: true, maxlength: 80 },
    postalCode: { type: String, required: true, trim: true, maxlength: 16 },
    country: { type: String, required: true, trim: true, maxlength: 80, default: 'India' },
    isDefault: { type: Boolean, default: false },
  },
  baseSchemaOptions,
);

const userSchema = new Schema(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 60 },
    lastName: { type: String, required: true, trim: true, maxlength: 60 },

    // Stored already normalised; `lowercase` is a second line of defence so a
    // write that bypasses the service can still never create a duplicate case.
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },

    // Never loaded unless a query asks for it explicitly, so no ordinary read
    // can leak the hash even by accident.
    password: { type: String, required: true, select: false },

    /**
     * Every token issued before this moment is refused. It is what makes a
     * password change actually end other sessions: a stateless JWT carries no
     * revocation of its own, so without this a stolen token would stay valid
     * until it expired.
     */
    passwordChangedAt: { type: Date, default: null },

    phone: { type: String, trim: true, maxlength: 20, default: '' },
    avatar: { type: String, trim: true, maxlength: 600, default: '' },

    role: { type: String, enum: USER_ROLES, default: 'USER' },
    isActive: { type: Boolean, default: true },
    isEmailVerified: { type: Boolean, default: false },
    lastLoginAt: { type: Date, default: null },

    addresses: { type: [addressSchema], default: [] },
  },
  baseSchemaOptions,
);

export type UserDocument = InferSchemaType<typeof userSchema>;
export type AddressDocument = InferSchemaType<typeof addressSchema>;

export const User = model('User', userSchema);
