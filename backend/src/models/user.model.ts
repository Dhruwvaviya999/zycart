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
    // Optional since sign-in moved to Clerk: a Google profile, or a sign-up
    // form configured without it, can arrive with a first name and no last.
    lastName: { type: String, trim: true, maxlength: 60, default: '' },

    /**
     * Mirrored from the account's primary address in Clerk, which owns it.
     *
     * Stored already normalised; `lowercase` is a second line of defence so a
     * write that bypasses the service can still never create a duplicate case.
     */
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },

    /**
     * The Clerk user this account belongs to — the one link between a session
     * and everything ZyCart stores.
     *
     * Null only for an account nobody has signed in to since the move to
     * Clerk, and for the synthetic accounts the seed scripts write. Set once,
     * by `services/auth/clerk-sync.ts` or the import script, and never taken
     * from a request.
     */
    clerkId: { type: String, default: null },

    /**
     * The bcrypt hash from before Clerk, kept only until the account has been
     * imported into Clerk with it (`pnpm clerk:import`), which then unsets it.
     * Nothing else reads it.
     *
     * Never loaded unless a query asks for it explicitly, so no ordinary read
     * can leak the hash even by accident.
     */
    password: { type: String, select: false },

    phone: { type: String, trim: true, maxlength: 20, default: '' },
    avatar: { type: String, trim: true, maxlength: 600, default: '' },

    role: { type: String, enum: USER_ROLES, default: 'USER' },
    isActive: { type: Boolean, default: true },

    /**
     * Whether this person has proved they receive mail at `email`.
     *
     * Mirrored from Clerk, which runs the verification itself. It gates
     * nothing on its own: accounts created before Phase 18 may be unverified,
     * and refusing them checkout overnight would be a worse outcome than the
     * one it prevents.
     */
    isEmailVerified: { type: Boolean, default: false },
    /** Mirrored from Clerk's own record of the last sign-in. */
    lastLoginAt: { type: Date, default: null },

    /**
     * Which optional messages this customer is willing to receive.
     *
     * Transactional mail — an order confirmation, a shipping notice, a password
     * reset — is not optional and is not listed here. A cart reminder is a
     * nudge rather than a service, so it can be switched off: from the account
     * settings, or from the one-click link at the foot of every reminder.
     */
    emailPreferences: {
      type: new Schema({ cartReminders: { type: Boolean, default: true } }, { _id: false }),
      default: () => ({}),
    },

    addresses: { type: [addressSchema], default: [] },
  },
  baseSchemaOptions,
);

/**
 * One account per Clerk user. Partial, because every account that predates
 * Clerk shares the same null and a plain unique index would allow only one.
 */
userSchema.index(
  { clerkId: 1 },
  { unique: true, partialFilterExpression: { clerkId: { $type: 'string' } } },
);

export type UserDocument = InferSchemaType<typeof userSchema>;
export type AddressDocument = InferSchemaType<typeof addressSchema>;

export const User = model('User', userSchema);
