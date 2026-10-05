import type { CategoryDef } from '../types';
import { brands, byTier, paragraph, spec } from './helpers';

const SKIN_TYPES = [
  'All Skin Types',
  'Oily & Acne-Prone Skin',
  'Dry Skin',
  'Combination Skin',
  'Sensitive Skin',
];

export const beauty: CategoryDef = {
  slug: 'beauty',
  name: 'Beauty',
  description: 'Skincare, makeup and fragrances',
  image:
    'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=700&q=80',
  gstRate: 18,
  hsnCode: '3304',
  tryOnEnabled: false,
  code: 'BTY',
  weight: 7,
  reviewScale: 1800,
  subcategories: [
    {
      key: 'skincare',
      name: 'Skincare',
      code: 'SKN',
      weight: 8,
      images: 'skincare',
      brands: brands(
        ['Minimalist', 'mid', 3],
        ['The Derma Co', 'mid', 3],
        ['Mamaearth', 'budget', 3],
        ['Plum', 'mid', 2],
        ['Cetaphil', 'mid', 2],
        ['CeraVe', 'premium', 2],
        ['Neutrogena', 'mid', 2],
        ['Dot & Key', 'mid', 2],
        ['Foxtale', 'budget', 2],
        ['Lakmé', 'budget', 2],
        ['Nivea', 'budget', 2],
        ['Bioderma', 'premium', 1],
        ['Forest Essentials', 'premium', 1],
        ['Kama Ayurveda', 'premium', 1],
      ),
      discount: [0.05, 0.4],
      stockScale: 220,
      lowStockThreshold: 15,
      build({ rng, brand }) {
        const actives = [
          ['10% Niacinamide', 'acne marks and oil control'],
          ['10% Vitamin C', 'brightening and dark spots'],
          ['2% Hyaluronic Acid', 'deep hydration'],
          ['2% Salicylic Acid', 'acne and blackheads'],
          ['0.3% Retinol', 'fine lines and texture'],
          ['5% Ceramides', 'barrier repair'],
          ['Kojic Acid', 'pigmentation'],
          ['Centella & Cica', 'calming irritation'],
          ['Kumkumadi', 'radiance (Ayurvedic)'],
          ['Peptide Complex', 'firmness'],
        ] as const;
        const [active, concern] = rng.pick(actives);
        const kind = rng.pick([
          ['Face Serum', '30 ml', 599],
          ['Moisturiser', '50 g', 499],
          ['Sunscreen SPF 50 PA++++', '50 g', 499],
          ['Face Wash', '100 ml', 349],
          ['Night Cream', '50 g', 699],
          ['Toner', '150 ml', 449],
          ['Under-Eye Cream', '15 ml', 599],
        ] as const);
        const [type, size, base] = kind;
        const skin = rng.pick(SKIN_TYPES);
        const mrp = base * byTier(brand.tier, 0.75, 1.1, 2.6) * rng.float(0.85, 1.2);
        return {
          name: `${brand.name} ${active} ${type} for ${concern.replace(/\b\w/g, (c) => c.toUpperCase())} - ${skin} (${size})`,
          mrp,
          shortDescription: `${active} ${type.toLowerCase()} for ${concern}, suited to ${skin.toLowerCase()}. ${size}.`,
          description: paragraph(
            rng,
            [
              `${brand.name}'s ${type.toLowerCase()} is formulated with ${active} to target ${concern}.`,
            ],
            [
              'Fragrance-free and dermatologically tested.',
              'Non-comedogenic — it will not clog pores.',
              'A lightweight texture that absorbs quickly without stickiness.',
              type.includes('Sunscreen')
                ? 'No white cast, even on deeper Indian skin tones.'
                : 'Layers well under sunscreen and makeup.',
              'Patch test before first use; introduce actives gradually.',
              'Cruelty-free and free of parabens and sulphates.',
            ],
            3,
          ),
          highlights: [active, `For ${concern}`, skin, size, 'Dermatologically tested'],
          specifications: [
            spec('Product Type', type),
            spec('Key Ingredient', active),
            spec('Concern', concern),
            spec('Skin Type', skin),
            spec('Net Quantity', size),
            spec('Shelf Life', '24 months from manufacture'),
            spec('Country of Origin', 'India'),
          ],
          tags: [
            'skincare',
            type.toLowerCase(),
            active.replace(/^[\d.]+%\s*/, '').toLowerCase(),
            concern,
            skin.toLowerCase(),
          ],
        };
      },
    },
    {
      key: 'makeup',
      name: 'Makeup',
      code: 'MKP',
      weight: 6,
      images: 'makeup',
      brands: brands(
        ['Lakmé', 'budget', 3],
        ['Maybelline New York', 'mid', 3],
        ['M.A.C', 'premium', 1],
        ['SUGAR Cosmetics', 'mid', 3],
        ['Swiss Beauty', 'budget', 2],
        ["L'Oréal Paris", 'mid', 2],
        ['Nykaa Cosmetics', 'budget', 2],
        ['Faces Canada', 'budget', 2],
        ['Kay Beauty', 'mid', 1],
        ['Huda Beauty', 'premium', 1],
      ),
      discount: [0.1, 0.45],
      stockScale: 180,
      lowStockThreshold: 15,
      build({ rng, brand }) {
        const lipShades = [
          'Ruby Red',
          'Nude Pink',
          'Mauve Muse',
          'Brick Brown',
          'Berry Crush',
          'Coral Crush',
          'Rose Taupe',
          'Cherry Bomb',
          'Toffee Nude',
        ];
        const baseShades = [
          '110 Porcelain',
          '120 Classic Ivory',
          '128 Warm Nude',
          '220 Natural Beige',
          '230 Natural Buff',
          '310 Sun Beige',
          '330 Toffee',
        ];
        const kinds = [
          ['Matte Liquid Lipstick', '4.5 ml', 499, lipShades],
          ['Creme Lipstick', '4.2 g', 449, lipShades],
          ['Kajal', '0.35 g', 249, ['Jet Black', 'Intense Black', 'Brown']],
          ['Liquid Foundation', '30 ml', 799, baseShades],
          ['Compact Powder', '9 g', 399, baseShades],
          ['Volumising Mascara', '9 ml', 549, ['Black', 'Very Black']],
          [
            'Eyeshadow Palette',
            '12 shades',
            899,
            ['Nude Edit', 'Smokey Nights', 'Sunset Glow', 'Rose Gold'],
          ],
          ['Blush', '6 g', 499, ['Peach Pop', 'Pink Petal', 'Coral Kiss', 'Berry Flush']],
        ] as const;
        const [type, size, base, shades] = rng.pick(kinds);
        const shade = rng.pick(shades);
        const shadeNo = String(rng.int(1, 40)).padStart(2, '0');
        const finish = rng.pick(['Matte', 'Satin', 'Dewy', 'Long-Wear', 'Waterproof']);
        const mrp = base * byTier(brand.tier, 0.75, 1.1, 3.2) * rng.float(0.9, 1.15);
        return {
          name: `${brand.name} ${finish} ${type} - ${shadeNo} ${shade} (${size})`,
          mrp,
          shortDescription: `${finish.toLowerCase()} ${type.toLowerCase()} in ${shade}, ${size}.`,
          description: paragraph(
            rng,
            [
              `${brand.name}'s ${finish.toLowerCase()} ${type.toLowerCase()} in shade ${shadeNo} ${shade}.`,
            ],
            [
              'Highly pigmented — one swipe gives full colour payoff.',
              'Long-wearing, transfer-resistant formula lasts up to 12 hours.',
              'Enriched with vitamin E so it does not dry out the skin.',
              'Dermatologically tested and cruelty-free.',
              'Shade suits Indian skin tones; check the shade card for the closest match.',
            ],
            3,
          ),
          highlights: [`Shade: ${shadeNo} ${shade}`, finish, size, 'Cruelty-free'],
          specifications: [
            spec('Product Type', type),
            spec('Shade', `${shadeNo} ${shade}`),
            spec('Finish', finish),
            spec('Net Quantity', size),
            spec('Shelf Life', '36 months from manufacture'),
          ],
          tags: [
            'makeup',
            'cosmetics',
            type.toLowerCase(),
            finish.toLowerCase(),
            ...(type.includes('Lip') ? ['lipstick'] : []),
          ],
        };
      },
    },
    {
      key: 'fragrances',
      name: 'Fragrances',
      code: 'FRG',
      weight: 5,
      images: 'fragrances',
      brands: brands(
        ['Bella Vita', 'budget', 3],
        ['Fogg', 'budget', 3],
        ['Wild Stone', 'budget', 2],
        ['Skinn by Titan', 'mid', 2],
        ['Engage', 'budget', 2],
        ['Villain', 'budget', 1],
        ['Davidoff', 'premium', 1],
        ['Calvin Klein', 'premium', 1],
        ['Hugo Boss', 'premium', 1],
        ['Ajmal', 'mid', 2],
        ['Nautica', 'mid', 1],
      ),
      discount: [0.1, 0.5],
      stockScale: 120,
      build({ rng, brand }) {
        const gender = rng.weighted([
          ['Men', 3],
          ['Women', 3],
          ['Unisex', 2],
        ] as const);
        const kind = rng.pick([
          ['Eau de Parfum', [50, 100], 1.4],
          ['Eau de Toilette', [50, 100], 1],
          ['Body Mist', [150, 200], 0.4],
          ['Deodorant', [150, 200], 0.3],
          ['Attar (Concentrated Perfume Oil)', [6, 12], 0.6],
        ] as const);
        const [type, sizes, factor] = kind;
        const ml = rng.pick(sizes);
        const family = rng.pick([
          'Woody',
          'Fresh Aquatic',
          'Floral',
          'Oriental',
          'Citrus',
          'Oud',
          'Musky',
          'Spicy',
        ]);
        const scent = rng.pick([
          'Oud Royale',
          'Blue Horizon',
          'Velvet Rose',
          'Midnight Musk',
          'Citrus Rush',
          'Amber Noir',
          'White Jasmine',
          'Ocean Breeze',
          'Leather Code',
          'Saffron Dream',
          'Cedar Smoke',
          'Pink Peony',
        ]);
        const notes = rng.sample(
          [
            'bergamot',
            'pink pepper',
            'lavender',
            'jasmine',
            'rose',
            'oud',
            'sandalwood',
            'vetiver',
            'amber',
            'vanilla',
            'musk',
            'cardamom',
            'saffron',
            'patchouli',
          ],
          4,
        );
        const mrp =
          byTier(brand.tier, 799, 1799, 6500) *
          factor *
          (ml / sizes[1]) ** 0.6 *
          rng.float(0.9, 1.15);
        return {
          name: `${brand.name} ${scent} ${type} for ${gender === 'Unisex' ? 'Men & Women' : gender} (${ml} ml)`,
          mrp,
          shortDescription: `${family.toLowerCase()} ${type.toLowerCase()} with notes of ${notes.slice(0, 3).join(', ')}. ${ml} ml.`,
          description: paragraph(
            rng,
            [
              `${scent} by ${brand.name} is a ${family.toLowerCase()} ${type.toLowerCase()} that opens with ${notes[0]} and ${notes[1]}, settling into ${notes[2]} and ${notes[3]}.`,
            ],
            [
              type.includes('Parfum') || type.includes('Attar')
                ? 'A high concentration of perfume oils lasts 8–10 hours on skin.'
                : 'A light, fresh projection that is easy to wear every day.',
              'Spray on pulse points — wrists, neck and behind the ears.',
              'Makes a polished gift for birthdays and anniversaries.',
              'Made in India with IFRA-compliant fragrance oils.',
            ],
            2,
          ),
          highlights: [
            `${ml} ml`,
            family,
            `Notes: ${notes.join(', ')}`,
            gender === 'Unisex' ? 'Unisex' : `For ${gender.toLowerCase()}`,
          ],
          specifications: [
            spec('Type', type),
            spec('Fragrance Family', family),
            spec('Key Notes', notes.join(', ')),
            spec('Net Quantity', `${ml} ml`),
            spec('Ideal For', gender),
            spec(
              'Longevity',
              type.includes('Parfum') || type.includes('Attar') ? '8–10 hours' : '4–6 hours',
            ),
          ],
          tags: [
            'fragrance',
            'perfume',
            type.toLowerCase(),
            family.toLowerCase(),
            gender.toLowerCase(),
          ],
        };
      },
    },
  ],
};
