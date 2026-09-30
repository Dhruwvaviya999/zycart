/** Whether the store offers virtual try-on, and what this visitor has left today. */
export interface TryOnStatus {
  available: boolean;
  /** Who the photo is sent to — named in the consent box. Null when unavailable. */
  processor: string | null;
  dailyLimit: number;
  /** Null for a visitor who is not signed in: try-on needs an account. */
  remainingToday: number | null;
}

/** Where on the person the product was placed. Decided on the server. */
export type TryOnPlacement =
  | 'clothing'
  | 'footwear'
  | 'eyewear'
  | 'wristwear'
  | 'bag'
  | 'headwear'
  | 'jewellery'
  | 'accessory';

export interface TryOnResult {
  /** A `data:` URL. The picture is never stored anywhere. */
  image: string;
  placement: TryOnPlacement;
  dailyLimit: number;
  remainingToday: number;
}
