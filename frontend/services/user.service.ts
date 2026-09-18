import { request, send, sendMessage, type RequestOptions } from '@/services/api';
import type {
  Address,
  AddressInput,
  AuthUser,
  ChangePasswordInput,
  UpdateProfileInput,
} from '@/types/user';

export function getProfile(options?: RequestOptions): Promise<AuthUser> {
  return request<AuthUser>('/api/users/me', undefined, options);
}

export function updateProfile(input: UpdateProfileInput): Promise<AuthUser> {
  return send<AuthUser>('patch', '/api/users/me', input);
}

export function changePassword(input: ChangePasswordInput): Promise<string> {
  return sendMessage('patch', '/api/users/me/password', input);
}

// Every address write answers with the full list, so the client never has to
// reconstruct what the default-address rules did on the server.

export function getAddresses(options?: RequestOptions): Promise<Address[]> {
  return request<Address[]>('/api/users/me/addresses', undefined, options);
}

export function createAddress(input: AddressInput): Promise<Address[]> {
  return send<Address[]>('post', '/api/users/me/addresses', input);
}

export function updateAddress(addressId: string, input: Partial<AddressInput>): Promise<Address[]> {
  return send<Address[]>('patch', `/api/users/me/addresses/${addressId}`, input);
}

export function deleteAddress(addressId: string): Promise<Address[]> {
  return send<Address[]>('delete', `/api/users/me/addresses/${addressId}`);
}

export function setDefaultAddress(addressId: string): Promise<Address[]> {
  return send<Address[]>('patch', `/api/users/me/addresses/${addressId}/default`);
}
