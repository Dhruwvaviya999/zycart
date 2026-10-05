import type { CategoryDef } from '../types';
import {
  ALPHA_SIZES,
  APPAREL_COLORS,
  brands,
  byTier,
  DENIM_WASHES,
  MENS_WAIST,
  paragraph,
  pickColors,
  sizeRun,
  spec,
  WOMENS_COLORS,
  WOMENS_WAIST,
} from './helpers';

const CARE = [
  'Machine wash cold, inside out',
  'Gentle machine wash, do not bleach',
  'Hand wash recommended, dry in shade',
  'Dry clean only',
];

const gendered = (gender: string) =>
  gender === 'Unisex' ? 'Unisex' : gender === 'Men' ? "Men's" : "Women's";

export const fashion: CategoryDef = {
  slug: 'fashion',
  name: 'Fashion',
  description: 'Everyday layers, denim, dresses and ethnic wear',
  image:
    'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=700&q=80',
  gstRate: 5,
  hsnCode: '6109',
  tryOnEnabled: true,
  code: 'FSH',
  weight: 20,
  reviewScale: 900,
  subcategories: [
    {
      key: 't-shirts',
      name: 'T-Shirts & Polos',
      code: 'TEE',
      weight: 10,
      images: 'tshirts',
      brands: brands(
        ['Allen Solly', 'mid', 3],
        ['U.S. Polo Assn.', 'mid', 3],
        ["Levi's", 'mid', 2],
        ['Puma', 'mid', 2],
        ['Roadster', 'budget', 3],
        ['HRX by Hrithik Roshan', 'budget', 2],
        ['Bewakoof', 'budget', 3],
        ['The Souled Store', 'budget', 2],
        ['Jack & Jones', 'mid', 2],
        ['Tommy Hilfiger', 'premium', 1],
        ['Snitch', 'budget', 2],
      ),
      discount: [0.2, 0.7],
      stockScale: 160,
      build({ rng, brand }) {
        const gender = rng.weighted([
          ['Men', 6],
          ['Women', 3],
          ['Unisex', 2],
        ] as const);
        const style = rng.pick([
          'Round Neck',
          'Polo',
          'Oversized',
          'Henley',
          'V-Neck',
          'Crew Neck',
        ]);
        const pattern = rng.pick([
          'Solid',
          'Striped',
          'Graphic Printed',
          'Typography',
          'Colourblocked',
          'Self-Design',
        ]);
        const fabric = rng.pick([
          'Pure Cotton',
          'Cotton Blend',
          'Pique Cotton',
          'Bio-Wash Cotton',
          'Supima Cotton',
          'Organic Cotton',
        ]);
        const fit =
          style === 'Oversized'
            ? 'Oversized Fit'
            : rng.pick(['Slim Fit', 'Regular Fit', 'Relaxed Fit']);
        const sleeve = rng.pick(['Half Sleeve', 'Half Sleeve', 'Full Sleeve']);
        const gsm = rng.pick([160, 180, 200, 220, 240]);
        const colors = pickColors(rng, gender === 'Women' ? WOMENS_COLORS : APPAREL_COLORS, 1, 4);
        const mrp =
          byTier(brand.tier, 699, 1299, 3299) *
          (style === 'Polo' ? 1.3 : 1) *
          (fabric === 'Supima Cotton' ? 1.4 : 1) *
          rng.float(0.85, 1.2);
        return {
          name: `${brand.name} ${gendered(gender)} ${pattern} ${style} ${fabric} T-Shirt (${fit}, ${sleeve})`,
          mrp,
          shortDescription: `${fit.toLowerCase()} ${style.toLowerCase()} tee in ${gsm} GSM ${fabric.toLowerCase()}.`,
          description: paragraph(
            rng,
            [
              `A ${pattern.toLowerCase()} ${style.toLowerCase()} T-shirt from ${brand.name}, cut in a ${fit.toLowerCase()} from soft ${gsm} GSM ${fabric.toLowerCase()}.`,
            ],
            [
              'Pre-shrunk fabric keeps its shape and size wash after wash.',
              'Ribbed neck trims hold their shape and do not sag.',
              `Wear it on its own or layer it under an overshirt or jacket.`,
              'Breathable enough for Indian summers and soft enough to sleep in.',
              'Colours are reactive-dyed for minimal fading.',
            ],
            3,
          ),
          highlights: [fabric, fit, `${gsm} GSM`, sleeve, rng.pick(CARE.slice(0, 2))],
          specifications: [
            spec('Fabric', fabric),
            spec('Fit', fit),
            spec('Neck', style === 'Polo' ? 'Polo collar' : style),
            spec('Sleeve', sleeve),
            spec('Pattern', pattern),
            spec('Gender', gender),
            spec('Fabric Weight', `${gsm} GSM`),
            spec('Care', rng.pick(CARE.slice(0, 2))),
            spec('Country of Origin', 'India'),
          ],
          tags: [
            't-shirt',
            'tee',
            style.toLowerCase(),
            fabric.toLowerCase(),
            gender.toLowerCase(),
            'casual wear',
          ],
          colors,
          sizes: sizeRun(rng, ALPHA_SIZES, 4, 6),
          trackVariants: true,
        };
      },
    },
    {
      key: 'shirts',
      name: 'Shirts',
      code: 'SHT',
      weight: 9,
      images: 'shirts',
      brands: brands(
        ['Peter England', 'mid', 3],
        ['Louis Philippe', 'premium', 2],
        ['Van Heusen', 'mid', 3],
        ['Arrow', 'mid', 2],
        ['Allen Solly', 'mid', 2],
        ['Raymond', 'premium', 1],
        ['Highlander', 'budget', 3],
        ['Roadster', 'budget', 2],
        ['U.S. Polo Assn.', 'mid', 2],
      ),
      discount: [0.2, 0.65],
      stockScale: 120,
      build({ rng, brand }) {
        const occasion = rng.pick(['Formal', 'Casual', 'Smart Casual', 'Party']);
        const pattern = rng.pick([
          'Solid',
          'Checked',
          'Striped',
          'Printed',
          'Dobby Textured',
          'Micro Checks',
        ]);
        const fabric = rng.pick([
          'Pure Cotton',
          'Linen Blend',
          'Oxford Cotton',
          'Cotton Satin',
          'Poplin',
          'Pure Linen',
          'Corduroy',
        ]);
        const fit = rng.pick(['Slim Fit', 'Regular Fit', 'Tailored Fit']);
        const collar = rng.pick([
          'Spread Collar',
          'Button-Down Collar',
          'Cutaway Collar',
          'Mandarin Collar',
        ]);
        const sleeve = rng.pick(['Full Sleeve', 'Full Sleeve', 'Half Sleeve']);
        const colors = pickColors(rng, APPAREL_COLORS, 1, 3);
        const mrp =
          byTier(brand.tier, 999, 1999, 3499) *
          (fabric.includes('Linen') ? 1.35 : 1) *
          rng.float(0.85, 1.2);
        return {
          name: `${brand.name} Men's ${fit} ${pattern} ${occasion} Shirt in ${fabric} (${collar}, ${sleeve})`,
          mrp,
          shortDescription: `${fit} ${pattern.toLowerCase()} ${occasion.toLowerCase()} shirt in ${fabric.toLowerCase()} with a ${collar.toLowerCase()}.`,
          description: paragraph(
            rng,
            [
              `This ${brand.name} ${occasion.toLowerCase()} shirt is cut in a ${fit.toLowerCase()} from ${fabric.toLowerCase()} with a ${collar.toLowerCase()}.`,
            ],
            [
              'A curved hem looks neat tucked in and relaxed worn out.',
              'Fabric is treated for easy ironing and a crisp look all day.',
              occasion === 'Formal'
                ? 'Pair it with tailored trousers and leather shoes for the office.'
                : 'Pair it with chinos or denim for weekends and evenings out.',
              'Buttons are reinforced so they stay put.',
              'Breathable weave keeps you comfortable through humid days.',
            ],
            3,
          ),
          highlights: [fabric, fit, collar, sleeve, `${occasion} wear`],
          specifications: [
            spec('Fabric', fabric),
            spec('Fit', fit),
            spec('Collar', collar),
            spec('Sleeve', sleeve),
            spec('Pattern', pattern),
            spec('Occasion', occasion),
            spec('Gender', 'Men'),
            spec('Care', rng.pick(CARE)),
          ],
          tags: [
            'shirt',
            `${occasion.toLowerCase()} shirt`,
            fabric.toLowerCase(),
            pattern.toLowerCase(),
            'men',
          ],
          colors,
          sizes: sizeRun(rng, ['S', 'M', 'L', 'XL', 'XXL', '3XL'], 4, 6),
          trackVariants: true,
        };
      },
    },
    {
      key: 'jeans',
      name: 'Jeans & Denim',
      code: 'JNS',
      weight: 8,
      images: 'jeans',
      brands: brands(
        ["Levi's", 'premium', 3],
        ['Wrangler', 'mid', 2],
        ['Pepe Jeans', 'mid', 2],
        ['Lee', 'mid', 2],
        ['Spykar', 'mid', 2],
        ['Flying Machine', 'mid', 2],
        ['Roadster', 'budget', 3],
        ['Mufti', 'mid', 1],
        ['ONLY', 'mid', 2],
        ['Vero Moda', 'mid', 1],
      ),
      discount: [0.2, 0.65],
      stockScale: 110,
      build({ rng, brand }) {
        const womenOnly = brand.name === 'ONLY' || brand.name === 'Vero Moda';
        const gender = womenOnly
          ? 'Women'
          : rng.weighted([
              ['Men', 3],
              ['Women', 2],
            ] as const);
        const fit =
          gender === 'Men'
            ? rng.pick([
                'Slim Fit',
                'Skinny Fit',
                'Straight Fit',
                'Tapered Fit',
                'Relaxed Fit',
                'Bootcut',
              ])
            : rng.pick([
                'Skinny Fit',
                'Mom Fit',
                'Wide Leg',
                'Straight Fit',
                'Flared',
                'Boyfriend Fit',
              ]);
        const rise = rng.pick(['Mid-Rise', 'High-Rise', 'Low-Rise']);
        const finish = rng.pick([
          'Clean Look',
          'Light Fade',
          'Heavy Fade',
          'Mildly Distressed',
          'Ripped Knee',
        ]);
        const stretch = rng.pick(['Stretchable', 'Non-Stretchable', 'Super Stretch']);
        const model = rng.pick([
          '511',
          '512',
          '541',
          'Ben',
          'Jack',
          'Skeanie',
          'Harper',
          'Tess',
          'Eloise',
          'Austin',
          'Brooklyn',
          'Hampton',
        ]);
        const colors = pickColors(rng, DENIM_WASHES, 1, 3);
        const mrp = byTier(brand.tier, 1199, 2299, 3999) * rng.float(0.85, 1.2);
        return {
          name: `${brand.name} ${gendered(gender)} ${model} ${fit} ${rise} ${finish} ${stretch} Jeans`,
          mrp,
          shortDescription: `${rise} ${fit.toLowerCase()} jeans with a ${finish.toLowerCase()} finish in ${stretch.toLowerCase()} denim.`,
          description: paragraph(
            rng,
            [
              `The ${model} from ${brand.name} is a ${rise.toLowerCase()}, ${fit.toLowerCase()} jean in ${stretch.toLowerCase()} cotton denim with a ${finish.toLowerCase()} wash.`,
            ],
            [
              'Classic five-pocket styling with branded rivets and a zip fly.',
              'Comfort-stretch fabric moves with you and recovers its shape.',
              'Pairs as easily with sneakers and a tee as it does with a shirt and loafers.',
              'Wash inside out in cold water to keep the colour rich.',
              'Belt loops sized for belts up to 40 mm wide.',
            ],
            3,
          ),
          highlights: [fit, rise, finish, stretch, '98% cotton, 2% elastane'],
          specifications: [
            spec('Fit', fit),
            spec('Rise', rise),
            spec(
              'Fabric',
              stretch === 'Non-Stretchable' ? '100% Cotton Denim' : '98% Cotton, 2% Elastane',
            ),
            spec('Wash', finish),
            spec('Closure', 'Button and zip'),
            spec('Gender', gender),
            spec('Care', CARE[0]!),
          ],
          tags: [
            'jeans',
            'denim',
            fit.toLowerCase(),
            gender.toLowerCase(),
            ...(finish.includes('Ripped') || finish.includes('Distressed')
              ? ['distressed jeans']
              : []),
          ],
          colors,
          sizes: sizeRun(rng, gender === 'Men' ? MENS_WAIST : WOMENS_WAIST, 4, 6),
          trackVariants: true,
        };
      },
    },
    {
      key: 'jackets',
      name: 'Jackets & Sweatshirts',
      code: 'JKT',
      weight: 6,
      images: 'jackets',
      brands: brands(
        ['Roadster', 'budget', 3],
        ['HRX by Hrithik Roshan', 'budget', 2],
        ['Puma', 'mid', 2],
        ['Adidas', 'mid', 2],
        ['Nike', 'mid', 2],
        ["Levi's", 'mid', 2],
        ['Wildcraft', 'mid', 2],
        ['Campus Sutra', 'budget', 2],
        ['The North Face', 'premium', 1],
        ['Columbia', 'premium', 1],
        ['Monte Carlo', 'mid', 2],
      ),
      discount: [0.25, 0.7],
      stockScale: 80,
      build({ rng, brand }) {
        const kinds = [
          ['Hooded Sweatshirt', 'Cotton Fleece', 1],
          ['Zip-Through Hoodie', 'Cotton Blend Fleece', 1.1],
          ['Bomber Jacket', 'Polyester', 1.5],
          ['Denim Jacket', 'Cotton Denim', 1.6],
          ['Puffer Jacket', 'Nylon with Polyfill', 2.1],
          ['Windcheater', 'Water-Resistant Polyester', 1.3],
          ['Biker Jacket', 'Faux Leather', 2],
          ['Fleece Jacket', 'Polar Fleece', 1.2],
          ['Crew-Neck Sweatshirt', 'Brushed Cotton', 0.9],
        ] as const;
        const [type, fabric, factor] = rng.pick(kinds);
        const gender = rng.weighted([
          ['Men', 3],
          ['Women', 2],
          ['Unisex', 1],
        ] as const);
        const pattern = rng.pick(['Solid', 'Colourblocked', 'Printed', 'Quilted', 'Typography']);
        const colors = pickColors(rng, APPAREL_COLORS, 1, 3);
        const mrp = byTier(brand.tier, 1499, 2799, 7999) * factor * rng.float(0.85, 1.2);
        return {
          name: `${brand.name} ${gendered(gender)} ${pattern} ${type} in ${fabric}`,
          mrp,
          shortDescription: `${pattern} ${type.toLowerCase()} in ${fabric.toLowerCase()}, made for cool mornings and winter evenings.`,
          description: paragraph(
            rng,
            [
              `A ${pattern.toLowerCase()} ${type.toLowerCase()} from ${brand.name} in ${fabric.toLowerCase()}.`,
            ],
            [
              'Ribbed cuffs and hem keep the warmth in.',
              'Two side pockets keep your hands warm and your phone safe.',
              type.includes('Puffer') || type.includes('Windcheater')
                ? 'It packs down small enough for a backpack on hill-station trips.'
                : 'Layers easily over a T-shirt or shirt.',
              'Brushed inner lining feels soft against the skin.',
              'Made to hold its colour and shape through the season.',
            ],
            3,
          ),
          highlights: [
            type,
            fabric,
            pattern,
            gender === 'Unisex' ? 'Unisex fit' : `${gender}'s fit`,
          ],
          specifications: [
            spec('Type', type),
            spec('Fabric', fabric),
            spec('Pattern', pattern),
            spec('Gender', gender),
            spec(
              'Closure',
              type.includes('Zip') || type.includes('Jacket') || type.includes('Windcheater')
                ? 'Zip'
                : 'Pullover',
            ),
            spec('Care', rng.pick(CARE)),
          ],
          tags: [
            type.toLowerCase(),
            'winter wear',
            gender.toLowerCase(),
            ...(type.includes('Hood') ? ['hoodie'] : ['jacket']),
          ],
          colors,
          sizes: sizeRun(rng, ALPHA_SIZES, 4, 6),
          trackVariants: true,
        };
      },
    },
    {
      key: 'dresses',
      name: 'Dresses',
      code: 'DRS',
      weight: 7,
      images: 'dresses',
      brands: brands(
        ['SASSAFRAS', 'budget', 2],
        ['Tokyo Talkies', 'budget', 2],
        ['Berrylush', 'budget', 2],
        ['ONLY', 'mid', 2],
        ['Vero Moda', 'mid', 2],
        ['AND', 'mid', 2],
        ['Global Desi', 'mid', 1],
        ['Zink London', 'mid', 1],
        ['W', 'mid', 2],
      ),
      discount: [0.3, 0.7],
      stockScale: 70,
      build({ rng, brand }) {
        const silhouette = rng.pick([
          'A-Line',
          'Maxi',
          'Fit & Flare',
          'Bodycon',
          'Shirt',
          'Wrap',
          'Midi',
          'Tiered',
          'Slip',
        ]);
        const pattern = rng.pick([
          'Floral Print',
          'Solid',
          'Polka Dot',
          'Striped',
          'Abstract Print',
          'Checked',
          'Embroidered',
        ]);
        const fabric = rng.pick([
          'Georgette',
          'Crepe',
          'Rayon',
          'Cotton',
          'Chiffon',
          'Linen Blend',
          'Satin',
        ]);
        const occasion = rng.pick(['Casual', 'Party', 'Work', 'Vacation', 'Evening']);
        const neck = rng.pick([
          'V-Neck',
          'Sweetheart Neck',
          'Square Neck',
          'Round Neck',
          'Off-Shoulder',
          'Halter Neck',
        ]);
        const colors = pickColors(rng, WOMENS_COLORS, 1, 3);
        const mrp =
          byTier(brand.tier, 1199, 2499, 4999) *
          (silhouette === 'Maxi' ? 1.2 : 1) *
          rng.float(0.85, 1.2);
        return {
          name: `${brand.name} Women's ${pattern} ${fabric} ${silhouette} Dress with ${neck}`,
          mrp,
          shortDescription: `${pattern} ${silhouette.toLowerCase()} dress in flowing ${fabric.toLowerCase()} — an easy pick for ${occasion.toLowerCase()} days.`,
          description: paragraph(
            rng,
            [
              `This ${silhouette.toLowerCase()} dress from ${brand.name} comes in ${pattern.toLowerCase()} ${fabric.toLowerCase()} with a flattering ${neck.toLowerCase()}.`,
            ],
            [
              'A concealed back zip makes it easy to put on.',
              'Lined at the bodice so it is not see-through.',
              `Dress it up with heels for ${occasion === 'Party' || occasion === 'Evening' ? 'the evening' : 'a dinner'}, or down with flats and a denim jacket.`,
              'Lightweight and breathable for warm weather.',
              'The waist is gently defined for a flattering shape.',
            ],
            3,
          ),
          highlights: [silhouette, fabric, pattern, neck, `${occasion} wear`],
          specifications: [
            spec('Silhouette', silhouette),
            spec('Fabric', fabric),
            spec('Pattern', pattern),
            spec('Neck', neck),
            spec('Occasion', occasion),
            spec(
              'Length',
              silhouette === 'Maxi'
                ? 'Maxi'
                : silhouette === 'Midi'
                  ? 'Midi'
                  : rng.pick(['Knee length', 'Midi', 'Above knee']),
            ),
            spec('Gender', 'Women'),
            spec('Care', rng.pick(CARE)),
          ],
          tags: [
            'dress',
            `${silhouette.toLowerCase()} dress`,
            'women',
            occasion.toLowerCase(),
            fabric.toLowerCase(),
          ],
          colors,
          sizes: sizeRun(rng, ALPHA_SIZES, 4, 6),
          trackVariants: true,
        };
      },
    },
    {
      key: 'ethnic wear',
      name: 'Ethnic Wear',
      code: 'ETH',
      weight: 8,
      images: 'kurtas',
      brands: brands(
        ['FabIndia', 'mid', 3],
        ['Biba', 'mid', 3],
        ['W', 'mid', 2],
        ['Libas', 'budget', 3],
        ['Manyavar', 'premium', 2],
        ['Anouk', 'budget', 2],
        ['Jaipur Kurti', 'budget', 2],
        ['Soch', 'mid', 2],
        ['Mitera', 'budget', 2],
        ['Kalini', 'budget', 1],
      ),
      discount: [0.25, 0.7],
      stockScale: 70,
      build({ rng, brand }) {
        const menswear =
          brand.name === 'Manyavar' || (brand.name === 'FabIndia' && rng.chance(0.4));
        const isSaree =
          !menswear &&
          (brand.name === 'Mitera' || brand.name === 'Soch' ? rng.chance(0.7) : rng.chance(0.25));
        const fabric = rng.pick(
          isSaree
            ? [
                'Banarasi Silk',
                'Georgette',
                'Chiffon',
                'Cotton Silk',
                'Organza',
                'Linen',
                'Chanderi',
              ]
            : ['Cotton', 'Rayon', 'Chanderi', 'Silk Blend', 'Khadi', 'Linen', 'Muslin'],
        );
        const work = rng.pick([
          'Block Print',
          'Embroidered',
          'Zari Woven',
          'Bandhani',
          'Chikankari',
          'Ikat',
          'Floral Print',
          'Mirror Work',
        ]);
        const colors = pickColors(rng, WOMENS_COLORS, 1, isSaree ? 1 : 3);

        if (isSaree) {
          const mrp =
            byTier(brand.tier, 1499, 2999, 7999) *
            (fabric.includes('Silk') ? 1.6 : 1) *
            rng.float(0.85, 1.25);
          return {
            name: `${brand.name} ${work} ${fabric} Saree with Unstitched Blouse Piece (${colors[0]!.name})`,
            mrp,
            shortDescription: `${work.toLowerCase()} ${fabric.toLowerCase()} saree, 5.5 m, with a 0.8 m unstitched blouse piece.`,
            description: paragraph(
              rng,
              [
                `A ${fabric.toLowerCase()} saree from ${brand.name} with ${work.toLowerCase()} detailing across the body and a contrast pallu.`,
              ],
              [
                'The saree measures 5.5 metres, with a 0.8 metre unstitched blouse piece.',
                'Drapes softly and holds pleats well through the day.',
                'A natural choice for festivals, weddings and pujas.',
                'Dry clean for the first wash to keep the colours rich.',
              ],
              2,
            ),
            highlights: [fabric, work, 'Saree length: 5.5 m', 'Blouse piece included'],
            specifications: [
              spec('Fabric', fabric),
              spec('Work', work),
              spec('Saree Length', '5.5 metres'),
              spec('Blouse Piece', '0.8 metres, unstitched'),
              spec('Occasion', rng.pick(['Festive', 'Wedding', 'Party', 'Daily wear'])),
              spec('Care', CARE[3]!),
            ],
            tags: [
              'saree',
              'ethnic wear',
              'women',
              fabric.toLowerCase(),
              work.toLowerCase(),
              'festive',
            ],
            colors,
            images: 'sarees',
          };
        }

        const type = menswear
          ? rng.pick(['Kurta', 'Kurta Pyjama Set', 'Nehru Jacket'])
          : rng.pick([
              'Straight Kurta',
              'Anarkali Kurta',
              'Kurta with Palazzos & Dupatta',
              'A-Line Kurta',
              'Kurta Set with Dupatta',
            ]);
        const set = type.includes('Set') || type.includes('&') || type.includes('Pyjama');
        const mrp = byTier(brand.tier, 899, 1999, 4999) * (set ? 1.6 : 1) * rng.float(0.85, 1.2);
        const gender = menswear ? 'Men' : 'Women';
        return {
          name: `${brand.name} ${gendered(gender)} ${work} ${fabric} ${type}`,
          mrp,
          shortDescription: `${work.toLowerCase()} ${fabric.toLowerCase()} ${type.toLowerCase()} for festive days and everyday elegance.`,
          description: paragraph(
            rng,
            [
              `A ${fabric.toLowerCase()} ${type.toLowerCase()} from ${brand.name}, finished with ${work.toLowerCase()} detailing.`,
            ],
            [
              'Breathable natural fabric keeps you comfortable through long celebrations.',
              set
                ? 'Comes as a coordinated set, so the outfit is ready to wear.'
                : 'Pair it with leggings, palazzos or churidars.',
              'Side slits allow easy movement.',
              'Colours are fixed to withstand gentle washing.',
            ],
            2,
          ),
          highlights: [fabric, work, type, `${gender}'s ethnic wear`],
          specifications: [
            spec('Type', type),
            spec('Fabric', fabric),
            spec('Work', work),
            spec('Gender', gender),
            spec('Sleeve', rng.pick(['Three-quarter sleeve', 'Full sleeve', 'Sleeveless'])),
            spec('Care', rng.pick(CARE.slice(1))),
          ],
          tags: [
            'kurta',
            'ethnic wear',
            gender.toLowerCase(),
            fabric.toLowerCase(),
            work.toLowerCase(),
            'festive',
          ],
          colors,
          sizes: sizeRun(rng, ALPHA_SIZES, 4, 6),
          trackVariants: true,
        };
      },
    },
  ],
};
