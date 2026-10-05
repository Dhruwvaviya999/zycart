import type { CategoryDef } from '../types';
import { brands, byTier, paragraph, spec } from './helpers';

const WOOD_FINISHES = ['Walnut', 'Wenge', 'Natural Teak', 'Honey Oak', 'Frosty White', 'Espresso'];

export const home: CategoryDef = {
  slug: 'home',
  name: 'Home',
  description: 'Cookware, dining, furniture, bedding and decor',
  image:
    'https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=700&q=80',
  gstRate: 18,
  hsnCode: '7323',
  tryOnEnabled: false,
  code: 'HOM',
  weight: 12,
  reviewScale: 1000,
  subcategories: [
    {
      key: 'cookware',
      name: 'Cookware',
      code: 'CKW',
      weight: 8,
      images: 'cookware',
      brands: brands(
        ['Prestige', 'mid', 4],
        ['Hawkins', 'mid', 3],
        ['Pigeon', 'budget', 3],
        ['Meyer', 'premium', 1],
        ['Wonderchef', 'mid', 2],
        ['Stahl', 'premium', 1],
        ['Vinod', 'budget', 2],
      ),
      discount: [0.15, 0.6],
      stockScale: 90,
      build({ rng, brand }) {
        const kinds = [
          [
            'Non-Stick Kadai with Glass Lid',
            'Aluminium with 3-layer non-stick coating',
            () => `${rng.pick([24, 26, 28])} cm`,
            1.1,
          ],
          [
            'Non-Stick Fry Pan',
            'Aluminium with granite non-stick coating',
            () => `${rng.pick([22, 24, 26, 28])} cm`,
            0.8,
          ],
          [
            'Non-Stick Dosa Tawa',
            'Aluminium with non-stick coating',
            () => `${rng.pick([28, 30, 33])} cm`,
            0.8,
          ],
          [
            'Inner Lid Pressure Cooker',
            'Hard anodised aluminium',
            () => `${rng.pick([2, 3, 5, 6.5])} L`,
            1.4,
          ],
          [
            'Stainless Steel Pressure Cooker',
            'Tri-ply stainless steel',
            () => `${rng.pick([3, 5, 7.5])} L`,
            1.6,
          ],
          [
            'Cast Iron Skillet',
            'Pre-seasoned cast iron',
            () => `${rng.pick([20, 25, 30])} cm`,
            1.2,
          ],
          [
            'Triply Stainless Steel Cookware Set',
            'Tri-ply stainless steel',
            () => `${rng.pick([3, 4])} pieces`,
            2.6,
          ],
          [
            'Granite Cookware Set',
            'Aluminium with granite coating',
            () => `${rng.pick([3, 5, 7])} pieces`,
            2.4,
          ],
          [
            'Enamelled Cast Iron Dutch Oven',
            'Enamelled cast iron',
            () => `${rng.pick([3.5, 4.5, 5.2])} L`,
            3,
          ],
        ] as const;
        const [type, material, sizeOf, factor] = rng.pick(kinds);
        const size = sizeOf();
        const induction = !material.startsWith('Hard') || rng.chance(0.4);
        const mrp = byTier(brand.tier, 999, 1499, 3999) * factor * rng.float(0.85, 1.2);
        return {
          name: `${brand.name} ${type}, ${size}${induction ? ', Induction & Gas Compatible' : ', Gas Stove Only'}`,
          mrp,
          shortDescription: `${size} ${type.toLowerCase()} in ${material.toLowerCase()}${induction ? ', works on induction and gas' : ''}.`,
          description: paragraph(
            rng,
            [
              `The ${brand.name} ${type.toLowerCase()} is made from ${material.toLowerCase()} for even heating and everyday Indian cooking.`,
            ],
            [
              induction
                ? 'A thick induction base works on gas stoves and induction cooktops alike.'
                : 'Designed for gas stoves.',
              'Cool-touch, riveted handles stay comfortable to hold while cooking.',
              material.includes('non-stick')
                ? 'PFOA-free non-stick coating needs very little oil and cleans up easily.'
                : 'Naturally non-toxic surface — no coatings to wear away.',
              'Ideal for sabzi, dal, curries, dosas and stir-fries.',
              material.includes('Stainless')
                ? 'Dishwasher safe.'
                : 'Hand wash with a soft sponge to extend its life.',
            ],
            3,
          ),
          highlights: [
            size,
            material,
            induction ? 'Induction & gas compatible' : 'Gas stove compatible',
            `${rng.pick([1, 2, 5])} year warranty`,
          ],
          specifications: [
            spec('Type', type),
            spec('Material', material),
            spec('Size / Capacity', size),
            spec('Induction Compatible', induction ? 'Yes' : 'No'),
            spec('Dishwasher Safe', material.includes('Stainless') ? 'Yes' : 'No'),
            spec('Warranty', `${rng.pick([1, 2, 5])} year manufacturer warranty`),
          ],
          tags: [
            'cookware',
            'kitchen',
            type.toLowerCase(),
            ...(type.includes('Cooker') ? ['pressure cooker'] : []),
            ...(induction ? ['induction cookware'] : []),
          ],
        };
      },
    },
    {
      key: 'dining and drinkware',
      name: 'Dining & Drinkware',
      code: 'DIN',
      weight: 7,
      images: 'drinkware',
      brands: brands(
        ['Milton', 'budget', 3],
        ['Borosil', 'mid', 3],
        ['Cello', 'budget', 3],
        ['Larah by Borosil', 'mid', 2],
        ['Treo', 'mid', 1],
        ['Signoraware', 'budget', 2],
        ['Femora', 'budget', 1],
      ),
      discount: [0.15, 0.6],
      stockScale: 140,
      build({ rng, brand }) {
        const kinds = [
          [
            'Vacuum Insulated Stainless Steel Water Bottle',
            () => `${rng.pick([500, 750, 1000])} ml`,
            699,
          ],
          ['Opalware Dinner Set', () => `${rng.pick([18, 27, 33, 35])} pieces`, 1999],
          ['Ceramic Coffee Mug Set', () => `Set of ${rng.pick([2, 4, 6])}, 350 ml each`, 799],
          ['Glass Tumbler Set', () => `Set of 6, ${rng.pick([250, 300, 350])} ml each`, 599],
          ['Insulated Lunch Box', () => `${rng.pick([3, 4])} containers`, 899],
          ['Borosilicate Glass Storage Containers', () => `Set of ${rng.pick([3, 4, 6])}`, 1199],
          ['Stoneware Serving Bowl Set', () => `Set of ${rng.pick([2, 4])}`, 999],
        ] as const;
        const [type, sizeOf, base] = rng.pick(kinds);
        const size = sizeOf();
        const color = rng.pick([
          'Steel',
          'Black',
          'Ivory',
          'Teal',
          'Sage Green',
          'Terracotta',
          'Blue Floral',
          'Matte Grey',
        ]);
        const mrp = base * byTier(brand.tier, 0.85, 1.2, 2) * rng.float(0.85, 1.2);
        return {
          name: `${brand.name} ${type}, ${size} (${color})`,
          mrp,
          shortDescription: `${type.toLowerCase()} — ${size.toLowerCase()} — food-safe and built for daily use.`,
          description: paragraph(
            rng,
            [
              `A ${type.toLowerCase()} from ${brand.name}, ${size.toLowerCase()}, finished in ${color.toLowerCase()}.`,
            ],
            [
              type.includes('Insulated') || type.includes('Vacuum')
                ? 'Keeps drinks hot for 12 hours and cold for 24.'
                : 'Microwave and dishwasher safe.',
              'Food-grade, BPA-free materials throughout.',
              'Chip- and stain-resistant for years of daily use.',
              'Makes a practical housewarming or Diwali gift.',
              'Leak-proof lids where applicable, so nothing spills in a bag.',
            ],
            3,
          ),
          highlights: [
            size,
            'Food-grade, BPA-free',
            type.includes('Vacuum') ? 'Hot 12h, cold 24h' : 'Dishwasher safe',
          ],
          specifications: [
            spec('Type', type),
            spec('Capacity / Pieces', size),
            spec('Colour', color),
            spec('Microwave Safe', type.includes('Steel') ? 'No' : 'Yes'),
            spec('BPA Free', 'Yes'),
          ],
          tags: [
            'kitchen',
            'dining',
            type.toLowerCase(),
            ...(type.includes('Bottle') ? ['water bottle'] : []),
          ],
        };
      },
    },
    {
      key: 'furniture',
      name: 'Furniture',
      code: 'FUR',
      weight: 6,
      images: 'furniture',
      brands: brands(
        ['Wakefit', 'mid', 3],
        ['Sleepyhead', 'mid', 2],
        ['Nilkamal', 'budget', 3],
        ['Green Soul', 'mid', 2],
        ['HomeTown', 'mid', 2],
        ['Durian', 'premium', 1],
        ['Solimo', 'budget', 2],
      ),
      discount: [0.2, 0.6],
      stockScale: 25,
      lowStockThreshold: 3,
      build({ rng, brand }) {
        const kinds = [
          ['3-Seater Fabric Sofa', 'Solid wood frame, high-density foam', 24999],
          ['Ergonomic Office Chair', 'Mesh back, nylon base', 7999],
          ['Engineered Wood Study Table', 'Engineered wood (particle board)', 5999],
          ['5-Shelf Bookshelf', 'Engineered wood', 4999],
          ['Sheesham Wood Coffee Table', 'Solid sheesham wood', 8999],
          ['Accent Armchair', 'Solid wood frame, velvet upholstery', 11999],
          ['Bar Stool (Set of 2)', 'Metal frame, wooden seat', 4999],
          ['TV Unit with Storage', 'Engineered wood', 7999],
          ['Shoe Rack with Doors', 'Engineered wood', 3999],
        ] as const;
        const [type, material, base] = rng.pick(kinds);
        const finish = rng.pick(WOOD_FINISHES);
        const assembly = rng.pick([
          'DIY (tools included)',
          'Carpenter assembly provided',
          'Pre-assembled',
        ]);
        const mrp = base * byTier(brand.tier, 0.8, 1.15, 2) * rng.float(0.85, 1.2);
        return {
          name: `${brand.name} ${type} (${finish} Finish)`,
          mrp,
          shortDescription: `${type.toLowerCase()} in ${material.toLowerCase()}, ${finish.toLowerCase()} finish. ${assembly}.`,
          description: paragraph(
            rng,
            [
              `The ${brand.name} ${type.toLowerCase()} is built from ${material.toLowerCase()} with a ${finish.toLowerCase()} finish that suits modern Indian homes.`,
            ],
            [
              'Tested for daily use and rated for a generous weight capacity.',
              `Assembly: ${assembly.toLowerCase()}.`,
              'Rounded edges make it safe in homes with children.',
              'Wipe clean with a dry or slightly damp cloth.',
              'Delivered flat-packed in multi-layer protective packaging.',
            ],
            3,
          ),
          highlights: [
            material,
            `${finish} finish`,
            assembly,
            `${rng.pick([1, 3, 5])} year warranty`,
          ],
          specifications: [
            spec('Type', type),
            spec('Material', material),
            spec('Finish', finish),
            spec(
              'Dimensions (W x D x H)',
              `${rng.int(40, 210)} x ${rng.int(35, 90)} x ${rng.int(40, 180)} cm`,
            ),
            spec('Assembly', assembly),
            spec('Warranty', `${rng.pick([1, 3, 5])} year manufacturer warranty`),
          ],
          tags: [
            'furniture',
            type.toLowerCase(),
            ...(type.includes('Chair') ? ['chair'] : []),
            'home',
          ],
        };
      },
    },
    {
      key: 'bedding',
      name: 'Bedding & Mattresses',
      code: 'BED',
      weight: 7,
      images: 'bedding',
      brands: brands(
        ['Wakefit', 'mid', 3],
        ['Sleepwell', 'mid', 2],
        ['Spaces', 'mid', 2],
        ['Bombay Dyeing', 'mid', 3],
        ["D'Decor", 'premium', 1],
        ['Raymond Home', 'mid', 1],
        ['Story@Home', 'budget', 2],
        ['Solimo', 'budget', 2],
        ['The Sleep Company', 'premium', 1],
      ),
      discount: [0.25, 0.65],
      stockScale: 70,
      build({ rng, brand }) {
        const bedSize = rng.pick(['Single', 'Double', 'Queen', 'King'] as const);
        const kinds = [
          [
            `${bedSize} Bedsheet with 2 Pillow Covers`,
            () => `${rng.pick([144, 180, 210, 300, 400])} TC cotton`,
            999,
          ],
          [`${bedSize} Reversible Comforter`, () => 'Microfibre, 200 GSM fill', 1999],
          [`${bedSize} Cotton Dohar`, () => 'Mulmul cotton, 3 layers', 1299],
          [
            `${rng.pick(['Contour', 'Cervical', 'Classic', 'Cooling', 'Orthopaedic'])} Pillow (Pack of ${rng.pick([1, 2, 4])})`,
            () =>
              rng.pick([
                'Visco-elastic memory foam',
                'Gel-infused memory foam',
                'Shredded memory foam',
                'Hollow microfibre',
                'Natural latex',
              ]),
            1499,
          ],
          [
            `${bedSize} Orthopaedic Memory Foam Mattress`,
            () => `${rng.pick([5, 6, 8, 10])} inch, medium-firm`,
            12999,
          ],
        ] as const;
        const [type, materialOf, base] = rng.pick(kinds);
        const material = materialOf();
        const isMattress = type.includes('Mattress');
        const pattern = rng.pick([
          'Floral',
          'Geometric',
          'Solid',
          'Striped',
          'Paisley',
          'Abstract',
        ]);
        const color = rng.pick(['Blue', 'Grey', 'Beige', 'Pink', 'Green', 'White', 'Mustard']);
        const sizeFactor = { Single: 0.75, Double: 1, Queen: 1.15, King: 1.3 }[bedSize];
        const mrp =
          base *
          (type.includes('Pillow') ? 1 : sizeFactor) *
          byTier(brand.tier, 0.85, 1.2, 2) *
          rng.float(0.85, 1.2);
        return {
          name: `${brand.name} ${isMattress || type.includes('Pillow') ? '' : `${pattern} `}${type} - ${material}${isMattress || type.includes('Pillow') ? '' : ` (${color})`}`,
          mrp,
          shortDescription: `${type.toLowerCase()} in ${material.toLowerCase()} for restful, comfortable sleep.`,
          description: paragraph(
            rng,
            [`The ${brand.name} ${type.toLowerCase()} is made with ${material.toLowerCase()}.`],
            isMattress
              ? [
                  'Memory foam contours to your body and relieves pressure points.',
                  'A firm support layer keeps your spine aligned.',
                  'The removable, washable cover is zipped for easy care.',
                  'Comes roll-packed in a box; allow 24 hours to fully expand.',
                  '100-night trial and a long warranty.',
                ]
              : [
                  'Soft, breathable and kind to the skin.',
                  'Colours stay bright wash after wash.',
                  'Machine washable on a gentle cycle.',
                  'Elastic-fitted corners keep sheets in place.',
                  'A thoughtful gift for weddings and housewarmings.',
                ],
            3,
          ),
          highlights: [
            material,
            ...(type.includes('Pillow') ? [] : [`${bedSize} size`]),
            isMattress ? '10 year warranty' : 'Machine washable',
          ],
          specifications: [
            spec('Type', type),
            spec('Material', material),
            ...(type.includes('Pillow') ? [] : [spec('Bed Size', bedSize)]),
            ...(isMattress || type.includes('Pillow')
              ? []
              : [spec('Pattern', pattern), spec('Colour', color)]),
            spec(
              'Care',
              isMattress
                ? 'Spot clean; cover is machine washable'
                : 'Machine wash gentle, cold water',
            ),
          ],
          tags: [
            'bedding',
            'bedroom',
            isMattress ? 'mattress' : type.includes('Pillow') ? 'pillow' : 'bedsheet',
            bedSize.toLowerCase(),
          ],
        };
      },
    },
    {
      key: 'decor and lighting',
      name: 'Decor & Lighting',
      code: 'DEC',
      weight: 5,
      images: 'decor',
      brands: brands(
        ['Philips', 'mid', 2],
        ['Wipro', 'mid', 2],
        ['Pure Home + Living', 'mid', 2],
        ['ExclusiveLane', 'mid', 2],
        ['Craftter', 'budget', 2],
        ['Fabindia Home', 'mid', 1],
        ['Ekena', 'budget', 2],
      ),
      discount: [0.2, 0.6],
      stockScale: 45,
      build({ rng, brand }) {
        const kinds = [
          ['Floor Lamp with Fabric Shade', 'Metal base, linen shade', 3999],
          ['Pendant Ceiling Light', 'Metal shade', 2499],
          ['Table Lamp', 'Ceramic base, fabric shade', 1999],
          ['Ceramic Flower Vase', 'Hand-glazed ceramic', 1299],
          ['Smart Wi-Fi LED Table Lamp', 'ABS body, 16 million colours', 2999],
          ['Brass Diya Set (Pack of 4)', 'Solid brass', 1499],
        ] as const;
        const [type, material, base] = rng.pick(kinds);
        const finish = rng.pick([
          'Matte Black',
          'Antique Brass',
          'White',
          'Gold',
          'Sage Green',
          'Terracotta',
          'Copper',
        ]);
        const mrp = base * byTier(brand.tier, 0.8, 1.15, 2) * rng.float(0.85, 1.2);
        return {
          name: `${brand.name} ${finish} ${type}`,
          mrp,
          shortDescription: `${finish.toLowerCase()} ${type.toLowerCase()} in ${material.toLowerCase()}.`,
          description: paragraph(
            rng,
            [
              `A ${finish.toLowerCase()} ${type.toLowerCase()} from ${brand.name} in ${material.toLowerCase()}.`,
            ],
            [
              type.includes('Lamp') || type.includes('Light')
                ? 'Takes a standard E27 bulb (sold separately unless stated).'
                : 'Each piece is finished by hand, so small variations are part of its charm.',
              'Adds warmth to living rooms, bedrooms and reading corners.',
              'Arrives securely packed to prevent breakage.',
              'A thoughtful housewarming or festive gift.',
            ],
            2,
          ),
          highlights: [
            material,
            `${finish} finish`,
            type.includes('Smart') ? 'Works with Alexa & Google Assistant' : 'Handcrafted look',
          ],
          specifications: [
            spec('Type', type),
            spec('Material', material),
            spec('Finish', finish),
            spec('Room', rng.pick(['Living room', 'Bedroom', 'Study', 'Dining'])),
          ],
          tags: [
            'home decor',
            'decor',
            type.toLowerCase(),
            ...(type.includes('Lamp') || type.includes('Light') ? ['lighting', 'lamp'] : []),
          ],
        };
      },
    },
  ],
};
