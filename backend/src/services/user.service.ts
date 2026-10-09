import type { Env } from '../config/env';
import { User, type UserRole } from '../models/user.model';
import { AppError } from '../utils/AppError';
import { verifyLink } from '../utils/signed-links';
import { isObjectId } from '../validators/common';
import { pushName } from './auth/clerk-sync';
import type {
  CreateAddressInput,
  UpdateAddressInput,
  UpdatePreferencesInput,
  UpdateProfileInput,
} from '../validators/user.validator';

export interface SafeAddress {
  id: string;
  label: string;
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  landmark: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

export interface SafeUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  avatar: string;
  role: UserRole;
  isActive: boolean;
  isEmailVerified: boolean;
  /** The optional messages this customer has agreed to (Phase 18). */
  emailPreferences: { cartReminders: boolean };
  createdAt: string;
  addresses: SafeAddress[];
}

/**
 * Taken from the model rather than rebuilt with `InferSchemaType`, which drops
 * the timestamp fields Mongoose adds and produces a subtly different type.
 */
type UserDoc = InstanceType<typeof User>;
type UserAddress = UserDoc['addresses'][number];

/**
 * The single place a user becomes a response body.
 *
 * Built by naming every field rather than by deleting the sensitive ones, so a
 * field added to the schema later is private until someone deliberately exposes
 * it here. That is why no endpoint can leak the password hash even if `select`
 * is overridden somewhere.
 */
export function toSafeUser(user: UserDoc): SafeUser {
  return {
    id: String(user._id),
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    avatar: user.avatar,
    role: user.role,
    isActive: user.isActive,
    isEmailVerified: user.isEmailVerified,
    // `!== false`, so an account from before Phase 18 — which has no stored
    // preference — reads as the default rather than as opted out.
    emailPreferences: { cartReminders: user.emailPreferences?.cartReminders !== false },
    createdAt: (user.createdAt ?? new Date()).toISOString(),
    addresses: user.addresses.map(toSafeAddress),
  };
}

function toSafeAddress(address: UserAddress): SafeAddress {
  return {
    id: String(address._id),
    label: address.label,
    fullName: address.fullName,
    phone: address.phone,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2,
    landmark: address.landmark,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
    isDefault: address.isDefault,
  };
}

async function loadUser(userId: string): Promise<UserDoc> {
  const user = await User.findById(userId);
  if (!user) throw new AppError('Account not found', 404);
  return user;
}

export async function getProfile(userId: string): Promise<SafeUser> {
  return toSafeUser(await loadUser(userId));
}

export async function updateProfile(
  env: Env,
  userId: string,
  input: UpdateProfileInput,
): Promise<SafeUser> {
  const user = await loadUser(userId);

  // Assigned field by field: `set(input)` would write whatever the body carried,
  // and the validator's allowlist would be the only thing standing between a
  // client and `role`.
  if (input.firstName !== undefined) user.firstName = input.firstName;
  if (input.lastName !== undefined) user.lastName = input.lastName;
  if (input.phone !== undefined) user.phone = input.phone;
  if (input.avatar !== undefined) user.avatar = input.avatar;

  /**
   * The name lives in Clerk too — its profile and its emails show it — so a
   * change made here is written there first. Otherwise the next change made
   * in Clerk would sync the old name back over this one.
   */
  if (user.clerkId && (user.isModified('firstName') || user.isModified('lastName'))) {
    await pushName(env, user.clerkId, { firstName: user.firstName, lastName: user.lastName });
  }

  await user.save();
  return toSafeUser(user);
}

export async function updatePreferences(
  userId: string,
  input: UpdatePreferencesInput,
): Promise<SafeUser> {
  const user = await loadUser(userId);

  user.set('emailPreferences.cartReminders', input.cartReminders);
  await user.save();

  return toSafeUser(user);
}

/**
 * Switches cart reminders off from the link at the foot of one, with no
 * sign-in.
 *
 * The link's signature is the authority; see `utils/signed-links.ts`. A link
 * for an account that no longer exists, or one that has been tampered with, is
 * refused with the same message, and applying it twice is harmless.
 */
export async function optOutOfCartReminders(
  secret: string,
  userId: string,
  signature: string,
): Promise<void> {
  if (!isObjectId(userId) || !verifyLink(secret, 'cart-reminders-opt-out', userId, signature)) {
    throw new AppError('This link is not valid. You can change reminders from your account.', 400);
  }

  const result = await User.updateOne(
    { _id: userId },
    { $set: { 'emailPreferences.cartReminders': false } },
  );

  if (result.matchedCount === 0) {
    throw new AppError('This link is not valid. You can change reminders from your account.', 400);
  }
}

// ------------------------------------------------------------------ addresses

/**
 * Enforces the one-default rule in a single place. Called after any write that
 * could leave the list with none or several, so the invariant holds no matter
 * which operation ran.
 */
function reconcileDefault(user: UserDoc, preferredId?: string): void {
  if (user.addresses.length === 0) return;

  const preferred =
    (preferredId && user.addresses.find((entry) => String(entry._id) === preferredId)) ||
    user.addresses.find((entry) => entry.isDefault) ||
    user.addresses[0];

  for (const address of user.addresses) {
    address.isDefault = address === preferred;
  }
}

export async function listAddresses(userId: string): Promise<SafeAddress[]> {
  const user = await loadUser(userId);
  return user.addresses.map(toSafeAddress);
}

export async function createAddress(
  userId: string,
  input: CreateAddressInput,
): Promise<SafeAddress[]> {
  const user = await loadUser(userId);

  // The first address is always the default — a customer should never have to
  // set one manually just to check out.
  const isFirst = user.addresses.length === 0;
  user.addresses.push({ ...input, isDefault: isFirst || input.isDefault === true });

  const created = user.addresses[user.addresses.length - 1]!;
  reconcileDefault(user, created.isDefault ? String(created._id) : undefined);

  await user.save();
  return user.addresses.map(toSafeAddress);
}

/** Shared ownership check: an address is only ever reachable through its owner. */
function findAddress(user: UserDoc, addressId: string) {
  if (!isObjectId(addressId)) throw new AppError('Address not found', 404);

  const address = user.addresses.find((entry) => String(entry._id) === addressId);
  if (!address) throw new AppError('Address not found', 404);

  return address;
}

export async function updateAddress(
  userId: string,
  addressId: string,
  input: UpdateAddressInput,
): Promise<SafeAddress[]> {
  const user = await loadUser(userId);
  const address = findAddress(user, addressId);

  address.set(input);
  reconcileDefault(user, input.isDefault === true ? addressId : undefined);

  await user.save();
  return user.addresses.map(toSafeAddress);
}

export async function deleteAddress(userId: string, addressId: string): Promise<SafeAddress[]> {
  const user = await loadUser(userId);
  findAddress(user, addressId);

  user.addresses = user.addresses.filter(
    (entry) => String(entry._id) !== addressId,
  ) as UserDoc['addresses'];

  // Removing the default promotes the next address rather than leaving none.
  reconcileDefault(user);

  await user.save();
  return user.addresses.map(toSafeAddress);
}

export async function setDefaultAddress(userId: string, addressId: string): Promise<SafeAddress[]> {
  const user = await loadUser(userId);
  findAddress(user, addressId);

  reconcileDefault(user, addressId);

  await user.save();
  return user.addresses.map(toSafeAddress);
}
