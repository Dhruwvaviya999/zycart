import type { CategoryDef } from '../types';
import { brands, byTier, LEATHER_COLORS, paragraph, refCode, spec } from './helpers';

const DIALS = [
  'Black',
  'Blue',
  'White',
  'Silver',
  'Green',
  'Champagne',
  'Grey',
  'Mother of Pearl',
  'Rose Gold',
];

export const accessories: CategoryDef = {
  slug: 'accessories',
  name: 'Accessories',
  description: 'Watches, sunglasses, bags, wallets and belts',
  image:
    'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=700&q=80',
  gstRate: 18,
  hsnCode: '4202',
  tryOnEnabled: true,
  code: 'ACS',
  weight: 10,
  reviewScale: 700,
  subcategories: [
    {
      key: 'watches',
      name: 'Watches',
      code: 'WCH',
      weight: 9,
      images: 'watches',
      brands: brands(
        ['Titan', 'mid', 3],
        ['Fastrack', 'budget', 3],
        ['Sonata', 'budget', 2],
        ['Casio', 'mid', 3],
        ['Fossil', 'premium', 2],
        ['Timex', 'mid', 2],
        ['Tommy Hilfiger', 'premium', 1],
        ['Daniel Wellington', 'premium', 1],
        ['Seiko', 'premium', 1],
        ['Citizen', 'premium', 1],
      ),
      discount: [0.05, 0.45],
      stockScale: 50,
      build({ rng, brand }) {
        const gender = rng.weighted([
          ['Men', 3],
          ['Women', 2],
        ] as const);
        const type = rng.pick([
          'Analog',
          'Chronograph',
          'Analog-Digital',
          'Automatic',
          'Multifunction',
          'Digital',
        ]);
        const dial = rng.pick(DIALS);
        const strap = rng.pick(['Stainless Steel', 'Leather', 'Silicone', 'Mesh', 'Ceramic']);
        const caseMm = gender === 'Men' ? rng.pick([40, 42, 44, 45]) : rng.pick([28, 32, 34, 36]);
        const wr = rng.pick([30, 50, 100, 200]);
        const movement =
          type === 'Automatic'
            ? 'Automatic'
            : brand.name === 'Citizen' && rng.chance(0.5)
              ? 'Eco-Drive (solar)'
              : 'Quartz';
        const refPatterns: Record<string, string> = {
          Titan: '####SM##',
          Fastrack: '3###SL##',
          Sonata: '7###YM##',
          Casio: 'MTP-####D-#A',
          Fossil: 'FS####',
          Timex: 'TW#A#####',
          'Tommy Hilfiger': '1######',
          'Daniel Wellington': 'DW00100###',
          Seiko: 'SRPD##K#',
          Citizen: 'BM####-##E',
        };
        const ref = refCode(rng, refPatterns[brand.name] ?? 'AA####');
        const mrp =
          byTier(brand.tier, 1995, 6495, 14995) *
          (type === 'Automatic' ? 2.2 : type === 'Chronograph' ? 1.4 : 1) *
          rng.float(0.85, 1.2);
        return {
          name: `${brand.name} ${type} ${dial} Dial ${gender === 'Men' ? "Men's" : "Women's"} Watch with ${strap} Strap - ${ref}`,
          mrp,
          shortDescription: `${caseMm}mm ${type.toLowerCase()} watch, ${dial.toLowerCase()} dial, ${strap.toLowerCase()} strap, ${wr}m water resistance.`,
          description: paragraph(
            rng,
            [
              `A ${type.toLowerCase()} watch from ${brand.name} with a ${dial.toLowerCase()} dial in a ${caseMm}mm case, on a ${strap.toLowerCase()} strap.`,
            ],
            [
              `${movement} movement keeps accurate time.`,
              `Water resistant to ${wr} metres — ${wr >= 100 ? 'fine for swimming' : 'splash and rain proof'}.`,
              'Mineral crystal glass resists everyday scratches.',
              'Luminous hands make it readable in the dark.',
              'Arrives in a branded gift box with a warranty card.',
            ],
            3,
          ),
          highlights: [
            `${caseMm}mm case`,
            `${dial} dial`,
            `${strap} strap`,
            `${wr}m water resistance`,
            `${movement} movement`,
          ],
          specifications: [
            spec('Display', type === 'Digital' ? 'Digital' : type),
            spec('Movement', movement),
            spec('Dial Colour', dial),
            spec('Case Size', `${caseMm} mm`),
            spec('Strap Material', strap),
            spec('Water Resistance', `${wr} m`),
            spec('Model Number', ref),
            spec('Gender', gender),
            spec('Warranty', `${rng.pick([1, 2])} year manufacturer warranty`),
          ],
          tags: [
            'watch',
            'wrist watch',
            `${type.toLowerCase()} watch`,
            gender.toLowerCase(),
            strap.toLowerCase(),
          ],
        };
      },
    },
    {
      key: 'sunglasses',
      name: 'Sunglasses',
      code: 'SUN',
      weight: 6,
      images: 'sunglasses',
      brands: brands(
        ['Ray-Ban', 'premium', 2],
        ['Fastrack', 'budget', 3],
        ['Vincent Chase', 'budget', 3],
        ['IDEE', 'mid', 2],
        ['Carrera', 'premium', 1],
        ['Oakley', 'premium', 1],
        ['Polaroid', 'mid', 2],
      ),
      discount: [0.1, 0.6],
      stockScale: 70,
      build({ rng, brand }) {
        const shape = rng.pick([
          'Aviator',
          'Wayfarer',
          'Round',
          'Square',
          'Cat-Eye',
          'Rectangular',
          'Clubmaster',
          'Oversized',
        ]);
        const lens = rng.pick([
          'Polarized',
          'UV400 Protected',
          'Gradient',
          'Mirrored',
          'Photochromic',
        ]);
        const frame = rng.pick(['Metal', 'Acetate', 'TR90', 'Titanium']);
        const frameColor = rng.pick([
          'Gold',
          'Gunmetal',
          'Matte Black',
          'Tortoise',
          'Silver',
          'Transparent',
        ]);
        const lensColor = rng.pick(['Green', 'Grey', 'Brown', 'Blue Mirror', 'Black']);
        const refPatterns: Record<string, string> = {
          'Ray-Ban': 'RB####',
          Fastrack: 'P###BK#',
          'Vincent Chase': 'VC S#####',
          IDEE: 'IDS####C#SG',
          Carrera: 'CA ###/S',
          Oakley: 'OO####',
          Polaroid: 'PLD ####/S',
        };
        const ref = refCode(rng, refPatterns[brand.name] ?? 'AA####');
        const mrp =
          byTier(brand.tier, 999, 2499, 7990) *
          (lens === 'Polarized' ? 1.3 : 1) *
          rng.float(0.85, 1.2);
        return {
          name: `${brand.name} ${lens} ${shape} Sunglasses (${frameColor} Frame, ${lensColor} Lens) - ${ref}`,
          mrp,
          shortDescription: `${shape.toLowerCase()} sunglasses with ${lens.toLowerCase()} ${lensColor.toLowerCase()} lenses and a ${frame.toLowerCase()} frame.`,
          description: paragraph(
            rng,
            [
              `${brand.name} ${shape.toLowerCase()} sunglasses with ${lens.toLowerCase()} lenses in a ${frameColor.toLowerCase()} ${frame.toLowerCase()} frame.`,
            ],
            [
              '100% UV protection shields your eyes from harmful rays.',
              lens === 'Polarized'
                ? 'Polarized lenses cut glare from roads, water and glass.'
                : 'Lenses reduce brightness without distorting colour.',
              'Adjustable nose pads and spring hinges give a comfortable all-day fit.',
              'Comes with a hard case and a microfibre cleaning cloth.',
            ],
            2,
          ),
          highlights: [shape, lens, `${frame} frame`, '100% UV protection'],
          specifications: [
            spec('Frame Shape', shape),
            spec('Lens Type', lens),
            spec('Frame Material', frame),
            spec('Frame Colour', frameColor),
            spec('Lens Colour', lensColor),
            spec('Model Number', ref),
            spec('Gender', 'Unisex'),
          ],
          tags: ['sunglasses', 'eyewear', shape.toLowerCase(), lens.toLowerCase(), 'uv protection'],
        };
      },
    },
    {
      key: 'handbags',
      name: 'Handbags',
      code: 'BAG',
      weight: 6,
      images: 'handbags',
      brands: brands(
        ['Lavie', 'mid', 3],
        ['Caprese', 'mid', 3],
        ['Baggit', 'budget', 2],
        ['Hidesign', 'premium', 2],
        ['Accessorize London', 'mid', 1],
        ['Da Milano', 'premium', 1],
        ['Miraggio', 'budget', 2],
      ),
      discount: [0.2, 0.65],
      stockScale: 50,
      build({ rng, brand }) {
        const type = rng.pick([
          'Tote Bag',
          'Sling Bag',
          'Satchel',
          'Shoulder Bag',
          'Hobo Bag',
          'Clutch',
          'Top-Handle Bag',
        ]);
        const material =
          brand.tier === 'premium'
            ? rng.pick(['Genuine Leather', 'Full-Grain Leather'])
            : rng.pick(['Vegan Leather', 'PU', 'Faux Croc PU', 'Quilted PU']);
        const color = rng.pick([
          ...LEATHER_COLORS,
          { name: 'Blush Pink', hex: '#E8B4B8' },
          { name: 'Olive', hex: '#6B7B3A' },
          { name: 'Off White', hex: '#F2EFE6' },
          { name: 'Teal', hex: '#00807F' },
        ]);
        const size = rng.pick(['Small', 'Medium', 'Large']);
        const mrp =
          byTier(brand.tier, 1499, 2999, 8999) *
          (size === 'Large' ? 1.2 : size === 'Small' ? 0.85 : 1) *
          rng.float(0.85, 1.2);
        return {
          name: `${brand.name} Women's ${size} ${material} ${type} (${color.name})`,
          mrp,
          shortDescription: `${size.toLowerCase()} ${material.toLowerCase()} ${type.toLowerCase()} with a zip closure and inner organiser pockets.`,
          description: paragraph(
            rng,
            [
              `A ${size.toLowerCase()} ${type.toLowerCase()} from ${brand.name} in ${color.name.toLowerCase()} ${material.toLowerCase()}.`,
            ],
            [
              'A zip closure keeps essentials secure.',
              'Inside you get a zip pocket and two slip pockets for phone and cards.',
              type === 'Clutch'
                ? 'A detachable chain strap lets you carry it on the shoulder.'
                : 'An adjustable, detachable strap gives you two ways to carry it.',
              'Sturdy metal hardware with an antique finish.',
              "Fits a 10-inch tablet, a water bottle and the day's essentials.",
            ],
            3,
          ),
          highlights: [type, material, `${size} size`, 'Zip closure'],
          specifications: [
            spec('Type', type),
            spec('Material', material),
            spec('Size', size),
            spec('Closure', 'Zip'),
            spec('Compartments', String(rng.int(2, 4))),
            spec('Colour', color.name),
            spec('Gender', 'Women'),
          ],
          tags: ['handbag', 'bag', type.toLowerCase(), 'women', material.toLowerCase()],
          colors: [color],
        };
      },
    },
    {
      key: 'backpacks',
      name: 'Backpacks',
      code: 'BPK',
      weight: 5,
      images: 'backpacks',
      brands: brands(
        ['Wildcraft', 'mid', 3],
        ['American Tourister', 'mid', 3],
        ['Skybags', 'budget', 3],
        ['Safari', 'budget', 2],
        ['Mokobara', 'premium', 1],
        ['Nike', 'mid', 1],
        ['Puma', 'mid', 1],
        ['HP', 'budget', 1],
      ),
      discount: [0.25, 0.65],
      stockScale: 80,
      build({ rng, brand }) {
        const litres = rng.pick([20, 24, 28, 30, 32, 35, 40]);
        const laptop = rng.pick(['14"', '15.6"', '16"']);
        const style = rng.pick([
          'Laptop Backpack',
          'Casual Backpack',
          'Travel Backpack',
          'Anti-Theft Backpack',
          'Rucksack',
        ]);
        const color = rng.pick(['Black', 'Navy', 'Grey', 'Olive', 'Teal', 'Maroon']);
        const mrp =
          byTier(brand.tier, 1299, 2499, 5999) * (litres / 30) ** 0.5 * rng.float(0.85, 1.2);
        return {
          name: `${brand.name} ${litres}L ${style} with ${laptop} Laptop Sleeve (${color})`,
          mrp,
          shortDescription: `${litres} litre water-resistant backpack with a padded ${laptop} laptop compartment and USB charging port.`,
          description: paragraph(
            rng,
            [
              `The ${brand.name} ${style.toLowerCase()} has ${litres} litres of space and a padded compartment for laptops up to ${laptop}.`,
            ],
            [
              'Water-resistant polyester keeps your things dry in a light shower.',
              'Padded, breathable shoulder straps and back panel for daily commutes.',
              'Multiple organiser pockets for chargers, pens and a water bottle.',
              'A built-in USB port lets you charge your phone from a power bank inside.',
              'Comes with a rain cover tucked in the base.',
            ],
            3,
          ),
          highlights: [
            `${litres} L capacity`,
            `Fits ${laptop} laptops`,
            'Water resistant',
            'Padded straps',
          ],
          specifications: [
            spec('Capacity', `${litres} L`),
            spec('Laptop Compartment', `Up to ${laptop}`),
            spec('Material', 'Polyester'),
            spec('Water Resistant', 'Yes'),
            spec('Compartments', String(rng.int(2, 4))),
            spec('Colour', color),
            spec('Warranty', `${rng.pick([1, 2, 3])} year warranty`),
          ],
          tags: ['backpack', 'bag', 'laptop bag', style.toLowerCase(), 'travel', 'college bag'],
        };
      },
    },
    {
      key: 'wallets and belts',
      name: 'Wallets & Belts',
      code: 'WLT',
      weight: 5,
      images: 'wallets',
      brands: brands(
        ['Tommy Hilfiger', 'premium', 2],
        ['Woodland', 'mid', 2],
        ['Allen Solly', 'mid', 2],
        ['Hidesign', 'premium', 1],
        ['WildHorn', 'budget', 3],
        ['Urban Forest', 'budget', 2],
        ["Levi's", 'mid', 2],
      ),
      discount: [0.2, 0.65],
      stockScale: 100,
      build({ rng, brand }) {
        const belt = rng.chance(0.45);
        const color = rng.pick(LEATHER_COLORS);
        const material = rng.pick([
          'Genuine Leather',
          'Full-Grain Leather',
          'Crunch Leather',
          'Saffiano Leather',
        ]);
        if (belt) {
          const type = rng.pick(['Formal Belt', 'Reversible Belt', 'Casual Belt', 'Braided Belt']);
          const width = rng.pick([30, 35, 38, 40]);
          const mrp = byTier(brand.tier, 799, 1499, 3499) * rng.float(0.85, 1.2);
          return {
            name: `${brand.name} Men's ${material} ${type}, ${width}mm (${color.name})`,
            mrp,
            shortDescription: `${width}mm ${material.toLowerCase()} ${type.toLowerCase()} with a brushed metal buckle.`,
            description: paragraph(
              rng,
              [
                `A ${width}mm ${type.toLowerCase()} from ${brand.name} in ${material.toLowerCase()} with a brushed metal pin buckle.`,
              ],
              [
                'Cut-to-fit length suits waist sizes 28 to 40.',
                'Edges are painted and burnished to resist fraying.',
                type === 'Reversible Belt'
                  ? 'Twist the buckle to switch between black and brown.'
                  : 'Works with trousers and jeans alike.',
                'Arrives in a gift box.',
              ],
              2,
            ),
            highlights: [material, `${width}mm width`, type, 'Fits waist 28–40'],
            specifications: [
              spec('Type', type),
              spec('Material', material),
              spec('Width', `${width} mm`),
              spec('Buckle', 'Pin buckle, brushed metal'),
              spec('Colour', color.name),
              spec('Gender', 'Men'),
            ],
            tags: ['belt', 'leather belt', type.toLowerCase(), 'men', 'accessories'],
            colors: [color],
            images: 'belts',
          };
        }
        const type = rng.pick([
          'Bi-Fold Wallet',
          'Tri-Fold Wallet',
          'Card Holder',
          'Coin Pocket Wallet',
          'Slim Wallet',
        ]);
        const slots = rng.int(4, 12);
        const mrp = byTier(brand.tier, 599, 1299, 2999) * rng.float(0.85, 1.2);
        return {
          name: `${brand.name} Men's RFID-Blocking ${material} ${type} with ${slots} Card Slots (${color.name})`,
          mrp,
          shortDescription: `${material.toLowerCase()} ${type.toLowerCase()} with ${slots} card slots and RFID protection.`,
          description: paragraph(
            rng,
            [
              `A slim ${type.toLowerCase()} from ${brand.name} in ${material.toLowerCase()}, with ${slots} card slots and a full-length note compartment.`,
            ],
            [
              'RFID-blocking lining protects contactless cards from skimming.',
              'Slim enough for a front pocket.',
              'Leather develops a rich patina with use.',
              'Arrives in a gift box — an easy present.',
            ],
            2,
          ),
          highlights: [material, `${slots} card slots`, 'RFID blocking', type],
          specifications: [
            spec('Type', type),
            spec('Material', material),
            spec('Card Slots', String(slots)),
            spec('RFID Protection', 'Yes'),
            spec('Colour', color.name),
            spec('Gender', 'Men'),
          ],
          tags: ['wallet', 'leather wallet', type.toLowerCase(), 'men', 'rfid'],
          colors: [color],
        };
      },
    },
  ],
};
