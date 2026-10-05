import type { CategoryDef } from '../types';
import { brands, byTier, paragraph, refCode, spec } from './helpers';

const stars = (rating: number) => `${rating} Star`;

export const appliances: CategoryDef = {
  slug: 'appliances',
  name: 'Home Appliances',
  description: 'Refrigerators, washing machines, kitchen and cleaning appliances',
  image:
    'https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?auto=format&fit=crop&w=700&q=80',
  gstRate: 18,
  hsnCode: '8418',
  tryOnEnabled: false,
  code: 'APL',
  weight: 10,
  reviewScale: 1400,
  subcategories: [
    {
      key: 'refrigerators',
      name: 'Refrigerators',
      code: 'REF',
      weight: 6,
      images: 'refrigerators',
      brands: brands(
        ['LG', 'mid', 3],
        ['Samsung', 'mid', 3],
        ['Whirlpool', 'mid', 3],
        ['Godrej', 'budget', 2],
        ['Haier', 'budget', 2],
        ['Panasonic', 'mid', 1],
        ['Bosch', 'premium', 1],
      ),
      discount: [0.12, 0.4],
      stockScale: 15,
      lowStockThreshold: 3,
      build({ rng, brand }) {
        const kind = rng.weighted([
          ['Single Door', 4],
          ['Double Door Frost Free', 4],
          ['Side-by-Side', 1],
          ['Triple Door Frost Free', 1],
        ] as const);
        const litres =
          kind === 'Single Door'
            ? rng.pick([185, 190, 207, 215, 240])
            : kind === 'Side-by-Side'
              ? rng.pick([600, 630, 653, 690])
              : rng.pick([236, 253, 265, 292, 308, 340, 360]);
        const rating = kind === 'Side-by-Side' ? rng.pick([1, 2, 3]) : rng.pick([2, 3, 3, 4, 5]);
        const color = rng.pick([
          'Shiny Steel',
          'Dazzle Steel',
          'Black Glass',
          'Blue Floral',
          'Wine Bloom',
          'Silver Dew',
        ]);
        const base = {
          'Single Door': 15000,
          'Double Door Frost Free': 26000,
          'Side-by-Side': 72000,
          'Triple Door Frost Free': 34000,
        }[kind];
        const mrp =
          base *
          (litres / (kind === 'Single Door' ? 200 : kind === 'Side-by-Side' ? 630 : 270)) ** 0.8 *
          byTier(brand.tier, 0.9, 1.05, 1.4) *
          (1 + (rating - 3) * 0.07) *
          rng.float(0.92, 1.1);
        const model = refCode(rng, `AA-${kind === 'Single Door' ? 'D' : 'T'}###AAA`);
        return {
          name: `${brand.name} ${litres} L ${stars(rating)} Inverter ${kind} Refrigerator (${model}, ${color})`,
          mrp,
          shortDescription: `${litres} litre ${kind.toLowerCase()} fridge, ${rating}-star energy rating, inverter compressor with 10-year warranty.`,
          description: paragraph(
            rng,
            [
              `The ${brand.name} ${litres}-litre ${kind.toLowerCase()} refrigerator suits ${litres < 250 ? 'small families of 2–3' : litres < 400 ? 'families of 3–5' : 'large families'}.`,
            ],
            [
              'A smart inverter compressor adjusts its speed to demand, running quieter and using less power.',
              kind === 'Single Door'
                ? 'Direct cool technology with a quick-ice tray.'
                : 'Frost-free cooling means no manual defrosting, ever.',
              'Toughened glass shelves hold heavy cookware.',
              'Stabiliser-free operation handles voltage fluctuations from 100V to 300V.',
              'A large vegetable crisper keeps produce fresh for longer.',
              'Convertible mode turns the freezer into a fridge when you need extra space.',
            ],
            3,
          ),
          highlights: [
            `${litres} L capacity`,
            `${rating} star energy rating`,
            'Inverter compressor',
            kind,
            '10 year compressor warranty',
          ],
          specifications: [
            spec('Type', kind),
            spec('Capacity', `${litres} L`),
            spec('Energy Rating', `${rating} Star (BEE)`),
            spec('Compressor', 'Inverter'),
            spec('Defrost', kind === 'Single Door' ? 'Direct cool (manual)' : 'Frost free (auto)'),
            spec('Annual Energy Consumption', `${Math.round(litres * (1.25 - rating * 0.12))} kWh`),
            spec('Model Number', model),
            spec('Colour', color),
            spec('Warranty', '1 year on product, 10 years on compressor'),
          ],
          tags: ['refrigerator', 'fridge', kind.toLowerCase(), `${rating} star`, 'inverter'],
        };
      },
    },
    {
      key: 'washing machines',
      name: 'Washing Machines',
      code: 'WSH',
      weight: 6,
      images: 'washingMachines',
      brands: brands(
        ['LG', 'mid', 3],
        ['Samsung', 'mid', 3],
        ['IFB', 'mid', 3],
        ['Whirlpool', 'mid', 2],
        ['Bosch', 'premium', 2],
        ['Godrej', 'budget', 1],
        ['Haier', 'budget', 2],
      ),
      discount: [0.12, 0.4],
      stockScale: 15,
      lowStockThreshold: 3,
      build({ rng, brand }) {
        const kind = rng.weighted([
          ['Fully Automatic Front Load', 4],
          ['Fully Automatic Top Load', 4],
          ['Semi-Automatic Top Load', 2],
        ] as const);
        const kg = kind.includes('Front')
          ? rng.pick([6, 7, 8, 9])
          : kind.includes('Semi')
            ? rng.pick([7, 7.5, 8, 9])
            : rng.pick([6.5, 7, 8, 9, 10]);
        const rpm = kind.includes('Front')
          ? rng.pick([1000, 1200, 1400])
          : rng.pick([700, 740, 780]);
        const rating = rng.pick([3, 4, 5, 5]);
        const base = {
          'Fully Automatic Front Load': 30000,
          'Fully Automatic Top Load': 19000,
          'Semi-Automatic Top Load': 11000,
        }[kind];
        const mrp =
          base * (kg / 7) ** 0.6 * byTier(brand.tier, 0.9, 1.05, 1.35) * rng.float(0.92, 1.1);
        const color = rng.pick(['Middle Black', 'White', 'Silver', 'Inox Grey', 'Lavender']);
        return {
          name: `${brand.name} ${kg} kg ${stars(rating)} ${kind} Washing Machine${kind.includes('Fully') ? ' with Inverter Motor' : ''} (${color})`,
          mrp,
          shortDescription: `${kg} kg ${kind.toLowerCase()} washer, ${rpm} RPM, ${rating}-star energy rating.`,
          description: paragraph(
            rng,
            [
              `The ${brand.name} ${kg} kg ${kind.toLowerCase()} washing machine is sized for ${kg < 7 ? 'couples and small families' : kg < 8.5 ? 'families of 3–5' : 'large families'}.`,
            ],
            [
              kind.includes('Fully')
                ? 'An inverter direct-drive motor runs quietly and efficiently, with fewer moving parts to wear out.'
                : 'Separate wash and spin tubs let you wash one load while the last one dries.',
              `A ${rpm} RPM spin leaves clothes nearly dry.`,
              kind.includes('Front')
                ? 'An in-built heater removes tough stains and allergens with hot-water washes.'
                : 'A turbo-drum pulsator tackles tough Indian dirt and collar stains.',
              'Dedicated programmes for cottons, synthetics, wool, quick wash and baby care.',
              'Child lock and auto-restart after power cuts.',
            ],
            3,
          ),
          highlights: [
            `${kg} kg capacity`,
            `${rating} star rating`,
            `${rpm} RPM`,
            kind,
            ...(kind.includes('Fully') ? ['Inverter motor'] : []),
          ],
          specifications: [
            spec('Type', kind),
            spec('Capacity', `${kg} kg`),
            spec('Energy Rating', `${rating} Star (BEE)`),
            spec('Max Spin Speed', `${rpm} RPM`),
            spec('Wash Programmes', String(rng.int(8, 16))),
            spec('In-built Heater', kind.includes('Front') ? 'Yes' : 'No'),
            spec('Colour', color),
            spec('Warranty', `2 years on product, ${rng.pick([5, 10])} years on motor`),
          ],
          tags: [
            'washing machine',
            kind.toLowerCase(),
            `${kg} kg`,
            ...(kind.includes('Front') ? ['front load'] : ['top load']),
          ],
        };
      },
    },
    {
      key: 'microwaves and otg',
      name: 'Microwaves & OTGs',
      code: 'MWV',
      weight: 4,
      images: 'microwaves',
      brands: brands(
        ['Samsung', 'mid', 3],
        ['LG', 'mid', 3],
        ['IFB', 'mid', 2],
        ['Panasonic', 'mid', 1],
        ['Morphy Richards', 'mid', 2],
        ['Bajaj', 'budget', 2],
        ['Agaro', 'budget', 1],
      ),
      discount: [0.1, 0.4],
      stockScale: 30,
      build({ rng, brand }) {
        const kind = rng.pick([
          'Solo Microwave Oven',
          'Grill Microwave Oven',
          'Convection Microwave Oven',
          'Oven Toaster Grill (OTG)',
        ] as const);
        const litres =
          kind === 'Solo Microwave Oven'
            ? 20
            : kind === 'Grill Microwave Oven'
              ? rng.pick([20, 23])
              : kind.includes('OTG')
                ? rng.pick([25, 30, 40, 60])
                : rng.pick([25, 28, 30, 32]);
        const watts = kind.includes('OTG')
          ? rng.pick([1500, 1600, 2000])
          : rng.pick([800, 900, 1200]);
        const base = {
          'Solo Microwave Oven': 6000,
          'Grill Microwave Oven': 7500,
          'Convection Microwave Oven': 13000,
          'Oven Toaster Grill (OTG)': 6500,
        }[kind];
        const mrp =
          base * (litres / 25) ** 0.4 * byTier(brand.tier, 0.9, 1.05, 1.3) * rng.float(0.92, 1.1);
        return {
          name: `${brand.name} ${litres} L ${kind} with ${rng.int(40, 200)} Auto Cook Menus (${rng.pick(['Black', 'Silver', 'Black Mirror'])})`,
          mrp,
          shortDescription: `${litres} litre ${kind.toLowerCase()}, ${watts}W, with auto-cook menus for Indian recipes.`,
          description: paragraph(
            rng,
            [
              `The ${brand.name} ${litres}-litre ${kind.toLowerCase()} handles reheating, ${kind.includes('Solo') ? 'defrosting and simple cooking' : 'grilling, baking and roasting'} in one compact unit.`,
            ],
            [
              'Auto-cook menus cover Indian favourites from paneer tikka to dhokla.',
              'A steam-clean function and enamel cavity make wiping it down easy.',
              'Child lock keeps curious hands away.',
              'Touch and dial controls are simple to learn.',
              'Includes a glass turntable, grill rack and baking tray where applicable.',
            ],
            3,
          ),
          highlights: [`${litres} L capacity`, `${watts} W`, kind, 'Auto-cook menus'],
          specifications: [
            spec('Type', kind),
            spec('Capacity', `${litres} L`),
            spec('Power', `${watts} W`),
            spec('Control', rng.pick(['Touch keypad', 'Jog dial', 'Mechanical knobs'])),
            spec('Warranty', '1 year on product, 3 years on magnetron'),
          ],
          tags: [
            'microwave',
            kind.toLowerCase(),
            'kitchen appliance',
            ...(kind.includes('OTG') ? ['otg', 'baking'] : []),
          ],
        };
      },
    },
    {
      key: 'mixer grinders',
      name: 'Mixer Grinders & Blenders',
      code: 'MXR',
      weight: 5,
      images: 'mixers',
      brands: brands(
        ['Preethi', 'mid', 3],
        ['Philips', 'mid', 3],
        ['Bajaj', 'budget', 3],
        ['Prestige', 'mid', 2],
        ['Sujata', 'mid', 2],
        ['Butterfly', 'budget', 2],
        ['Wonderchef', 'mid', 1],
        ['NutriBullet', 'premium', 1],
      ),
      discount: [0.15, 0.5],
      stockScale: 60,
      build({ rng, brand }) {
        const kind = rng.pick([
          'Mixer Grinder',
          'Juicer Mixer Grinder',
          'Hand Blender',
          'Personal Blender',
          'Food Processor',
        ] as const);
        const watts =
          kind === 'Hand Blender'
            ? rng.pick([300, 400, 600])
            : kind === 'Personal Blender'
              ? rng.pick([400, 600, 900])
              : rng.pick([500, 750, 1000]);
        const jars =
          kind === 'Hand Blender'
            ? 0
            : kind === 'Personal Blender'
              ? rng.pick([1, 2])
              : rng.pick([3, 4]);
        const base = {
          'Mixer Grinder': 3500,
          'Juicer Mixer Grinder': 5500,
          'Hand Blender': 2000,
          'Personal Blender': 3000,
          'Food Processor': 8000,
        }[kind];
        const mrp =
          base * (watts / 750) ** 0.4 * byTier(brand.tier, 0.85, 1.1, 2) * rng.float(0.9, 1.1);
        return {
          name: `${brand.name} ${watts}W ${kind}${jars ? ` with ${jars} ${jars === 1 ? 'Jar' : 'Jars'}` : ''} (${rng.pick(['White & Blue', 'Black', 'Red & Black', 'Grey', 'Ivory'])})`,
          mrp,
          shortDescription: `${watts}W ${kind.toLowerCase()}${jars ? ` with ${jars} stainless steel jars` : ''} for chutneys, batters and smoothies.`,
          description: paragraph(
            rng,
            [
              `The ${brand.name} ${kind.toLowerCase()} runs on a ${watts}W motor built for Indian kitchens — idli batter, masalas, chutneys and shakes.`,
            ],
            [
              jars
                ? `${jars} leak-proof stainless steel ${jars === 1 ? 'jar' : 'jars'} cover wet and dry grinding.`
                : 'An ergonomic grip and stainless steel blending shaft make quick work of soups and purées.',
              'Overload protection switches the motor off before it overheats.',
              'Three speeds plus a pulse function for precise control.',
              'Copper-wound motor for a long working life.',
              'Rubber feet keep it steady on the counter.',
            ],
            3,
          ),
          highlights: [
            `${watts} W motor`,
            jars ? `${jars} jars` : 'Stainless steel shaft',
            'Overload protection',
            `${rng.pick([2, 5])} year motor warranty`,
          ],
          specifications: [
            spec('Type', kind),
            spec('Power', `${watts} W`),
            ...(jars ? [spec('Number of Jars', String(jars))] : []),
            spec('Speed Settings', '3 + pulse'),
            spec('Warranty', `2 years on product, ${rng.pick([2, 5])} years on motor`),
          ],
          tags: [
            'mixer grinder',
            'kitchen appliance',
            kind.toLowerCase(),
            ...(kind.includes('Blender') ? ['blender'] : []),
          ],
        };
      },
    },
    {
      key: 'kettles and coffee makers',
      name: 'Kettles & Coffee Makers',
      code: 'KTL',
      weight: 4,
      images: 'kettlesCoffee',
      brands: brands(
        ['Philips', 'mid', 3],
        ['Prestige', 'mid', 2],
        ['Pigeon', 'budget', 3],
        ['Havells', 'mid', 2],
        ['Kent', 'mid', 1],
        ['Morphy Richards', 'mid', 2],
        ["De'Longhi", 'premium', 1],
        ['Agaro', 'budget', 2],
      ),
      discount: [0.15, 0.5],
      stockScale: 80,
      build({ rng, brand }) {
        const kind =
          brand.name === "De'Longhi"
            ? rng.pick(['Espresso Coffee Machine', 'Drip Coffee Maker'] as const)
            : rng.weighted([
                ['Electric Kettle', 6],
                ['Drip Coffee Maker', 2],
                ['Espresso Coffee Machine', 1],
              ] as const);
        const capacity =
          kind === 'Electric Kettle'
            ? `${rng.pick([1, 1.2, 1.5, 1.7, 1.8])} L`
            : kind === 'Drip Coffee Maker'
              ? `${rng.pick([4, 6, 10])} cups`
              : `${rng.pick([15, 19])} bar`;
        const material =
          kind === 'Electric Kettle'
            ? rng.pick(['Stainless Steel', 'Double-Wall Cool Touch', 'Borosilicate Glass'])
            : 'Stainless steel and BPA-free plastic';
        const base = {
          'Electric Kettle': 1299,
          'Drip Coffee Maker': 3499,
          'Espresso Coffee Machine': 12999,
        }[kind];
        const mrp = base * byTier(brand.tier, 0.85, 1.15, 2.2) * rng.float(0.9, 1.15);
        return {
          name: `${brand.name} ${capacity} ${kind === 'Electric Kettle' ? `${material} ` : ''}${kind} (${rng.pick(['Silver', 'Black', 'White', 'Copper'])})`,
          mrp,
          shortDescription:
            kind === 'Electric Kettle'
              ? `${capacity} ${material.toLowerCase()} kettle with auto shut-off and boil-dry protection.`
              : `${capacity} ${kind.toLowerCase()} for café-style coffee at home.`,
          description: paragraph(
            rng,
            [
              kind === 'Electric Kettle'
                ? `The ${brand.name} ${capacity} electric kettle boils water for tea, coffee and instant noodles in minutes.`
                : `The ${brand.name} ${kind.toLowerCase()} brings café-style coffee to your kitchen counter.`,
            ],
            kind === 'Electric Kettle'
              ? [
                  'Automatic shut-off and boil-dry protection for safety.',
                  'A 360° swivel base and concealed element make it easy to use and clean.',
                  'A wide mouth makes descaling simple.',
                  'Indicator light shows when it is heating.',
                ]
              : [
                  'A removable drip tray and water tank simplify cleaning.',
                  'An anti-drip function lets you pour a cup mid-brew.',
                  'Keep-warm plate holds coffee at serving temperature.',
                  'A milk frother on espresso models makes cappuccinos and lattes.',
                ],
            2,
          ),
          highlights: [
            capacity,
            material,
            kind === 'Electric Kettle' ? 'Auto shut-off' : 'Easy-clean design',
          ],
          specifications: [
            spec('Type', kind),
            spec('Capacity', capacity),
            spec('Material', material),
            spec('Power', `${rng.pick([1200, 1500, 1800])} W`),
            spec('Warranty', `${rng.pick([1, 2])} year manufacturer warranty`),
          ],
          tags: [
            'kitchen appliance',
            kind.toLowerCase(),
            ...(kind.includes('Coffee') ? ['coffee'] : ['kettle']),
          ],
        };
      },
    },
    {
      key: 'vacuum cleaners',
      name: 'Vacuum Cleaners',
      code: 'VAC',
      weight: 4,
      images: 'vacuums',
      brands: brands(
        ['Eureka Forbes', 'mid', 3],
        ['Philips', 'mid', 2],
        ['Dyson', 'premium', 1],
        ['Agaro', 'budget', 2],
        ['Karcher', 'mid', 1],
        ['Xiaomi', 'mid', 2],
        ['iRobot', 'premium', 1],
      ),
      discount: [0.15, 0.5],
      stockScale: 30,
      build({ rng, brand }) {
        const kind =
          brand.name === 'iRobot'
            ? ('Robot Vacuum Cleaner' as const)
            : brand.name === 'Dyson'
              ? ('Cordless Stick Vacuum Cleaner' as const)
              : rng.pick([
                  'Robot Vacuum Cleaner',
                  'Cordless Stick Vacuum Cleaner',
                  'Wet & Dry Vacuum Cleaner',
                  'Handheld Vacuum Cleaner',
                ] as const);
        const suction = kind.includes('Robot')
          ? `${rng.pick([2700, 4000, 5000, 6000])} Pa`
          : `${rng.pick([120, 150, 185, 230])} AW`;
        const runtime = kind.includes('Wet') ? 0 : rng.pick([30, 40, 60, 120, 180]);
        const base = {
          'Robot Vacuum Cleaner': 22000,
          'Cordless Stick Vacuum Cleaner': 16000,
          'Wet & Dry Vacuum Cleaner': 7000,
          'Handheld Vacuum Cleaner': 4000,
        }[kind];
        const mrp = base * byTier(brand.tier, 0.8, 1.1, 2.6) * rng.float(0.9, 1.15);
        return {
          name: `${brand.name} ${kind}${kind.includes('Robot') ? ' with LiDAR Navigation and Mopping' : ''}, ${suction} Suction`,
          mrp,
          shortDescription: `${kind.toLowerCase()}, ${suction} suction${runtime ? `, up to ${runtime} minutes runtime` : ''}, HEPA filtration.`,
          description: paragraph(
            rng,
            [
              `The ${brand.name} ${kind.toLowerCase()} delivers ${suction} of suction for dust, crumbs and pet hair.`,
            ],
            [
              kind.includes('Robot')
                ? 'LiDAR mapping plans efficient routes and lets you set no-go zones from the app.'
                : 'Multiple attachments cover floors, sofas, curtains and car interiors.',
              runtime
                ? `Runs for up to ${runtime} minutes on a charge.`
                : 'Handles wet spills as easily as dry dust.',
              'A washable HEPA filter traps fine dust and allergens.',
              'Easy-empty dust bin — no bags to buy.',
              kind.includes('Robot')
                ? 'Works with Alexa and Google Assistant.'
                : 'Lightweight enough to carry up and down stairs.',
            ],
            3,
          ),
          highlights: [
            kind,
            `${suction} suction`,
            runtime ? `${runtime} min runtime` : 'Wet & dry',
            'HEPA filter',
          ],
          specifications: [
            spec('Type', kind),
            spec('Suction Power', suction),
            ...(runtime ? [spec('Runtime', `Up to ${runtime} minutes`)] : []),
            spec('Filter', 'Washable HEPA'),
            spec('Dust Capacity', `${rng.pick([0.4, 0.5, 0.6, 1.5, 15])} L`),
            spec('Warranty', `${rng.pick([1, 2])} year manufacturer warranty`),
          ],
          tags: [
            'vacuum cleaner',
            'cleaning',
            kind.toLowerCase(),
            ...(kind.includes('Robot') ? ['robot vacuum'] : []),
          ],
        };
      },
    },
    {
      key: 'fans',
      name: 'Fans',
      code: 'FAN',
      weight: 3,
      images: 'fans',
      brands: brands(
        ['Havells', 'mid', 3],
        ['Crompton', 'mid', 3],
        ['Orient Electric', 'mid', 2],
        ['Usha', 'mid', 2],
        ['Bajaj', 'budget', 3],
        ['Atomberg', 'premium', 1],
      ),
      discount: [0.1, 0.45],
      stockScale: 60,
      build({ rng, brand }) {
        const kind = rng.pick(['Table Fan', 'Pedestal Fan', 'Wall Fan'] as const);
        const mm = rng.pick([300, 400, 450]);
        const bldc = brand.name === 'Atomberg' || rng.chance(0.2);
        const watts = bldc ? rng.pick([28, 32, 35]) : rng.pick([50, 55, 75, 100]);
        const mrp =
          { 'Table Fan': 2200, 'Pedestal Fan': 3200, 'Wall Fan': 2600 }[kind] *
          (bldc ? 1.6 : 1) *
          byTier(brand.tier, 0.85, 1.05, 1.3) *
          rng.float(0.9, 1.1);
        return {
          name: `${brand.name} ${mm} mm ${bldc ? 'BLDC ' : ''}${kind} with ${rng.pick(['3-Speed Control', 'Remote Control', 'Oscillation', 'Timer'])} (${rng.pick(['White', 'Black', 'Ivory', 'Brown'])})`,
          mrp,
          shortDescription: `${mm} mm ${kind.toLowerCase()}, ${watts}W${bldc ? ' energy-saving BLDC motor' : ''}, high air delivery.`,
          description: paragraph(
            rng,
            [
              `The ${brand.name} ${mm} mm ${kind.toLowerCase()} moves a lot of air without much noise.`,
            ],
            [
              bldc
                ? `A BLDC motor draws just ${watts}W — up to 65% less than an ordinary fan.`
                : `A ${watts}W copper motor keeps air moving through Indian summers.`,
              'Wide-angle oscillation spreads the breeze across the room.',
              'A sturdy, rust-free body and powder-coated guard.',
              'Easy to assemble at home in minutes.',
            ],
            2,
          ),
          highlights: [`${mm} mm sweep`, `${watts} W`, kind, bldc ? 'BLDC motor' : 'Copper motor'],
          specifications: [
            spec('Type', kind),
            spec('Sweep', `${mm} mm`),
            spec('Power', `${watts} W`),
            spec('Motor', bldc ? 'BLDC' : 'Copper induction'),
            spec('Speed Settings', '3'),
            spec('Warranty', `${rng.pick([1, 2])} year manufacturer warranty`),
          ],
          tags: ['fan', kind.toLowerCase(), 'cooling', 'summer', ...(bldc ? ['bldc fan'] : [])],
        };
      },
    },
    {
      key: 'irons',
      name: 'Irons',
      code: 'IRN',
      weight: 3,
      images: 'irons',
      brands: brands(
        ['Philips', 'mid', 3],
        ['Bajaj', 'budget', 3],
        ['Havells', 'mid', 2],
        ['Morphy Richards', 'mid', 2],
        ['Usha', 'budget', 2],
        ['Panasonic', 'mid', 1],
      ),
      discount: [0.1, 0.45],
      stockScale: 80,
      build({ rng, brand }) {
        const steam = rng.chance(0.6);
        const watts = steam ? rng.pick([1440, 1600, 2000, 2400]) : rng.pick([750, 1000, 1100]);
        const plate = rng.pick([
          'Non-stick coated',
          'Ceramic',
          'American Heritage',
          'Stainless steel',
        ]);
        const mrp =
          (steam ? 1999 : 799) *
          (watts / (steam ? 1600 : 1000)) ** 0.5 *
          byTier(brand.tier, 0.85, 1.05, 1.4) *
          rng.float(0.9, 1.1);
        const kind = steam ? 'Steam Iron' : 'Dry Iron';
        return {
          name: `${brand.name} ${watts}W ${kind} with ${plate} Soleplate (${rng.pick(['Blue', 'White', 'Purple', 'Grey', 'Teal'])})`,
          mrp,
          shortDescription: `${watts}W ${kind.toLowerCase()} with a ${plate.toLowerCase()} soleplate${steam ? ' and vertical steaming' : ''}.`,
          description: paragraph(
            rng,
            [
              `The ${brand.name} ${watts}W ${kind.toLowerCase()} glides smoothly over cotton, silk and linen on its ${plate.toLowerCase()} soleplate.`,
            ],
            [
              steam
                ? 'Continuous steam and a shot of burst steam take out stubborn creases, and vertical steaming refreshes hanging clothes.'
                : 'Heats up quickly and is light enough for everyday ironing.',
              'An adjustable thermostat dial matches heat to every fabric.',
              '360° swivel cord keeps it from tangling.',
              'Auto shut-off for peace of mind.',
            ],
            2,
          ),
          highlights: [
            `${watts} W`,
            `${plate} soleplate`,
            steam ? 'Vertical steaming' : 'Lightweight',
            'Adjustable thermostat',
          ],
          specifications: [
            spec('Type', kind),
            spec('Power', `${watts} W`),
            spec('Soleplate', plate),
            ...(steam ? [spec('Water Tank', `${rng.pick([200, 250, 300])} ml`)] : []),
            spec('Warranty', `${rng.pick([1, 2])} year manufacturer warranty`),
          ],
          tags: ['iron', kind.toLowerCase(), 'laundry', 'clothes care'],
        };
      },
    },
  ],
};
