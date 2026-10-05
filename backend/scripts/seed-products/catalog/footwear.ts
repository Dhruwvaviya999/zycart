import type { CategoryDef } from '../types';
import {
  brands,
  byTier,
  LEATHER_COLORS,
  MENS_UK_SHOES,
  paragraph,
  SHOE_COLORWAYS,
  sizeRun,
  spec,
  WOMENS_UK_SHOES,
} from './helpers';

const RUNNING_MODELS: Record<string, string[]> = {
  Nike: ['Revolution 7', 'Downshifter 13', 'Air Zoom Pegasus 41', 'Winflo 11', 'Interact Run'],
  Adidas: ['Duramo SL', 'Ultraboost Light', 'Galaxy 7', 'Adizero SL', 'Runfalcon 3.0'],
  Puma: [
    'Velocity Nitro 3',
    'Softride Pro',
    'Deviate Nitro 2',
    'Electrify Nitro 3',
    'Redeem Profoam',
  ],
  ASICS: ['Gel-Contend 9', 'Gel-Kayano 31', 'Gel-Nimbus 26', 'Novablast 4', 'Gel-Excite 10'],
  Skechers: ['GOrun Consistent', 'Max Cushioning Elite', 'GO Walk 7', 'Arch Fit'],
  Campus: ['North Plus', 'First', 'Maxico', 'Oxyfit'],
  'New Balance': ['Fresh Foam 1080', 'Fresh Foam 680', '520 v8', 'FuelCell Rebel'],
  Reebok: ['Floatride Energy 5', 'Energen Run 3', 'Lite Plus 4'],
};

const SNEAKER_MODELS: Record<string, string[]> = {
  Nike: ['Court Vision Low', "Air Force 1 '07", 'Dunk Low Retro', "Blazer Mid '77"],
  Adidas: ['Grand Court 2.0', 'Advantage Base', 'Stan Smith', 'Samba OG', 'Campus 00s'],
  Puma: ['Smash v2', 'Carina 2.0', 'Caven 2.0', 'Suede Classic XXI', 'Palermo'],
  Converse: ['Chuck Taylor All Star', 'Chuck 70 Hi', 'Run Star Hike'],
  Vans: ['Old Skool', 'Authentic', 'Sk8-Hi', 'Knu Skool'],
  'Red Tape': ['Casual Sneaker RSO', 'Athleisure Sneaker', 'Walking Shoe'],
  Bata: ['North Star Carter', 'North Star Brett', 'Power Court'],
  'U.S. Polo Assn.': ['Clarkin', 'Amadeo', 'Ronin'],
  Skechers: ['Uno', 'Court Classic', "D'Lites"],
};

export const footwear: CategoryDef = {
  slug: 'footwear',
  name: 'Footwear',
  description: 'Running shoes, sneakers, formals, boots and heels',
  image:
    'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=700&q=80',
  gstRate: 18,
  hsnCode: '6404',
  tryOnEnabled: true,
  code: 'FTW',
  weight: 14,
  reviewScale: 1100,
  subcategories: [
    {
      key: 'running shoes',
      name: 'Running & Sports Shoes',
      code: 'RUN',
      weight: 9,
      images: 'runningShoes',
      brands: brands(
        ['Nike', 'premium', 3],
        ['Adidas', 'premium', 3],
        ['Puma', 'mid', 3],
        ['ASICS', 'premium', 2],
        ['Skechers', 'mid', 2],
        ['Campus', 'budget', 3],
        ['New Balance', 'premium', 1],
        ['Reebok', 'mid', 1],
      ),
      discount: [0.1, 0.55],
      stockScale: 90,
      build({ rng, brand }) {
        const model = rng.pick(RUNNING_MODELS[brand.name]!);
        const gender = rng.weighted([
          ['Men', 3],
          ['Women', 2],
        ] as const);
        const colorway = rng.pick(SHOE_COLORWAYS);
        const upper = rng.pick([
          'Engineered Mesh',
          'Knit',
          'Breathable Mesh',
          'Flyknit-style Knit',
        ]);
        const midsole = rng.pick([
          'EVA foam',
          'Responsive foam',
          'Nitrogen-infused foam',
          'Gel cushioning',
          'Phylon',
        ]);
        const weight = rng.int(220, 320);
        const drop = rng.pick([6, 8, 10, 12]);
        const mrp =
          byTier(brand.tier, 1999, 4999, 8999) *
          (model.match(/Kayano|Nimbus|Ultraboost|Pegasus|1080|Nitro/) ? 1.6 : 1) *
          rng.float(0.85, 1.15);
        return {
          name: `${brand.name} ${model} ${gender === 'Men' ? "Men's" : "Women's"} Running Shoes (${colorway.name})`,
          mrp,
          shortDescription: `Lightweight ${upper.toLowerCase()} runner with a ${midsole.toLowerCase()} midsole and ${drop}mm drop.`,
          description: paragraph(
            rng,
            [
              `The ${brand.name} ${model} is a daily trainer with a ${upper.toLowerCase()} upper and a ${midsole.toLowerCase()} midsole that softens every stride.`,
            ],
            [
              'A durable rubber outsole grips on roads, tracks and treadmills.',
              'A padded collar and tongue lock the heel in without rubbing.',
              `At around ${weight} g per shoe, it stays light through long runs.`,
              'Good for daily runs, gym sessions and long walks.',
              'A removable insole makes room for orthotics.',
            ],
            3,
          ),
          highlights: [
            upper,
            midsole,
            `${drop}mm heel-to-toe drop`,
            `Approx. ${weight} g per shoe`,
            'Lace-up closure',
          ],
          specifications: [
            spec('Type', 'Running shoes'),
            spec('Upper Material', upper),
            spec('Midsole', midsole),
            spec('Sole', 'Rubber'),
            spec('Closure', 'Lace-up'),
            spec('Heel-to-Toe Drop', `${drop} mm`),
            spec('Weight', `${weight} g (per shoe, UK 8)`),
            spec('Gender', gender),
            spec('Colour', colorway.name),
            spec('Warranty', '90 days against manufacturing defects'),
          ],
          tags: ['shoes', 'running shoes', 'sports shoes', 'trainers', gender.toLowerCase(), 'gym'],
          colors: [colorway],
          sizes: sizeRun(rng, gender === 'Men' ? MENS_UK_SHOES : WOMENS_UK_SHOES, 5, 6),
          trackVariants: true,
        };
      },
    },
    {
      key: 'sneakers',
      name: 'Casual Sneakers',
      code: 'SNK',
      weight: 9,
      images: 'sneakers',
      brands: brands(
        ['Nike', 'premium', 2],
        ['Adidas', 'premium', 2],
        ['Puma', 'mid', 3],
        ['Converse', 'mid', 2],
        ['Vans', 'mid', 2],
        ['Red Tape', 'budget', 3],
        ['Bata', 'budget', 2],
        ['U.S. Polo Assn.', 'mid', 2],
        ['Skechers', 'mid', 2],
      ),
      discount: [0.15, 0.6],
      stockScale: 100,
      build({ rng, brand }) {
        const model = rng.pick(SNEAKER_MODELS[brand.name]!);
        const gender = rng.weighted([
          ['Men', 3],
          ['Women', 2],
          ['Unisex', 2],
        ] as const);
        const colorway = rng.pick(SHOE_COLORWAYS);
        const upper = rng.pick([
          'Leather',
          'Synthetic Leather',
          'Canvas',
          'Suede',
          'Mesh and Suede',
        ]);
        const cut = model.match(/Hi|Mid/) ? 'High-Top' : 'Low-Top';
        const mrp =
          byTier(brand.tier, 1799, 3999, 7999) *
          (upper === 'Leather' || upper === 'Suede' ? 1.25 : 1) *
          rng.float(0.85, 1.15);
        const label = gender === 'Unisex' ? 'Unisex' : gender === 'Men' ? "Men's" : "Women's";
        return {
          name: `${brand.name} ${model} ${label} ${cut} ${upper} Sneakers (${colorway.name})`,
          mrp,
          shortDescription: `${cut.toLowerCase()} ${upper.toLowerCase()} sneakers with a cushioned footbed and grippy rubber cupsole.`,
          description: paragraph(
            rng,
            [
              `The ${brand.name} ${model} is a ${cut.toLowerCase()} sneaker in ${upper.toLowerCase()} that goes with everything from denim to chinos.`,
            ],
            [
              'A cushioned footbed keeps you comfortable from morning to night.',
              'The vulcanised rubber sole grips well on city pavements.',
              'Perforations around the toe let your feet breathe.',
              'Wipe clean with a damp cloth; do not machine wash.',
              'True to size — order your usual UK size.',
            ],
            3,
          ),
          highlights: [upper, cut, 'Cushioned footbed', 'Rubber outsole'],
          specifications: [
            spec('Type', 'Casual sneakers'),
            spec('Upper Material', upper),
            spec('Sole', 'Rubber'),
            spec('Ankle Height', cut),
            spec('Closure', 'Lace-up'),
            spec('Gender', gender),
            spec('Colour', colorway.name),
            spec('Warranty', '90 days against manufacturing defects'),
          ],
          tags: [
            'shoes',
            'sneakers',
            'casual shoes',
            upper.toLowerCase(),
            ...(colorway.name.includes('White') ? ['white sneakers'] : []),
          ],
          colors: [colorway],
          sizes: sizeRun(rng, gender === 'Women' ? WOMENS_UK_SHOES : MENS_UK_SHOES, 5, 6),
          trackVariants: true,
        };
      },
    },
    {
      key: 'formal shoes',
      name: 'Formal Shoes',
      code: 'FRM',
      weight: 6,
      images: 'formalShoes',
      brands: brands(
        ['Hush Puppies', 'mid', 2],
        ['Clarks', 'premium', 2],
        ['Red Tape', 'budget', 3],
        ['Bata', 'budget', 3],
        ['Lee Cooper', 'mid', 2],
        ['Louis Philippe', 'mid', 2],
        ['Ruosh', 'premium', 1],
        ['Language', 'mid', 1],
      ),
      discount: [0.15, 0.55],
      stockScale: 60,
      build({ rng, brand }) {
        const style = rng.pick([
          'Derby',
          'Oxford',
          'Monk Strap',
          'Penny Loafers',
          'Brogues',
          'Tassel Loafers',
        ]);
        const material = rng.pick([
          'Genuine Leather',
          'Full-Grain Leather',
          'Patent Leather',
          'Suede',
          'Synthetic Leather',
        ]);
        const sole = rng.pick(['TPR', 'Leather', 'Rubber', 'PU']);
        const color = rng.pick(LEATHER_COLORS);
        const mrp =
          byTier(brand.tier, 1799, 3499, 7999) *
          (material.includes('Leather') && material !== 'Synthetic Leather' ? 1.3 : 1) *
          rng.float(0.85, 1.15);
        return {
          name: `${brand.name} Men's ${material} ${style} Formal Shoes (${color.name})`,
          mrp,
          shortDescription: `${color.name.toLowerCase()} ${material.toLowerCase()} ${style.toLowerCase()} with a ${sole} sole and cushioned insole.`,
          description: paragraph(
            rng,
            [
              `Classic ${style.toLowerCase()} shoes from ${brand.name}, crafted in ${material.toLowerCase()} with a polished ${color.name.toLowerCase()} finish.`,
            ],
            [
              'A cushioned insole keeps you comfortable through a full workday.',
              `The ${sole} sole is slip-resistant on office floors.`,
              'Pair with suits for weddings and formal events, or with chinos for smart-casual Fridays.',
              'Polish regularly with a matching cream to keep the leather supple.',
              'Stitched welt construction for durability.',
            ],
            3,
          ),
          highlights: [material, style, `${sole} sole`, 'Cushioned insole'],
          specifications: [
            spec('Style', style),
            spec('Upper Material', material),
            spec('Sole', sole),
            spec(
              'Closure',
              style.includes('Loafer') || style === 'Monk Strap' ? 'Slip-on / buckle' : 'Lace-up',
            ),
            spec('Toe Shape', rng.pick(['Round', 'Almond', 'Square'])),
            spec('Gender', 'Men'),
            spec('Colour', color.name),
            spec('Warranty', '90 days against manufacturing defects'),
          ],
          tags: [
            'shoes',
            'formal shoes',
            style.toLowerCase(),
            'leather shoes',
            'office wear',
            'men',
          ],
          colors: [color],
          sizes: sizeRun(rng, MENS_UK_SHOES, 5, 6),
          trackVariants: true,
        };
      },
    },
    {
      key: 'boots',
      name: 'Boots',
      code: 'BTS',
      weight: 4,
      images: 'boots',
      brands: brands(
        ['Woodland', 'mid', 3],
        ['Red Chief', 'mid', 2],
        ['Timberland', 'premium', 1],
        ['Red Tape', 'budget', 2],
        ['Wildcraft', 'mid', 1],
        ['Bata', 'budget', 1],
        ['Lee Cooper', 'mid', 1],
      ),
      discount: [0.1, 0.5],
      stockScale: 45,
      build({ rng, brand }) {
        const style = rng.pick([
          'Chelsea Boots',
          'Chukka Boots',
          'Hiking Boots',
          'Combat Boots',
          'Desert Boots',
          'Trekking Boots',
        ]);
        const material = rng.pick(['Nubuck Leather', 'Genuine Leather', 'Suede', 'Waxed Leather']);
        const color = rng.pick(LEATHER_COLORS);
        const outdoor = style.includes('Hiking') || style.includes('Trekking');
        const mrp = byTier(brand.tier, 2499, 4499, 10999) * rng.float(0.85, 1.15);
        return {
          name: `${brand.name} Men's ${material} ${style} (${color.name})`,
          mrp,
          shortDescription: `${material.toLowerCase()} ${style.toLowerCase()} with a lugged rubber sole${outdoor ? ' and water-resistant finish' : ''}.`,
          description: paragraph(
            rng,
            [
              `Rugged ${style.toLowerCase()} from ${brand.name} in ${material.toLowerCase()}, built to take on city streets and weekend trails alike.`,
            ],
            [
              'A deep-lugged rubber outsole grips on wet and uneven ground.',
              outdoor
                ? 'A water-resistant finish and padded collar suit monsoon treks and hill trails.'
                : 'Elastic side panels and a pull tab make them easy to slip on.',
              'Leather that softens and develops character with wear.',
              'Cushioned footbed with arch support.',
            ],
            2,
          ),
          highlights: [
            material,
            style,
            'Lugged rubber sole',
            ...(outdoor ? ['Water resistant'] : []),
          ],
          specifications: [
            spec('Style', style),
            spec('Upper Material', material),
            spec('Sole', 'Rubber, lugged'),
            spec('Ankle Height', 'Mid / high ankle'),
            spec('Water Resistance', outdoor ? 'Water resistant' : 'Not rated'),
            spec('Gender', 'Men'),
            spec('Colour', color.name),
          ],
          tags: [
            'boots',
            style.toLowerCase(),
            'leather boots',
            ...(outdoor ? ['trekking', 'hiking'] : []),
            'men',
          ],
          colors: [color],
          sizes: sizeRun(rng, MENS_UK_SHOES, 5, 6),
          trackVariants: true,
        };
      },
    },
    {
      key: 'heels and sandals',
      name: "Women's Heels & Sandals",
      code: 'HEL',
      weight: 6,
      images: 'heelsSandals',
      brands: brands(
        ['Metro', 'mid', 3],
        ['Mochi', 'mid', 3],
        ['Inc.5', 'mid', 2],
        ['Catwalk', 'budget', 2],
        ['Bata', 'budget', 2],
        ['Clarks', 'premium', 1],
        ['Rocia', 'budget', 2],
        ['Marc Loire', 'budget', 2],
      ),
      discount: [0.2, 0.65],
      stockScale: 60,
      build({ rng, brand }) {
        const style = rng.pick([
          'Block Heels',
          'Stilettos',
          'Wedges',
          'Flat Sandals',
          'Kolhapuri Flats',
          'Mules',
          'Kitten Heels',
          'Platform Heels',
        ]);
        const heel = style.includes('Flat')
          ? 0
          : style === 'Kitten Heels'
            ? rng.pick([3, 4])
            : rng.pick([5, 6, 7, 8, 9]);
        const material = rng.pick([
          'Synthetic',
          'Faux Suede',
          'Patent PU',
          'Genuine Leather',
          'Embellished PU',
        ]);
        const occasion = rng.pick(['Party', 'Casual', 'Ethnic', 'Work', 'Wedding']);
        const color = rng.pick([
          { name: 'Nude', hex: '#E3BC9A' },
          { name: 'Black', hex: '#111111' },
          { name: 'Gold', hex: '#C9A227' },
          { name: 'Rose Gold', hex: '#B76E79' },
          { name: 'Tan', hex: '#B5835A' },
          { name: 'Silver', hex: '#C0C0C0' },
          { name: 'Wine', hex: '#722F37' },
        ]);
        const mrp = byTier(brand.tier, 1299, 2299, 5999) * rng.float(0.85, 1.2);
        return {
          name: `${brand.name} Women's ${occasion} ${material} ${style}${heel ? ` (${heel} cm heel)` : ''} — ${color.name}`,
          mrp,
          shortDescription: `${color.name.toLowerCase()} ${style.toLowerCase()}${heel ? ` with a ${heel} cm heel` : ''} and a padded footbed.`,
          description: paragraph(
            rng,
            [
              `${style} from ${brand.name} in ${material.toLowerCase()}, designed for ${occasion.toLowerCase()} wear${heel ? ` on a ${heel} cm heel` : ''}.`,
            ],
            [
              'A padded footbed keeps you comfortable through long events.',
              'An anti-skid sole adds grip on polished floors.',
              'The adjustable strap gives a secure fit.',
              'Pairs well with sarees, lehengas, dresses and jeans alike.',
            ],
            2,
          ),
          highlights: [style, material, heel ? `${heel} cm heel` : 'Flat sole', 'Padded footbed'],
          specifications: [
            spec('Style', style),
            spec('Upper Material', material),
            spec('Heel Height', heel ? `${heel} cm` : 'Flat'),
            spec('Sole', 'TPR, anti-skid'),
            spec('Occasion', occasion),
            spec('Gender', 'Women'),
            spec('Colour', color.name),
          ],
          tags: [
            'women',
            style.toLowerCase(),
            heel ? 'heels' : 'sandals',
            'footwear',
            occasion.toLowerCase(),
          ],
          colors: [color],
          sizes: sizeRun(rng, WOMENS_UK_SHOES, 5, 6),
          trackVariants: true,
        };
      },
    },
  ],
};
