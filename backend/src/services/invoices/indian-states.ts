/**
 * India's states and union territories, with the two-digit codes GST uses.
 *
 * ## Why an invoice needs this
 *
 * Whether a sale is taxed as CGST + SGST or as IGST depends on one comparison:
 * is the place of supply in the seller's state? The seller's state is fixed —
 * it is the first two digits of the store's GSTIN. The buyer's is whatever they
 * typed into the address form, which is free text: "Gujarat", "gujarat ",
 * "GJ", "Orissa", "NCT of Delhi". So the comparison is made between codes, and
 * this file is what turns what a customer typed into a code.
 *
 * An address that resolves to nothing is treated as another state — IGST — and
 * the invoice prints the state exactly as it was written. IGST on what was
 * really an intra-state sale is a classification a store's accountant can
 * correct; inventing a state the customer never wrote is not.
 */

export interface IndianState {
  /** The GST state code, as printed on an invoice: `24`. */
  code: string;
  name: string;
  /** Other ways people write it: the vehicle-registration code, old names. */
  aliases: readonly string[];
}

export const INDIAN_STATES: readonly IndianState[] = [
  { code: '01', name: 'Jammu and Kashmir', aliases: ['jk', 'j&k'] },
  { code: '02', name: 'Himachal Pradesh', aliases: ['hp'] },
  { code: '03', name: 'Punjab', aliases: ['pb'] },
  { code: '04', name: 'Chandigarh', aliases: ['ch'] },
  { code: '05', name: 'Uttarakhand', aliases: ['uk', 'ua', 'uttaranchal'] },
  { code: '06', name: 'Haryana', aliases: ['hr'] },
  { code: '07', name: 'Delhi', aliases: ['dl', 'new delhi', 'nct of delhi', 'nct delhi'] },
  { code: '08', name: 'Rajasthan', aliases: ['rj'] },
  { code: '09', name: 'Uttar Pradesh', aliases: ['up'] },
  { code: '10', name: 'Bihar', aliases: ['br'] },
  { code: '11', name: 'Sikkim', aliases: ['sk'] },
  { code: '12', name: 'Arunachal Pradesh', aliases: ['ar'] },
  { code: '13', name: 'Nagaland', aliases: ['nl'] },
  { code: '14', name: 'Manipur', aliases: ['mn'] },
  { code: '15', name: 'Mizoram', aliases: ['mz'] },
  { code: '16', name: 'Tripura', aliases: ['tr'] },
  { code: '17', name: 'Meghalaya', aliases: ['ml'] },
  { code: '18', name: 'Assam', aliases: ['as'] },
  { code: '19', name: 'West Bengal', aliases: ['wb'] },
  { code: '20', name: 'Jharkhand', aliases: ['jh'] },
  { code: '21', name: 'Odisha', aliases: ['od', 'or', 'orissa'] },
  { code: '22', name: 'Chhattisgarh', aliases: ['cg', 'ct', 'chattisgarh'] },
  { code: '23', name: 'Madhya Pradesh', aliases: ['mp'] },
  { code: '24', name: 'Gujarat', aliases: ['gj'] },
  {
    code: '26',
    name: 'Dadra and Nagar Haveli and Daman and Diu',
    aliases: ['dn', 'dd', 'dnhdd', 'daman and diu', 'dadra and nagar haveli', 'daman', 'diu'],
  },
  { code: '27', name: 'Maharashtra', aliases: ['mh'] },
  { code: '29', name: 'Karnataka', aliases: ['ka'] },
  { code: '30', name: 'Goa', aliases: ['ga'] },
  { code: '31', name: 'Lakshadweep', aliases: ['ld'] },
  { code: '32', name: 'Kerala', aliases: ['kl'] },
  { code: '33', name: 'Tamil Nadu', aliases: ['tn'] },
  { code: '34', name: 'Puducherry', aliases: ['py', 'pondicherry'] },
  {
    code: '35',
    name: 'Andaman and Nicobar Islands',
    aliases: ['an', 'andaman and nicobar', 'andaman'],
  },
  { code: '36', name: 'Telangana', aliases: ['ts', 'tg'] },
  { code: '37', name: 'Andhra Pradesh', aliases: ['ap'] },
  { code: '38', name: 'Ladakh', aliases: ['la'] },
];

/**
 * Letters only, lower-case, `&` read as "and": `"Jammu & Kashmir "` and
 * `"jammu and kashmir"` are the same key.
 */
function keyOf(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z]/g, '');
}

const BY_KEY = new Map<string, IndianState>();

for (const state of INDIAN_STATES) {
  BY_KEY.set(keyOf(state.name), state);
  for (const alias of state.aliases) BY_KEY.set(keyOf(alias), state);
}

const BY_CODE = new Map(INDIAN_STATES.map((state) => [state.code, state]));

/** What a customer typed, as a state — or null when it is not one this table knows. */
export function resolveState(value: string | null | undefined): IndianState | null {
  if (!value) return null;

  const trimmed = value.trim();

  // A bare code is accepted too: some people write "24" for Gujarat.
  if (/^\d{1,2}$/.test(trimmed)) return BY_CODE.get(trimmed.padStart(2, '0')) ?? null;

  return BY_KEY.get(keyOf(trimmed)) ?? null;
}

/** The state a GSTIN was registered in: its first two digits. */
export function stateOfGstin(gstin: string | null | undefined): IndianState | null {
  if (!gstin || gstin.length < 2) return null;
  return BY_CODE.get(gstin.slice(0, 2)) ?? null;
}
