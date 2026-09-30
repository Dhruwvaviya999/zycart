/**
 * The instruction a virtual try-on sends with the two photos.
 *
 * ## Why the wording is this specific
 *
 * An image model asked to "put this on this person" will happily improve the
 * person too — slimmer, smoother, taller, a different background. For a shop
 * that is the one failure that matters: a customer deciding whether something
 * suits *them* must see themselves, not a flattering stranger wearing it. So
 * most of this prompt is about what must not change, and it says so in plain
 * terms rather than trusting the model's defaults.
 *
 * ## Why the placement is decided here
 *
 * "Wear this" means different things for a jacket, a pair of shoes and a pair
 * of sunglasses. The product's own words — its name, tags and category — say
 * which, and naming the placement explicitly is what stops a model putting a
 * watch on somebody's ankle or laying a bag across their shoulders like a
 * scarf. Everything here is pure, so each placement can be tested.
 */

export type Placement =
  | 'clothing'
  | 'footwear'
  | 'eyewear'
  | 'wristwear'
  | 'bag'
  | 'headwear'
  | 'jewellery'
  | 'accessory';

/** What the prompt needs to know about the product. Read from the catalogue, never from a request. */
export interface TryOnSubject {
  productName: string;
  brand: string;
  categoryName: string;
  categorySlug: string;
  tags: readonly string[];
  /** The colourway the customer has chosen, when the product has several. */
  colour: { name: string; hex: string } | null;
}

/**
 * Whole-word patterns, tried in order.
 *
 * Word boundaries matter: a bare substring test would find "ring" in
 * "earring", "spring" and "string", and "band" in "headband" and "resistance
 * band". The first pattern to match wins, so the specific ones come first.
 */
const PLACEMENT_PATTERNS: readonly (readonly [Placement, RegExp])[] = [
  ['eyewear', /\b(sunglass(es)?|glasses|eyewear|spectacles|shades|aviators?)\b/],
  ['wristwear', /\b(watch(es)?|smartwatch|bracelets?|bangles?|wristbands?)\b/],
  [
    'footwear',
    /\b(shoes?|sneakers?|trainers?|boots?|sandals?|loafers?|heels|slippers?|footwear)\b/,
  ],
  ['bag', /\b(bags?|backpacks?|totes?|handbags?|satchels?|clutch(es)?|duffels?|rucksacks?)\b/],
  ['headwear', /\b(caps?|hats?|beanies?|headbands?|berets?)\b/],
  ['jewellery', /\b(necklaces?|pendants?|earrings?|rings?|chains?|jewell?ery)\b/],
];

const FOOTWEAR_CATEGORY = /\b(footwear|shoes?)\b/;
const CLOTHING_CATEGORY = /\b(fashion|apparel|clothing|men|women|kids)\b/;

/**
 * Where on the person the product goes.
 *
 * A footwear category is decisive: everything in it goes on the feet, and a
 * "cap-toe" shoe must not be read as a cap. Otherwise the product's own name
 * and tags come before its category, because they are more specific — a pair
 * of sunglasses filed under "Accessories" is still eyewear — and an apparel
 * category settles it when they say nothing.
 */
export function placementOf(
  subject: Pick<TryOnSubject, 'productName' | 'tags' | 'categoryName' | 'categorySlug'>,
): Placement {
  const category = `${subject.categorySlug} ${subject.categoryName}`.toLowerCase();

  if (FOOTWEAR_CATEGORY.test(category)) return 'footwear';

  const words = [subject.productName, ...subject.tags].join(' ').toLowerCase();

  for (const [placement, pattern] of PLACEMENT_PATTERNS) {
    if (pattern.test(words)) return placement;
  }

  return CLOTHING_CATEGORY.test(category) ? 'clothing' : 'accessory';
}

const PLACEMENT_INSTRUCTION: Record<Placement, string> = {
  clothing:
    'Dress the person in this garment. It replaces whatever they are wearing in the same place: a ' +
    'top replaces their top, trousers replace their trousers, and a jacket, coat or dress is worn ' +
    'as it would be in life.',
  footwear: "Put these shoes on the person's feet, as a pair.",
  eyewear: "Place these glasses on the person's face, resting naturally on the nose and ears.",
  wristwear: "Put this on the person's wrist.",
  bag:
    'Have the person carry this bag the way it is designed to be carried — on the shoulder, in ' +
    'the hand, on the back or across the body.',
  headwear: "Put this on the person's head.",
  jewellery: 'Have the person wear this jewellery where it is designed to be worn.',
  accessory: 'Have the person wear or carry this item the way it is designed to be used.',
};

/**
 * The instruction itself.
 *
 * Refers to the photos by position — the service always sends the customer
 * first and the product second — and quotes the product's name so the model
 * knows which object in a busy product shot is the one being sold.
 */
export function buildTryOnPrompt(subject: TryOnSubject): string {
  const product = [subject.brand, subject.productName].filter(Boolean).join(' ');

  return [
    'You are the virtual fitting room of an online store.',
    `The first image is a photo of a customer. The second image is the product photo of "${product}" ` +
      `(${subject.categoryName}).`,
    PLACEMENT_INSTRUCTION[placementOf(subject)],
    subject.colour
      ? `Show the product in its "${subject.colour.name}" colourway (${subject.colour.hex}).`
      : '',
    'Keep the person exactly as they are: the same face and identity, skin tone, body shape and ' +
      'proportions, hair, pose, expression and background. Do not slim, reshape, retouch or ' +
      'beautify them in any way.',
    'Reproduce the product faithfully — its colour, pattern, texture, logos and details — with a ' +
      'realistic fit and natural folds, and with lighting and shadows that match the first photo.',
    'Change nothing else, and add no text, captions, borders or watermarks.',
    'Return a single photorealistic image with the same framing as the first photo.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Where the product goes, as part of a description of the finished photo. */
const PLACEMENT_DESCRIPTION: Record<Placement, string> = {
  clothing: 'wearing the garment from image 2 in place of what they wore there in image 1',
  footwear: 'wearing the pair of shoes from image 2 on their feet',
  eyewear: 'wearing the glasses from image 2, resting naturally on the nose and ears',
  wristwear: 'wearing the item from image 2 on their wrist',
  bag: 'carrying the bag from image 2 the way it is designed to be carried',
  headwear: 'wearing the item from image 2 on their head',
  jewellery: 'wearing the jewellery from image 2 where it is designed to be worn',
  accessory: 'wearing or carrying the item from image 2 the way it is designed to be used',
};

/**
 * The same try-on, worded for a reference-image model such as FLUX.2.
 *
 * Those models are not conversational: they are told what the finished picture
 * shows, with the photos referred to as "image 1" and "image 2", and they do
 * better with what should be there than with what should not. The substance
 * is unchanged from `buildTryOnPrompt` — the customer exactly as they are, the
 * product exactly as sold — and so is the order of the photos.
 */
export function buildReferencePrompt(subject: TryOnSubject): string {
  const product = [subject.brand, subject.productName].filter(Boolean).join(' ');

  return [
    `A photorealistic photo of the person from image 1, ${PLACEMENT_DESCRIPTION[placementOf(subject)]}` +
      ` — the "${product}" (${subject.categoryName}).`,
    subject.colour
      ? `The product is in its "${subject.colour.name}" colourway (${subject.colour.hex}).`
      : '',
    'The person is exactly as in image 1: the same face and identity, skin tone, body shape and ' +
      'proportions, hair, pose, expression, background and framing, natural and unretouched.',
    'The product matches image 2 exactly — its colour, pattern, texture, logos and details — ' +
      'with a realistic fit, natural folds, and lighting and shadows that match image 1.',
    'No text, captions, borders or watermarks.',
  ]
    .filter(Boolean)
    .join(' ');
}
