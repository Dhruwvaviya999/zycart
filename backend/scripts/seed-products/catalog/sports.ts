import type { CategoryDef } from '../types';
import { brands, byTier, paragraph, spec } from './helpers';

export const sports: CategoryDef = {
  slug: 'sports',
  name: 'Sports & Fitness',
  description: 'Gym equipment, yoga, cricket, ball sports, rackets and cycles',
  image:
    'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=700&q=80',
  gstRate: 5,
  hsnCode: '9506',
  tryOnEnabled: false,
  code: 'SPT',
  weight: 7,
  reviewScale: 900,
  subcategories: [
    {
      key: 'gym equipment',
      name: 'Gym Equipment',
      code: 'GYM',
      weight: 6,
      images: 'gymEquipment',
      brands: brands(
        ['Kore', 'budget', 3],
        ['Cockatoo', 'budget', 2],
        ['Domyos', 'mid', 2],
        ['Boldfit', 'budget', 3],
        ['Strauss', 'budget', 2],
        ['PowerMax Fitness', 'mid', 2],
        ['Lifelong', 'budget', 2],
      ),
      discount: [0.2, 0.65],
      stockScale: 60,
      build({ rng, brand }) {
        const kind = rng.pick([
          [
            'Rubber Coated Hex Dumbbells (Pair)',
            (): number => rng.pick([2.5, 5, 7.5, 10, 12.5, 15]),
            180,
          ],
          ['Adjustable Dumbbell Set', (): number => rng.pick([10, 20, 24]), 220],
          ['Cast Iron Kettlebell', (): number => rng.pick([4, 8, 12, 16, 20, 24]), 150],
          ['PVC Home Gym Set with Rods', (): number => rng.pick([10, 20, 30, 50]), 90],
          ['Olympic Weight Plates (Pair)', (): number => rng.pick([5, 10, 15, 20]), 160],
        ] as const);
        const [type, weightOf, perKg] = kind;
        const kg = weightOf();
        const mrp =
          Math.max(599, kg * perKg) * byTier(brand.tier, 0.85, 1.1, 1.6) * rng.float(0.9, 1.15);
        return {
          name: `${brand.name} ${type}, ${kg} kg${type.includes('Pair') ? ' each' : ''}`,
          mrp,
          shortDescription: `${kg} kg ${type.toLowerCase()} for strength training at home or in the gym.`,
          description: paragraph(
            rng,
            [
              `${brand.name}'s ${type.toLowerCase()} (${kg} kg) is built for daily strength training at home.`,
            ],
            [
              'A knurled, chrome-plated handle gives a secure, non-slip grip.',
              'Rubber coating protects your floor and reduces noise.',
              'Suits beginners and experienced lifters alike.',
              'Use it for curls, presses, rows, squats and swings.',
              'Weight is moulded clearly on each piece.',
            ],
            3,
          ),
          highlights: [`${kg} kg`, type, 'Non-slip grip', 'Floor-friendly coating'],
          specifications: [
            spec('Type', type),
            spec('Weight', `${kg} kg`),
            spec(
              'Material',
              type.includes('PVC')
                ? 'PVC with cement fill'
                : type.includes('Cast')
                  ? 'Cast iron'
                  : 'Rubber-coated iron',
            ),
            spec('Warranty', '6 months against manufacturing defects'),
          ],
          tags: [
            'gym',
            'fitness',
            'home gym',
            'weights',
            type.toLowerCase(),
            ...(type.includes('Dumbbell') ? ['dumbbells'] : []),
          ],
        };
      },
    },
    {
      key: 'yoga and fitness accessories',
      name: 'Yoga & Fitness Accessories',
      code: 'YGA',
      weight: 6,
      images: 'yoga',
      brands: brands(
        ['Boldfit', 'budget', 3],
        ['Strauss', 'budget', 3],
        ['Kimjaly', 'mid', 2],
        ['Lifelong', 'budget', 2],
        ['Nivia', 'mid', 2],
        ['Reebok', 'mid', 1],
        ['Liforme', 'premium', 1],
      ),
      discount: [0.2, 0.7],
      stockScale: 120,
      build({ rng, brand }) {
        const kind = rng.pick([
          [
            'Yoga Mat',
            (): string =>
              `${rng.pick([4, 6, 8, 10])} mm, ${rng.pick(['TPE', 'NBR', 'PVC', 'Natural Rubber'])}`,
            799,
          ],
          ['Yoga Block (Pair)', (): string => 'High-density EVA foam', 499],
          ['Skipping Rope', (): string => 'Ball-bearing handles, adjustable length', 349],
          ['Foam Roller', (): string => `${rng.pick([30, 45, 60])} cm, textured EVA`, 699],
          ['Resistance Band Set (5 Levels)', (): string => 'Natural latex', 599],
          ['Ab Roller Wheel', (): string => 'Dual wheel with knee mat', 499],
        ] as const);
        const [type, detailOf, base] = kind;
        const detail = detailOf();
        const color = rng.pick(['Purple', 'Teal', 'Black', 'Blue', 'Pink', 'Grey', 'Green']);
        const mrp = base * byTier(brand.tier, 0.85, 1.2, 6) * rng.float(0.9, 1.2);
        return {
          name: `${brand.name} ${type} - ${detail} (${color})`,
          mrp,
          shortDescription: `${type.toLowerCase()}, ${detail.toLowerCase()}, for yoga, pilates and home workouts.`,
          description: paragraph(
            rng,
            [
              `The ${brand.name} ${type.toLowerCase()} (${detail.toLowerCase()}) is made for yoga, pilates and everyday home workouts.`,
            ],
            [
              'Non-slip texture keeps you steady through every pose and rep.',
              'Sweat-resistant and easy to wipe clean.',
              'Lightweight and comes with a carry strap or pouch.',
              'Free of toxic phthalates and heavy metals.',
            ],
            2,
          ),
          highlights: [type, detail, 'Non-slip', 'Lightweight'],
          specifications: [
            spec('Type', type),
            spec('Details', detail),
            spec('Colour', color),
            spec('Warranty', '6 months against manufacturing defects'),
          ],
          tags: [
            'yoga',
            'fitness',
            'home workout',
            type.toLowerCase(),
            ...(type.includes('Mat') ? ['yoga mat'] : []),
          ],
        };
      },
    },
    {
      key: 'cricket',
      name: 'Cricket',
      code: 'CRK',
      weight: 5,
      images: 'cricket',
      brands: brands(
        ['SG', 'mid', 3],
        ['SS', 'mid', 3],
        ['MRF', 'premium', 1],
        ['Kookaburra', 'premium', 1],
        ['Gray-Nicolls', 'premium', 1],
        ['DSC', 'mid', 2],
        ['Nivia', 'budget', 1],
      ),
      discount: [0.1, 0.5],
      stockScale: 50,
      build({ rng, brand }) {
        const kind = rng.pick([
          [
            'English Willow Cricket Bat',
            (): string => `Grade ${rng.int(1, 4)}, Short Handle`,
            6999,
          ],
          [
            'Kashmir Willow Cricket Bat',
            (): string => `Size ${rng.pick(['5', '6', 'Harrow', 'SH'])}`,
            1999,
          ],
          [
            'Leather Cricket Ball (Pack of 2)',
            (): string => rng.pick(['Red, 4-piece', 'White, 4-piece', 'Pink, 2-piece']),
            899,
          ],
          [
            'Heavy Tennis Cricket Ball (Pack of 6)',
            (): string => rng.pick(['Yellow', 'Green', 'Red']),
            499,
          ],
          [
            'Batting Gloves',
            (): string => rng.pick(['Men, Right Hand', 'Men, Left Hand', 'Youth, Right Hand']),
            1299,
          ],
        ] as const);
        const [type, detailOf, base] = kind;
        const detail = detailOf();
        const series = rng.pick([
          'Test',
          'Players Edition',
          'Club',
          'Ton',
          'Reserve',
          'Pro Elite',
          'Cobra',
          'Master',
          'Genius',
          'Intense',
        ]);
        const grade = type.includes('English')
          ? 5 - Number(detail.match(/Grade (\d)/)?.[1] ?? 3)
          : 1;
        const mrp =
          base *
          byTier(brand.tier, 0.8, 1.1, 2) *
          (type.includes('English') ? 1 + grade * 0.35 : 1) *
          rng.float(0.9, 1.15);
        return {
          name: `${brand.name} ${series} ${type} (${detail})`,
          mrp,
          shortDescription: `${type.toLowerCase()} — ${detail.toLowerCase()} — for club and practice cricket.`,
          description: paragraph(
            rng,
            [
              `The ${brand.name} ${series} ${type.toLowerCase()} is made for club matches and serious net sessions.`,
            ],
            type.includes('Bat')
              ? [
                  'A thick edge and low-middle sweet spot reward drives through the V.',
                  'Comes pre-knocked; we still recommend 2–3 hours of knocking in.',
                  'A cane handle with a rubber grip absorbs shock.',
                  'Supplied with a full-length cover.',
                ]
              : [
                  'Hand-stitched seam holds its shape over many overs.',
                  'Consistent bounce for realistic practice.',
                  'Tested to stay hard and round through hours of play.',
                ],
            2,
          ),
          highlights: [type, detail, `${series} range`],
          specifications: [
            spec('Type', type),
            spec('Details', detail),
            spec('Range', series),
            spec('Ideal For', type.includes('Youth') ? 'Youth' : 'Adults'),
          ],
          tags: [
            'cricket',
            type.toLowerCase(),
            ...(type.includes('Bat')
              ? ['cricket bat']
              : type.includes('Ball')
                ? ['cricket ball']
                : ['cricket gear']),
          ],
        };
      },
    },
    {
      key: 'ball sports',
      name: 'Football & Basketball',
      code: 'BAL',
      weight: 4,
      images: 'ballSports',
      brands: brands(
        ['Nivia', 'budget', 3],
        ['Cosco', 'budget', 3],
        ['Adidas', 'premium', 2],
        ['Nike', 'premium', 1],
        ['Spalding', 'mid', 1],
        ['Molten', 'mid', 1],
        ['Vector X', 'budget', 2],
        ['Kipsta', 'mid', 2],
      ),
      discount: [0.1, 0.55],
      stockScale: 80,
      build({ rng, brand }) {
        const sport = rng.pick(['Football', 'Football', 'Basketball']);
        const size = sport === 'Football' ? rng.pick([3, 4, 5, 5]) : rng.pick([5, 6, 7, 7]);
        const build = rng.pick([
          'Hand Stitched',
          'Machine Stitched',
          'Thermo-Bonded',
          'Rubber Moulded',
        ]);
        const series = rng.pick([
          'Storm',
          'Shining Star',
          'Ultra',
          'Pro',
          'Club Elite',
          'Trainer',
          'Street',
          'Match',
          'Competition',
        ]);
        const mrp =
          byTier(brand.tier, 599, 1199, 2999) *
          (build === 'Thermo-Bonded' ? 1.6 : 1) *
          rng.float(0.9, 1.15);
        return {
          name: `${brand.name} ${series} ${build} ${sport}, Size ${size}`,
          mrp,
          shortDescription: `Size ${size} ${build.toLowerCase()} ${sport.toLowerCase()} for ${sport === 'Football' ? 'turf and grass' : 'indoor and outdoor courts'}.`,
          description: paragraph(
            rng,
            [
              `The ${brand.name} ${series} is a size ${size} ${build.toLowerCase()} ${sport.toLowerCase()}.`,
            ],
            [
              'A butyl bladder holds air for longer between top-ups.',
              'A textured surface gives a reliable grip and touch.',
              sport === 'Football'
                ? 'Suits training on grass, turf and hard ground.'
                : 'A deep-channel design makes dribbling and shooting easier.',
              'Supplied deflated; inflate to the pressure printed on the ball.',
            ],
            2,
          ),
          highlights: [
            `Size ${size}`,
            build,
            sport === 'Football' ? 'For grass & turf' : 'Indoor & outdoor',
          ],
          specifications: [
            spec('Sport', sport),
            spec('Size', String(size)),
            spec('Construction', build),
            spec('Bladder', 'Butyl'),
            spec('Ideal For', size <= 4 && sport === 'Football' ? 'Kids' : 'Adults'),
          ],
          tags: [sport.toLowerCase(), 'ball', 'sports', `size ${size}`],
        };
      },
    },
    {
      key: 'racket sports',
      name: 'Badminton & Tennis',
      code: 'RKT',
      weight: 4,
      images: 'racketSports',
      brands: brands(
        ['Yonex', 'mid', 4],
        ['Li-Ning', 'mid', 3],
        ['Victor', 'mid', 1],
        ['Head', 'mid', 1],
        ['Babolat', 'premium', 1],
        ['Wilson', 'premium', 1],
        ['Cosco', 'budget', 2],
      ),
      discount: [0.1, 0.5],
      stockScale: 70,
      build({ rng, brand }) {
        const kind = rng.weighted([
          ['Badminton Racquet', 5],
          ['Shuttlecocks (Pack of 6)', 2],
          ['Tennis Racquet', 2],
          ['Tennis Balls (Can of 3)', 1],
        ] as const);
        const series = kind.startsWith('Badminton')
          ? rng.pick([
              'Astrox',
              'Nanoflare',
              'Arcsaber',
              'Muscle Power',
              'Windstorm',
              'Turbo Charging',
              'Thruster',
            ])
          : kind.startsWith('Tennis R')
            ? rng.pick(['Pure Drive', 'Speed', 'Ultra', 'Blade', 'Radical'])
            : rng.pick(['Mavis 350', 'AS-2', 'Championship', 'Tour', 'Training']);
        const model = kind.includes('Racquet')
          ? ` ${rng.int(1, 99)}${rng.pick(['', ' Play', ' Tour', ' Pro', ' Lite'])}`
          : '';
        const weight = kind.startsWith('Badminton')
          ? rng.pick(['3U (85–89 g)', '4U (80–84 g)', '5U (75–79 g)'])
          : kind.startsWith('Tennis R')
            ? rng.pick(['270 g', '285 g', '300 g'])
            : '';
        const base = {
          'Badminton Racquet': 2499,
          'Shuttlecocks (Pack of 6)': 899,
          'Tennis Racquet': 6999,
          'Tennis Balls (Can of 3)': 599,
        }[kind];
        const mrp = base * byTier(brand.tier, 0.6, 1.2, 2) * rng.float(0.85, 1.3);
        return {
          name: `${brand.name} ${series}${model} ${kind}${weight ? ` - ${weight}` : ''}`,
          mrp,
          shortDescription: kind.includes('Racquet')
            ? `${weight} ${kind.toLowerCase()}, strung, with a full cover.`
            : `${kind.toLowerCase()} for practice and match play.`,
          description: paragraph(
            rng,
            [
              `The ${brand.name} ${series}${model} ${kind.toLowerCase()} suits club players looking to step up their game.`,
            ],
            kind.includes('Racquet')
              ? [
                  'A graphite frame keeps it light and stiff for fast swings.',
                  'Comes factory-strung at a mid tension, ready to play.',
                  'An isometric head shape enlarges the sweet spot.',
                  'Includes a full-length racquet cover.',
                ]
              : [
                  'Consistent flight and durability through long rallies.',
                  'Suitable for indoor and outdoor play.',
                  'Tested for speed and bounce consistency.',
                ],
            2,
          ),
          highlights: [kind, ...(weight ? [weight] : []), `${series} series`],
          specifications: [
            spec('Type', kind),
            ...(weight ? [spec('Weight', weight)] : []),
            spec('Series', series),
            spec(
              'Material',
              kind.includes('Racquet')
                ? 'Graphite'
                : kind.includes('Shuttle')
                  ? 'Nylon / feather'
                  : 'Pressurised rubber, felt',
            ),
          ],
          tags: [
            kind.toLowerCase(),
            kind.startsWith('Badminton') || kind.startsWith('Shuttle') ? 'badminton' : 'tennis',
            'racket sports',
          ],
        };
      },
    },
    {
      key: 'cycles',
      name: 'Cycles',
      code: 'CYC',
      weight: 4,
      images: 'cycles',
      brands: brands(
        ['Hero', 'budget', 3],
        ['Btwin', 'mid', 2],
        ['Firefox', 'mid', 2],
        ['Hercules', 'budget', 2],
        ['Montra', 'mid', 1],
        ['Leader', 'budget', 2],
        ['EMotorad', 'mid', 1],
        ['Trek', 'premium', 1],
      ),
      discount: [0.08, 0.35],
      stockScale: 15,
      lowStockThreshold: 3,
      build({ rng, brand }) {
        const kind =
          brand.name === 'EMotorad'
            ? ('Electric Cycle' as const)
            : rng.pick([
                'Mountain Bike (MTB)',
                'Hybrid Cycle',
                'City Cycle',
                'Road Bike',
                'Kids Cycle',
              ] as const);
        const wheel =
          kind === 'Kids Cycle'
            ? rng.pick(['16T', '20T'])
            : kind === 'Road Bike'
              ? '700C'
              : rng.pick(['26T', '27.5T', '29T', '700C']);
        const gears =
          kind === 'Kids Cycle' || kind === 'City Cycle'
            ? 'Single Speed'
            : rng.pick(['7 Speed', '21 Speed', '24 Speed']);
        const frame = rng.pick(['Steel', 'Alloy', 'Alloy']);
        const brakes = rng.pick(['Dual Disc Brakes', 'V-Brakes', 'Mechanical Disc Brakes']);
        const series = rng.pick([
          'Sprint',
          'Rockrider',
          'Riddler',
          'Roadeo',
          'Blast',
          'Thunder',
          'Glide',
          'Marlin',
          'Nexus',
          'Viper',
        ]);
        const base = {
          'Mountain Bike (MTB)': 13000,
          'Hybrid Cycle': 15000,
          'City Cycle': 7000,
          'Road Bike': 28000,
          'Kids Cycle': 6000,
          'Electric Cycle': 32000,
        }[kind];
        const mrp =
          base *
          byTier(brand.tier, 0.8, 1.1, 2.8) *
          (frame === 'Alloy' ? 1.2 : 1) *
          (gears === 'Single Speed' ? 1 : 1.15) *
          rng.float(0.9, 1.15);
        return {
          name: `${brand.name} ${series} ${wheel} ${gears} ${kind} with ${brakes} (${frame} Frame)`,
          mrp,
          shortDescription: `${wheel} ${kind.toLowerCase()}, ${gears.toLowerCase()}, ${frame.toLowerCase()} frame and ${brakes.toLowerCase()}.`,
          description: paragraph(
            rng,
            [
              `The ${brand.name} ${series} is a ${wheel} ${kind.toLowerCase()} with a ${frame.toLowerCase()} frame and ${brakes.toLowerCase()}.`,
            ],
            [
              gears === 'Single Speed'
                ? 'Single-speed simplicity means almost no maintenance.'
                : `${gears} Shimano-compatible drivetrain handles hills and flats.`,
              'Front suspension soaks up potholes and broken roads.',
              'Delivered 85% assembled; final fitting takes about 30 minutes.',
              kind === 'Electric Cycle'
                ? 'A 36V removable battery gives up to 40 km of pedal-assisted range.'
                : 'Comes with a stand, reflectors and a bell.',
              'Lifetime frame warranty against manufacturing defects.',
            ],
            3,
          ),
          highlights: [wheel, gears, `${frame} frame`, brakes],
          specifications: [
            spec('Type', kind),
            spec('Wheel Size', wheel),
            spec('Gears', gears),
            spec('Frame Material', frame),
            spec('Brakes', brakes),
            spec('Assembly', '85% pre-assembled'),
            spec('Warranty', 'Lifetime on frame, 1 year on parts'),
          ],
          tags: [
            'cycle',
            'bicycle',
            kind.toLowerCase(),
            ...(kind.includes('Electric') ? ['e-bike', 'electric cycle'] : []),
            wheel.toLowerCase(),
          ],
        };
      },
    },
  ],
};
