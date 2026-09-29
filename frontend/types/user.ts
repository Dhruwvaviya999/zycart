export type UserRole = 'USER' | 'ADMIN';

export interface Address {
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

/**
 * Exactly what `GET /api/auth/me` returns. The API never sends a password hash
 * or a token, so there is nothing sensitive to keep out of client state.
 */
export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  avatar: string;
  role: UserRole;
  isActive: boolean;
  isEmailVerified: boolean;
  /** The optional messages this customer has agreed to. Transactional mail is not optional. */
  emailPreferences: EmailPreferences;
  createdAt: string;
  addresses: Address[];
}

export interface EmailPreferences {
  cartReminders: boolean;
}

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  avatar?: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

/** What the address form collects; the server assigns the id. */
export type AddressInput = Omit<Address, 'id'>;

/** Display helpers that would otherwise be repeated in every account surface. */
export const fullName = (user: Pick<AuthUser, 'firstName' | 'lastName'>): string =>
  `${user.firstName} ${user.lastName}`.trim();

export const initials = (user: Pick<AuthUser, 'firstName' | 'lastName'>): string =>
  `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase() || '?';
