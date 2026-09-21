/**
 * Development seed catalogue.
 *
 * `category` and `brand` are written as slugs and names; `seedDatabase()`
 * resolves them to ObjectIds once the reference collections exist. Images are
 * plain URLs, so pointing the catalogue at Cloudinary later is a data change
 * rather than a schema change.
 */

export interface SeedCategory {
  name: string;
  slug: string;
  description: string;
  image: string;
}

export interface SeedBrand {
  name: string;
  slug: string;
}

export interface SeedProduct {
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  images: string[];
  price: number;
  compareAtPrice?: number;
  /** Category slug, resolved at seed time. */
  category: string;
  /** Brand name, resolved at seed time. */
  brand: string;
  sku: string;
  stock: number;
  colors?: { name: string; hex: string }[];
  sizes?: { label: string; inStock: boolean }[];
  tags: string[];
  highlights: string[];
  specifications: { label: string; value: string }[];
  isFeatured: boolean;
  isBestSeller: boolean;
  isNewArrival: boolean;
  /** Preserved so "newest" and "oldest" sorting have something real to order by. */
  createdAt: string;
}

export const seedCategories: SeedCategory[] = [
  {
    name: 'Electronics',
    slug: 'electronics',
    description: 'Audio, wearables and machines',
    image:
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=700&q=80',
  },
  {
    name: 'Fashion',
    slug: 'fashion',
    description: 'Everyday layers worth keeping',
    image:
      'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=700&q=80',
  },
  {
    name: 'Footwear',
    slug: 'footwear',
    description: 'Court, road and everything after',
    image:
      'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=700&q=80',
  },
  {
    name: 'Accessories',
    slug: 'accessories',
    description: 'The pieces that finish the outfit',
    image:
      'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=700&q=80',
  },
  {
    name: 'Home',
    slug: 'home',
    description: 'Objects for the everyday',
    image:
      'https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=700&q=80',
  },
  {
    name: 'Beauty',
    slug: 'beauty',
    description: 'Short ingredient lists, honest claims',
    image:
      'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=700&q=80',
  },
];

export const seedBrands: SeedBrand[] = [
  {
    name: 'Aeva',
    slug: 'aeva',
  },
  {
    name: 'Apple',
    slug: 'apple',
  },
  {
    name: 'Atelier Nord',
    slug: 'atelier-nord',
  },
  {
    name: 'Aurélie',
    slug: 'aurelie',
  },
  {
    name: 'Curo',
    slug: 'curo',
  },
  {
    name: 'Kairos',
    slug: 'kairos',
  },
  {
    name: 'Lumen',
    slug: 'lumen',
  },
  {
    name: 'Lumière',
    slug: 'lumiere',
  },
  {
    name: 'Maison Lys',
    slug: 'maison-lys',
  },
  {
    name: 'Marlowe',
    slug: 'marlowe',
  },
  {
    name: 'Meridian',
    slug: 'meridian',
  },
  {
    name: 'Nike',
    slug: 'nike',
  },
  {
    name: 'Oliver Hart',
    slug: 'oliver-hart',
  },
  {
    name: 'Oskia',
    slug: 'oskia',
  },
  {
    name: 'Polaroid',
    slug: 'polaroid',
  },
  {
    name: 'Puma',
    slug: 'puma',
  },
  {
    name: 'Ray-Ban',
    slug: 'ray-ban',
  },
  {
    name: 'Saucola',
    slug: 'saucola',
  },
  {
    name: 'Sonarq',
    slug: 'sonarq',
  },
  {
    name: 'Terra',
    slug: 'terra',
  },
  {
    name: 'ZyCart Essentials',
    slug: 'zycart-essentials',
  },
];

export const seedProducts: SeedProduct[] = [
  {
    name: 'Air Max Heritage Runner',
    slug: 'nike-air-max-heritage-runner',
    description:
      'The Heritage Runner keeps the profile that made the line famous and rebuilds it around a lighter foam carrier. Breathable engineered mesh across the forefoot, suede overlays at the heel, and a full-length Air unit that keeps long days comfortable.',
    shortDescription: 'Visible Air cushioning with a heritage silhouette',
    images: [
      'https://images.unsplash.com/photo-1600185365926-3a2ce3cdb9eb?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80',
    ],
    price: 8495,
    category: 'footwear',
    brand: 'Nike',
    sku: 'ZY-FTW-001',
    stock: 18,
    tags: ['shoes', 'sneakers', 'running', 'trainers', 'air max', 'runner'],
    highlights: [
      'Full-length visible Air cushioning',
      'Engineered mesh upper with suede overlays',
      'Rubber waffle outsole for durable grip',
      'Padded collar and reinforced heel counter',
    ],
    specifications: [
      {
        label: 'Upper',
        value: 'Engineered mesh, suede',
      },
      {
        label: 'Midsole',
        value: 'Air cushioning unit',
      },
      {
        label: 'Outsole',
        value: 'Waffle rubber',
      },
      {
        label: 'Closure',
        value: 'Lace-up',
      },
      {
        label: 'Weight',
        value: '298 g (UK 8)',
      },
    ],
    isFeatured: true,
    isBestSeller: true,
    isNewArrival: false,
    createdAt: '2026-06-14',
    compareAtPrice: 11995,
    colors: [
      {
        name: 'Sail / Orange',
        hex: '#e8e2d9',
      },
      {
        name: 'Crimson',
        hex: '#c2382f',
      },
      {
        name: 'Black',
        hex: '#181818',
      },
    ],
    sizes: [
      {
        label: 'UK 6',
        inStock: true,
      },
      {
        label: 'UK 7',
        inStock: true,
      },
      {
        label: 'UK 8',
        inStock: true,
      },
      {
        label: 'UK 9',
        inStock: true,
      },
      {
        label: 'UK 10',
        inStock: true,
      },
      {
        label: 'UK 11',
        inStock: false,
      },
    ],
  },
  {
    name: 'Air Force 1 Pastel Edit',
    slug: 'nike-air-force-1-pastel-edit',
    description:
      'A low-top court shoe finished in a muted pastel palette. Full-grain leather panels, perforated toe box and the original cupsole construction, kept clean and unbranded across the quarter panel.',
    shortDescription: 'A court classic redrawn in soft seasonal colour',
    images: [
      'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1600269452121-4f2416e55c28?auto=format&fit=crop&w=900&q=80',
    ],
    price: 9295,
    category: 'footwear',
    brand: 'Nike',
    sku: 'ZY-FTW-002',
    stock: 31,
    tags: ['shoes', 'sneakers', 'air force', 'court', 'leather', 'white'],
    highlights: [
      'Full-grain leather upper',
      'Perforated toe box for airflow',
      'Encapsulated Air cushioning',
      'Pivot-point rubber outsole',
    ],
    specifications: [
      {
        label: 'Upper',
        value: 'Full-grain leather',
      },
      {
        label: 'Midsole',
        value: 'Encapsulated Air',
      },
      {
        label: 'Outsole',
        value: 'Rubber cupsole',
      },
      {
        label: 'Style',
        value: 'Low top',
      },
      {
        label: 'Weight',
        value: '412 g (UK 8)',
      },
    ],
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: true,
    createdAt: '2026-08-29',
    colors: [
      {
        name: 'Pastel Mix',
        hex: '#e7d9f0',
      },
      {
        name: 'Triple White',
        hex: '#f5f5f3',
      },
    ],
    sizes: [
      {
        label: 'UK 6',
        inStock: true,
      },
      {
        label: 'UK 7',
        inStock: true,
      },
      {
        label: 'UK 8',
        inStock: true,
      },
      {
        label: 'UK 9',
        inStock: true,
      },
      {
        label: 'UK 10',
        inStock: true,
      },
      {
        label: 'UK 11',
        inStock: false,
      },
    ],
  },
  {
    name: 'SuperRep Training Shoe',
    slug: 'nike-superrep-training-shoe',
    description:
      'A studio trainer with a wide, stable base and a forefoot designed to flex through fast transitions. The high-contrast volt upper is a deliberate signal on a gym floor.',
    shortDescription: 'Built for burpees, lifts and everything between',
    images: [
      'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1595341888016-a392ef81b7de?auto=format&fit=crop&w=900&q=80',
    ],
    price: 6995,
    category: 'footwear',
    brand: 'Nike',
    sku: 'ZY-FTW-003',
    stock: 44,
    tags: ['shoes', 'trainers', 'gym', 'training', 'workout'],
    highlights: [
      'Wide heel clip for lateral stability',
      'Flexible forefoot grooves',
      'Breathable mesh tongue',
      'Burpee-break outsole channel',
    ],
    specifications: [
      {
        label: 'Upper',
        value: 'Engineered mesh',
      },
      {
        label: 'Drop',
        value: '8 mm',
      },
      {
        label: 'Use',
        value: 'HIIT, circuit training',
      },
      {
        label: 'Closure',
        value: 'Lace-up',
      },
      {
        label: 'Weight',
        value: '265 g (UK 8)',
      },
    ],
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: false,
    createdAt: '2026-05-02',
    compareAtPrice: 8995,
    colors: [
      {
        name: 'Volt',
        hex: '#c8f13c',
      },
      {
        name: 'Graphite',
        hex: '#3c3f44',
      },
    ],
    sizes: [
      {
        label: 'UK 6',
        inStock: true,
      },
      {
        label: 'UK 7',
        inStock: true,
      },
      {
        label: 'UK 8',
        inStock: true,
      },
      {
        label: 'UK 9',
        inStock: true,
      },
      {
        label: 'UK 10',
        inStock: true,
      },
      {
        label: 'UK 11',
        inStock: false,
      },
    ],
  },
  {
    name: 'Court Leather Low',
    slug: 'puma-court-leather-low',
    description:
      'A minimal court profile in soft tumbled leather with a tonal sidewall. Designed to be worn daily and to age well rather than to shout.',
    shortDescription: 'The white leather sneaker, done properly',
    images: [
      'https://images.unsplash.com/photo-1608231387042-66d1773070a5?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1600269452121-4f2416e55c28?auto=format&fit=crop&w=900&q=80',
    ],
    price: 5499,
    category: 'footwear',
    brand: 'Puma',
    sku: 'ZY-FTW-004',
    stock: 5,
    tags: ['shoes', 'sneakers', 'white sneakers', 'leather', 'court'],
    highlights: [
      'Tumbled leather upper',
      'Tonal branding, no loud graphics',
      'Ortholite comfort sockliner',
      'Vulcanised rubber sole',
    ],
    specifications: [
      {
        label: 'Upper',
        value: 'Tumbled leather',
      },
      {
        label: 'Lining',
        value: 'Textile',
      },
      {
        label: 'Sockliner',
        value: 'Ortholite',
      },
      {
        label: 'Style',
        value: 'Low top',
      },
      {
        label: 'Weight',
        value: '380 g (UK 8)',
      },
    ],
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: false,
    createdAt: '2026-03-18',
    compareAtPrice: 6999,
    colors: [
      {
        name: 'Puma White',
        hex: '#f2f2ef',
      },
      {
        name: 'Vapour Grey',
        hex: '#c8c6c2',
      },
    ],
    sizes: [
      {
        label: 'UK 6',
        inStock: true,
      },
      {
        label: 'UK 7',
        inStock: true,
      },
      {
        label: 'UK 8',
        inStock: true,
      },
      {
        label: 'UK 9',
        inStock: true,
      },
      {
        label: 'UK 10',
        inStock: true,
      },
      {
        label: 'UK 11',
        inStock: false,
      },
    ],
  },
  {
    name: 'AF1 Desert Tan',
    slug: 'nike-af1-desert-tan',
    description:
      'A limited seasonal colourway built on the familiar cupsole. Soft nubuck takes the place of the usual leather, giving the silhouette a quieter, warmer finish.',
    shortDescription: 'Nubuck in a warm, seasonal tan',
    images: [
      'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1600269452121-4f2416e55c28?auto=format&fit=crop&w=900&q=80',
    ],
    price: 10495,
    category: 'footwear',
    brand: 'Nike',
    sku: 'ZY-FTW-005',
    stock: 70,
    tags: ['shoes', 'sneakers', 'air force', 'nubuck', 'tan'],
    highlights: [
      'Premium nubuck upper',
      'Tonal midsole and laces',
      'Encapsulated Air cushioning',
      'Limited seasonal release',
    ],
    specifications: [
      {
        label: 'Upper',
        value: 'Nubuck leather',
      },
      {
        label: 'Midsole',
        value: 'Encapsulated Air',
      },
      {
        label: 'Outsole',
        value: 'Rubber cupsole',
      },
      {
        label: 'Release',
        value: 'Seasonal, limited',
      },
      {
        label: 'Weight',
        value: '420 g (UK 8)',
      },
    ],
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: false,
    createdAt: '2026-09-01',
    colors: [
      {
        name: 'Desert Tan',
        hex: '#b2865c',
      },
    ],
    sizes: [
      {
        label: 'UK 6',
        inStock: true,
      },
      {
        label: 'UK 7',
        inStock: true,
      },
      {
        label: 'UK 8',
        inStock: true,
      },
      {
        label: 'UK 9',
        inStock: true,
      },
      {
        label: 'UK 10',
        inStock: true,
      },
      {
        label: 'UK 11',
        inStock: false,
      },
    ],
  },
  {
    name: 'Ashby Teal Derby',
    slug: 'oliver-hart-teal-derby',
    description:
      'A Goodyear-welted derby in hand-finished teal calf leather. Resoleable, which is the whole point of buying a shoe like this.',
    shortDescription: 'Goodyear-welted, in a colour worth noticing',
    images: [
      'https://images.unsplash.com/photo-1560343090-f0409e92791a?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=900&q=80',
    ],
    price: 12750,
    category: 'footwear',
    brand: 'Oliver Hart',
    sku: 'ZY-FTW-006',
    stock: 83,
    tags: ['shoes', 'formal shoes', 'dress shoes', 'derby', 'leather'],
    highlights: [
      'Goodyear-welted construction',
      'Hand-finished calf leather',
      'Leather sole with rubber heel insert',
      'Fully resoleable',
    ],
    specifications: [
      {
        label: 'Upper',
        value: 'Calf leather',
      },
      {
        label: 'Construction',
        value: 'Goodyear welt',
      },
      {
        label: 'Sole',
        value: 'Leather with rubber heel',
      },
      {
        label: 'Last',
        value: 'Round toe',
      },
      {
        label: 'Made in',
        value: 'Agra, India',
      },
    ],
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: false,
    createdAt: '2026-04-22',
    compareAtPrice: 15500,
    colors: [
      {
        name: 'Teal',
        hex: '#2d6a68',
      },
      {
        name: 'Oxblood',
        hex: '#5b2028',
      },
    ],
    sizes: [
      {
        label: 'UK 6',
        inStock: true,
      },
      {
        label: 'UK 7',
        inStock: true,
      },
      {
        label: 'UK 8',
        inStock: true,
      },
      {
        label: 'UK 9',
        inStock: true,
      },
      {
        label: 'UK 10',
        inStock: true,
      },
      {
        label: 'UK 11',
        inStock: false,
      },
    ],
  },
  {
    name: 'Shadow Runner',
    slug: 'nike-shadow-runner-black',
    description:
      'A stealth daily trainer with reflective piping that only shows under direct light. Responsive foam underfoot, tuned for road kilometres rather than the gym floor.',
    shortDescription: 'Blacked-out daily trainer with reflective detailing',
    images: [
      'https://images.unsplash.com/photo-1491553895911-0055eca6402d?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?auto=format&fit=crop&w=900&q=80',
    ],
    price: 7995,
    category: 'footwear',
    brand: 'Nike',
    sku: 'ZY-FTW-007',
    stock: 96,
    tags: ['shoes', 'running shoes', 'trainers', 'black shoes', 'running'],
    highlights: [
      'Responsive foam midsole',
      'Reflective heel and lace piping',
      'Seamless engineered upper',
      'Road-specific rubber outsole',
    ],
    specifications: [
      {
        label: 'Upper',
        value: 'Seamless engineered knit',
      },
      {
        label: 'Drop',
        value: '10 mm',
      },
      {
        label: 'Use',
        value: 'Road running',
      },
      {
        label: 'Closure',
        value: 'Lace-up',
      },
      {
        label: 'Weight',
        value: '272 g (UK 8)',
      },
    ],
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: false,
    createdAt: '2026-02-10',
    colors: [
      {
        name: 'Triple Black',
        hex: '#141414',
      },
    ],
    sizes: [
      {
        label: 'UK 6',
        inStock: true,
      },
      {
        label: 'UK 7',
        inStock: true,
      },
      {
        label: 'UK 8',
        inStock: true,
      },
      {
        label: 'UK 9',
        inStock: true,
      },
      {
        label: 'UK 10',
        inStock: true,
      },
      {
        label: 'UK 11',
        inStock: false,
      },
    ],
  },
  {
    name: 'Street Runner 90',
    slug: 'saucola-street-runner-teal',
    description:
      'A retro runner rebuilt on a modern foam platform. Layered suede and mesh panelling in a colour split borrowed from the original 1990s release.',
    shortDescription: 'Nineties running lines, modern cushioning',
    images: [
      'https://images.unsplash.com/photo-1595341888016-a392ef81b7de?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1600185365926-3a2ce3cdb9eb?auto=format&fit=crop&w=900&q=80',
    ],
    price: 4999,
    category: 'footwear',
    brand: 'Saucola',
    sku: 'ZY-FTW-008',
    stock: 0,
    tags: ['shoes', 'sneakers', 'running shoes', 'retro', 'runner'],
    highlights: [
      'Suede and mesh panelled upper',
      'EVA foam midsole',
      'Retro colour-blocking',
      'Padded ankle collar',
    ],
    specifications: [
      {
        label: 'Upper',
        value: 'Suede, mesh',
      },
      {
        label: 'Midsole',
        value: 'EVA foam',
      },
      {
        label: 'Outsole',
        value: 'Rubber',
      },
      {
        label: 'Style',
        value: 'Retro runner',
      },
      {
        label: 'Weight',
        value: '310 g (UK 8)',
      },
    ],
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: false,
    createdAt: '2026-01-25',
    compareAtPrice: 7499,
    colors: [
      {
        name: 'White / Teal',
        hex: '#1e7f8c',
      },
    ],
    sizes: [
      {
        label: 'UK 6',
        inStock: true,
      },
      {
        label: 'UK 7',
        inStock: true,
      },
      {
        label: 'UK 8',
        inStock: true,
      },
      {
        label: 'UK 9',
        inStock: true,
      },
      {
        label: 'UK 10',
        inStock: true,
      },
      {
        label: 'UK 11',
        inStock: false,
      },
    ],
  },
  {
    name: 'Studio One Over-Ear Headphones',
    slug: 'sonarq-studio-over-ear-headphones',
    description:
      'Closed-back over-ears tuned for long listening rather than a shop-floor demo. Adaptive cancellation samples the room 200 times a second, and the memory-foam cups stay comfortable past the three-hour mark.',
    shortDescription: 'Adaptive noise cancelling with 40-hour battery',
    images: [
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=900&q=80',
    ],
    price: 18990,
    category: 'electronics',
    brand: 'Sonarq',
    sku: 'ZY-ELC-001',
    stock: 26,
    tags: ['headphones', 'wireless', 'noise cancelling', 'over-ear', 'audio', 'anc'],
    highlights: [
      'Adaptive active noise cancellation',
      '40-hour battery, 5-minute fast charge',
      'Multipoint Bluetooth 5.3',
      'Memory-foam cushions with replaceable pads',
    ],
    specifications: [
      {
        label: 'Driver',
        value: '40 mm dynamic',
      },
      {
        label: 'Battery',
        value: '40 h (ANC on)',
      },
      {
        label: 'Connectivity',
        value: 'Bluetooth 5.3, USB-C, 3.5 mm',
      },
      {
        label: 'Weight',
        value: '254 g',
      },
      {
        label: 'Warranty',
        value: '2 years',
      },
    ],
    isFeatured: true,
    isBestSeller: true,
    isNewArrival: false,
    createdAt: '2026-07-08',
    compareAtPrice: 24990,
    colors: [
      {
        name: 'Midnight',
        hex: '#1b1d22',
      },
      {
        name: 'Fog Grey',
        hex: '#9b9ea3',
      },
    ],
  },
  {
    name: 'Watch Series 9 · 45 mm',
    slug: 'apple-watch-series-black-loop',
    description:
      'The 45 mm case with an always-on display bright enough to read in direct sun. Blood-oxygen and ECG sensors, crash detection, and an 18-hour battery that comfortably covers a day plus a night of sleep tracking.',
    shortDescription: 'Always-on Retina display and full-day health tracking',
    images: [
      'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80',
    ],
    price: 41900,
    category: 'electronics',
    brand: 'Apple',
    sku: 'ZY-ELC-002',
    stock: 39,
    tags: ['smartwatch', 'watch', 'wearable', 'fitness tracker'],
    highlights: [
      'Always-on Retina display, 2000 nits',
      'ECG and blood-oxygen sensors',
      'Crash and fall detection',
      'Water resistant to 50 m',
    ],
    specifications: [
      {
        label: 'Case size',
        value: '45 mm aluminium',
      },
      {
        label: 'Display',
        value: 'LTPO OLED, always-on',
      },
      {
        label: 'Battery',
        value: 'Up to 18 h',
      },
      {
        label: 'Water resistance',
        value: '50 m',
      },
      {
        label: 'Connectivity',
        value: 'GPS + Cellular',
      },
    ],
    isFeatured: true,
    isBestSeller: true,
    isNewArrival: false,
    createdAt: '2026-08-12',
    colors: [
      {
        name: 'Midnight',
        hex: '#1d1d1f',
      },
      {
        name: 'Starlight',
        hex: '#efe6d9',
      },
    ],
  },
  {
    name: 'MacBook Air 13" M3',
    slug: 'apple-macbook-air-13-m3',
    description:
      'The M3 Air stays silent because there is no fan to spin up. A 13.6-inch Liquid Retina panel, two Thunderbolt ports, MagSafe charging, and a battery that genuinely lasts a working day away from the desk.',
    shortDescription: 'Fanless, silent, and good for eighteen hours',
    images: [
      'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?auto=format&fit=crop&w=900&q=80',
    ],
    price: 114900,
    category: 'electronics',
    brand: 'Apple',
    sku: 'ZY-ELC-003',
    stock: 9,
    tags: ['laptop', 'macbook', 'notebook', 'computer'],
    highlights: [
      'Apple M3, 8-core CPU / 10-core GPU',
      '13.6" Liquid Retina, 500 nits',
      'Up to 18 hours battery',
      'Fanless — silent under load',
    ],
    specifications: [
      {
        label: 'Chip',
        value: 'Apple M3',
      },
      {
        label: 'Memory',
        value: '8 GB unified',
      },
      {
        label: 'Storage',
        value: '256 GB SSD',
      },
      {
        label: 'Display',
        value: '13.6" Liquid Retina',
      },
      {
        label: 'Weight',
        value: '1.24 kg',
      },
    ],
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: false,
    createdAt: '2026-06-30',
    compareAtPrice: 124900,
    colors: [
      {
        name: 'Midnight',
        hex: '#2e3641',
      },
      {
        name: 'Silver',
        hex: '#e3e4e6',
      },
    ],
  },
  {
    name: 'iPhone 15 · 128 GB',
    slug: 'apple-iphone-15-128gb',
    description:
      'The Dynamic Island, a 48-megapixel main sensor with a 2x telephoto crop, and USB-C charging. Ceramic Shield front, aluminium frame, and all-day battery on a 6.1-inch Super Retina XDR panel.',
    shortDescription: '48MP main camera and USB-C, finally',
    images: [
      'https://images.unsplash.com/photo-1580910051074-3eb694886505?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80',
    ],
    price: 69900,
    category: 'electronics',
    brand: 'Apple',
    sku: 'ZY-ELC-004',
    stock: 65,
    tags: ['phone', 'smartphone', 'mobile', 'iphone'],
    highlights: [
      '48MP main camera with 2x telephoto crop',
      'Dynamic Island',
      'USB-C charging and data',
      'Ceramic Shield front cover',
    ],
    specifications: [
      {
        label: 'Display',
        value: '6.1" Super Retina XDR',
      },
      {
        label: 'Chip',
        value: 'A16 Bionic',
      },
      {
        label: 'Storage',
        value: '128 GB',
      },
      {
        label: 'Camera',
        value: '48MP + 12MP ultra-wide',
      },
      {
        label: 'Port',
        value: 'USB-C',
      },
    ],
    isFeatured: true,
    isBestSeller: true,
    isNewArrival: false,
    createdAt: '2026-07-21',
    compareAtPrice: 79900,
    colors: [
      {
        name: 'Black',
        hex: '#2c2c2e',
      },
      {
        name: 'Blue',
        hex: '#b4c5d6',
      },
      {
        name: 'Pink',
        hex: '#e6c9c9',
      },
    ],
  },
  {
    name: 'Now Instant Camera',
    slug: 'polaroid-now-instant-camera',
    description:
      'A two-lens autofocus system picks the right focal length so the shot lands sharp. Prints develop in about fifteen minutes, and the internal battery is good for roughly fifteen packs per charge.',
    shortDescription: 'Autofocus instant film, no app required',
    images: [
      'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=900&q=80',
    ],
    price: 12499,
    category: 'electronics',
    brand: 'Polaroid',
    sku: 'ZY-ELC-005',
    stock: 78,
    tags: ['camera', 'instant camera', 'film', 'photography'],
    highlights: [
      'Two-lens autofocus system',
      'Double exposure and self-timer',
      'USB-C rechargeable battery',
      'Works with i-Type and 600 film',
    ],
    specifications: [
      {
        label: 'Film',
        value: 'i-Type, 600',
      },
      {
        label: 'Focus',
        value: 'Autofocus, two lenses',
      },
      {
        label: 'Battery',
        value: 'Li-ion, USB-C',
      },
      {
        label: 'Flash',
        value: 'Built-in',
      },
      {
        label: 'Weight',
        value: '434 g',
      },
    ],
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: true,
    createdAt: '2026-09-05',
    colors: [
      {
        name: 'White',
        hex: '#f4f4f2',
      },
      {
        name: 'Black',
        hex: '#1c1c1c',
      },
    ],
  },
  {
    name: 'Monitor 60 Reference Headphones',
    slug: 'sonarq-monitor-headphones-grey',
    description:
      'A wired reference pair with a deliberately flat response curve. Every part — pads, cable, headband — is sold separately, so a worn component does not mean a new pair of headphones.',
    shortDescription: 'Flat response, wired, built to be repaired',
    images: [
      'https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80',
    ],
    price: 9490,
    category: 'electronics',
    brand: 'Sonarq',
    sku: 'ZY-ELC-006',
    stock: 91,
    tags: ['headphones', 'wired', 'studio', 'over-ear', 'audio'],
    highlights: [
      'Flat reference tuning',
      'Detachable 3 m coiled cable',
      'Every part user-replaceable',
      'Velour and pleather pads included',
    ],
    specifications: [
      {
        label: 'Driver',
        value: '45 mm dynamic',
      },
      {
        label: 'Impedance',
        value: '38 ohm',
      },
      {
        label: 'Frequency',
        value: '10 Hz – 30 kHz',
      },
      {
        label: 'Cable',
        value: 'Detachable, 3 m coiled',
      },
      {
        label: 'Weight',
        value: '285 g',
      },
    ],
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: false,
    createdAt: '2026-03-30',
    compareAtPrice: 12990,
    colors: [
      {
        name: 'Slate Grey',
        hex: '#7c7f84',
      },
    ],
  },
  {
    name: 'Lumen Creator 14 Ultrabook',
    slug: 'lumen-ultrabook-14-creator',
    description:
      'A 14-inch OLED panel factory-calibrated to 100% DCI-P3, paired with a discrete GPU and a chassis that stays under 1.4 kg. Built for colour work on the move rather than for benchmark charts.',
    shortDescription: 'Colour-accurate 14" OLED for design work',
    images: [
      'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=900&q=80',
    ],
    price: 89990,
    category: 'electronics',
    brand: 'Lumen',
    sku: 'ZY-ELC-007',
    stock: 104,
    tags: ['laptop', 'ultrabook', 'notebook', 'oled', 'computer'],
    highlights: [
      '14" 2.8K OLED, 100% DCI-P3',
      'Factory colour calibration report included',
      'Per-key RGB backlit keyboard',
      '1.38 kg magnesium chassis',
    ],
    specifications: [
      {
        label: 'Display',
        value: '14" 2.8K OLED, 120 Hz',
      },
      {
        label: 'Processor',
        value: 'Core Ultra 7',
      },
      {
        label: 'Memory',
        value: '16 GB LPDDR5',
      },
      {
        label: 'Storage',
        value: '1 TB NVMe SSD',
      },
      {
        label: 'Weight',
        value: '1.38 kg',
      },
    ],
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: false,
    createdAt: '2026-05-19',
    compareAtPrice: 104990,
    colors: [
      {
        name: 'Graphite',
        hex: '#33363b',
      },
    ],
  },
  {
    name: 'Kairos Active Smartwatch',
    slug: 'kairos-active-smartwatch-white',
    description:
      'A fitness-first watch that trades a glossy app store for two weeks of battery. Continuous heart-rate and SpO2 monitoring, sleep staging, and a 1.43-inch AMOLED that stays legible outdoors.',
    shortDescription: '14-day battery and 120 workout modes',
    images: [
      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=900&q=80',
    ],
    price: 7999,
    category: 'electronics',
    brand: 'Kairos',
    sku: 'ZY-ELC-008',
    stock: 21,
    tags: ['smartwatch', 'watch', 'fitness tracker', 'wearable'],
    highlights: [
      '14-day typical battery life',
      '120 tracked workout modes',
      'Continuous SpO2 and heart rate',
      '5 ATM water resistance',
    ],
    specifications: [
      {
        label: 'Display',
        value: '1.43" AMOLED',
      },
      {
        label: 'Battery',
        value: 'Up to 14 days',
      },
      {
        label: 'Sensors',
        value: 'HR, SpO2, accelerometer',
      },
      {
        label: 'Water resistance',
        value: '5 ATM',
      },
      {
        label: 'Compatibility',
        value: 'Android, iOS',
      },
    ],
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: false,
    createdAt: '2026-04-06',
    compareAtPrice: 11999,
    colors: [
      {
        name: 'Cloud White',
        hex: '#f0f0ee',
      },
      {
        name: 'Obsidian',
        hex: '#222429',
      },
    ],
  },
  {
    name: 'Heavyweight Essential Tee',
    slug: 'zycart-essentials-heavyweight-tee',
    description:
      'A heavyweight tee at 240 GSM, cut boxy through the body with a ribbed collar that will not stretch out after a month. Pre-shrunk, so the size you buy is the size it stays.',
    shortDescription: '240 GSM combed cotton that holds its shape',
    images: [
      'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&w=900&q=80',
    ],
    price: 1299,
    category: 'fashion',
    brand: 'ZyCart Essentials',
    sku: 'ZY-FSH-001',
    stock: 34,
    tags: ['t-shirt', 'tee', 'shirt', 'top', 'cotton'],
    highlights: [
      '240 GSM combed ring-spun cotton',
      'Pre-shrunk and bio-washed',
      'Ribbed collar with taped shoulders',
      'Boxy, non-clinging fit',
    ],
    specifications: [
      {
        label: 'Fabric',
        value: '100% combed cotton, 240 GSM',
      },
      {
        label: 'Fit',
        value: 'Boxy regular',
      },
      {
        label: 'Neck',
        value: 'Ribbed crew',
      },
      {
        label: 'Care',
        value: 'Machine wash cold',
      },
      {
        label: 'Origin',
        value: 'Tiruppur, India',
      },
    ],
    isFeatured: true,
    isBestSeller: true,
    isNewArrival: false,
    createdAt: '2026-02-28',
    compareAtPrice: 1899,
    colors: [
      {
        name: 'Black',
        hex: '#17181a',
      },
      {
        name: 'Bone',
        hex: '#e9e4da',
      },
      {
        name: 'Forest',
        hex: '#2f4436',
      },
    ],
    sizes: [
      {
        label: 'XS',
        inStock: false,
      },
      {
        label: 'S',
        inStock: true,
      },
      {
        label: 'M',
        inStock: true,
      },
      {
        label: 'L',
        inStock: true,
      },
      {
        label: 'XL',
        inStock: true,
      },
      {
        label: 'XXL',
        inStock: true,
      },
    ],
  },
  {
    name: 'Loopback Crew Sweatshirt',
    slug: 'zycart-essentials-loopback-sweatshirt',
    description:
      'Loopback cotton left unbrushed, so it breathes in October and still works in January. Raglan sleeves, a twin-needle hem, and no logo anywhere on it.',
    shortDescription: 'Unbrushed loopback cotton, all year round',
    images: [
      'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=900&q=80',
    ],
    price: 2799,
    category: 'fashion',
    brand: 'ZyCart Essentials',
    sku: 'ZY-FSH-002',
    stock: 4,
    tags: ['sweatshirt', 'jumper', 'crew neck', 'cotton'],
    highlights: [
      '380 GSM unbrushed loopback cotton',
      'Raglan sleeve for shoulder mobility',
      'Twin-needle hem and cuffs',
      'Completely unbranded',
    ],
    specifications: [
      {
        label: 'Fabric',
        value: '100% cotton loopback, 380 GSM',
      },
      {
        label: 'Fit',
        value: 'Relaxed',
      },
      {
        label: 'Sleeve',
        value: 'Raglan',
      },
      {
        label: 'Care',
        value: 'Machine wash cold, dry flat',
      },
      {
        label: 'Origin',
        value: 'Tiruppur, India',
      },
    ],
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: true,
    createdAt: '2026-08-20',
    colors: [
      {
        name: 'Optic White',
        hex: '#f6f5f2',
      },
      {
        name: 'Ash',
        hex: '#b8b6b1',
      },
    ],
    sizes: [
      {
        label: 'XS',
        inStock: false,
      },
      {
        label: 'S',
        inStock: true,
      },
      {
        label: 'M',
        inStock: true,
      },
      {
        label: 'L',
        inStock: true,
      },
      {
        label: 'XL',
        inStock: true,
      },
      {
        label: 'XXL',
        inStock: true,
      },
    ],
  },
  {
    name: 'Merino Knit Cardigan',
    slug: 'marlowe-merino-knit-cardigan',
    description:
      'A 19.5-micron merino cardigan with corozo buttons and a fully fashioned shoulder. Thin enough to wear under a coat, warm enough to wear instead of one.',
    shortDescription: 'Extra-fine merino that layers without bulk',
    images: [
      'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=900&q=80',
    ],
    price: 5499,
    category: 'fashion',
    brand: 'Marlowe',
    sku: 'ZY-FSH-003',
    stock: 60,
    tags: ['cardigan', 'knitwear', 'merino', 'wool', 'sweater'],
    highlights: [
      '19.5-micron extra-fine merino',
      'Corozo nut buttons',
      'Fully fashioned shoulders',
      'Naturally temperature regulating',
    ],
    specifications: [
      {
        label: 'Fabric',
        value: '100% extra-fine merino',
      },
      {
        label: 'Gauge',
        value: '12 gg',
      },
      {
        label: 'Buttons',
        value: 'Corozo',
      },
      {
        label: 'Care',
        value: 'Hand wash or wool cycle',
      },
      {
        label: 'Fit',
        value: 'Regular',
      },
    ],
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: false,
    createdAt: '2026-07-02',
    compareAtPrice: 7999,
    colors: [
      {
        name: 'Rust',
        hex: '#a9502f',
      },
      {
        name: 'Oatmeal',
        hex: '#d8cdba',
      },
    ],
    sizes: [
      {
        label: 'XS',
        inStock: false,
      },
      {
        label: 'S',
        inStock: true,
      },
      {
        label: 'M',
        inStock: true,
      },
      {
        label: 'L',
        inStock: true,
      },
      {
        label: 'XL',
        inStock: true,
      },
      {
        label: 'XXL',
        inStock: true,
      },
    ],
  },
  {
    name: 'Washed Linen Overshirt',
    slug: 'marlowe-linen-overshirt',
    description:
      'European linen, garment-washed so it arrives soft instead of stiff. Cut long enough to wear open as a light jacket, with a chest pocket that actually holds a phone.',
    shortDescription: 'Garment-washed linen, soft from the first wear',
    images: [
      'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=900&q=80',
    ],
    price: 3999,
    category: 'fashion',
    brand: 'Marlowe',
    sku: 'ZY-FSH-004',
    stock: 73,
    tags: ['shirt', 'linen shirt', 'overshirt', 'linen'],
    highlights: [
      'Garment-washed European linen',
      'Wears as a shirt or a light jacket',
      'Corozo buttons',
      'Chest pocket sized for a phone',
    ],
    specifications: [
      {
        label: 'Fabric',
        value: '100% European linen',
      },
      {
        label: 'Weight',
        value: '190 GSM',
      },
      {
        label: 'Fit',
        value: 'Relaxed, longline',
      },
      {
        label: 'Care',
        value: 'Machine wash cold',
      },
      {
        label: 'Origin',
        value: 'Portugal',
      },
    ],
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: false,
    createdAt: '2026-06-11',
    compareAtPrice: 5499,
    colors: [
      {
        name: 'Sand',
        hex: '#cbb79c',
      },
      {
        name: 'Clay',
        hex: '#a97e68',
      },
    ],
    sizes: [
      {
        label: 'XS',
        inStock: false,
      },
      {
        label: 'S',
        inStock: true,
      },
      {
        label: 'M',
        inStock: true,
      },
      {
        label: 'L',
        inStock: true,
      },
      {
        label: 'XL',
        inStock: true,
      },
      {
        label: 'XXL',
        inStock: true,
      },
    ],
  },
  {
    name: 'Tailored Wool Trouser',
    slug: 'marlowe-tailored-wool-trouser',
    description:
      'A single-pleat trouser in a mid-weight wool blend that holds a crease without pressing. Side adjusters instead of belt loops, and a hem left long for tailoring.',
    shortDescription: 'Single-pleat wool with a proper drape',
    images: [
      'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=900&q=80',
    ],
    price: 6499,
    category: 'fashion',
    brand: 'Marlowe',
    sku: 'ZY-FSH-005',
    stock: 86,
    tags: ['trousers', 'pants', 'wool', 'tailoring', 'formal'],
    highlights: [
      'Single forward pleat',
      'Side tab adjusters, no belt loops',
      'Unfinished hem for tailoring',
      'Mid-weight wool blend',
    ],
    specifications: [
      {
        label: 'Fabric',
        value: '70% wool, 30% polyester',
      },
      {
        label: 'Weight',
        value: '280 GSM',
      },
      {
        label: 'Fit',
        value: 'Straight, mid rise',
      },
      {
        label: 'Hem',
        value: 'Unfinished',
      },
      {
        label: 'Care',
        value: 'Dry clean',
      },
    ],
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: true,
    createdAt: '2026-09-09',
    colors: [
      {
        name: 'Charcoal',
        hex: '#3a3c40',
      },
      {
        name: 'Stone',
        hex: '#a39c90',
      },
    ],
    sizes: [
      {
        label: 'XS',
        inStock: false,
      },
      {
        label: 'S',
        inStock: true,
      },
      {
        label: 'M',
        inStock: true,
      },
      {
        label: 'L',
        inStock: true,
      },
      {
        label: 'XL',
        inStock: true,
      },
      {
        label: 'XXL',
        inStock: true,
      },
    ],
  },
  {
    name: 'Meridian Automatic Diver',
    slug: 'meridian-automatic-dive-watch',
    description:
      'A 41 mm steel diver on an automatic movement with a 42-hour reserve. Unidirectional bezel, sapphire crystal, and a sunburst blue dial that shifts with the light.',
    shortDescription: 'Automatic movement, 200 m, sapphire crystal',
    images: [
      'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?auto=format&fit=crop&w=900&q=80',
    ],
    price: 24999,
    category: 'accessories',
    brand: 'Meridian',
    sku: 'ZY-ACC-001',
    stock: 99,
    tags: ['watch', 'dive watch', 'automatic', 'diver', 'wristwatch'],
    highlights: [
      'Automatic movement, 42 h reserve',
      '200 m water resistance',
      'Sapphire crystal with AR coating',
      'Unidirectional 120-click bezel',
    ],
    specifications: [
      {
        label: 'Case',
        value: '41 mm stainless steel',
      },
      {
        label: 'Movement',
        value: 'Automatic, 42 h reserve',
      },
      {
        label: 'Crystal',
        value: 'Sapphire, anti-reflective',
      },
      {
        label: 'Water resistance',
        value: '200 m',
      },
      {
        label: 'Bracelet',
        value: 'Steel, screw-link',
      },
    ],
    isFeatured: true,
    isBestSeller: true,
    isNewArrival: false,
    createdAt: '2026-05-27',
    compareAtPrice: 32999,
    colors: [
      {
        name: 'Steel / Blue',
        hex: '#2c4a6b',
      },
      {
        name: 'Steel / Black',
        hex: '#23262a',
      },
    ],
  },
  {
    name: 'Classic Wayfarer Sunglasses',
    slug: 'rayband-classic-wayfarer',
    description:
      'Acetate frames with G-15 polarised lenses. The proportions have barely changed since the fifties, which is exactly why they still work.',
    shortDescription: 'The shape that has outlasted every trend',
    images: [
      'https://images.unsplash.com/photo-1572635196237-14b3f281503f?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=900&q=80',
    ],
    price: 8990,
    category: 'accessories',
    brand: 'Ray-Ban',
    sku: 'ZY-ACC-002',
    stock: 112,
    tags: ['sunglasses', 'eyewear', 'shades', 'wayfarer'],
    highlights: [
      'Polarised G-15 lenses',
      '100% UV400 protection',
      'Hand-polished acetate frame',
      'Includes hard case and cloth',
    ],
    specifications: [
      {
        label: 'Frame',
        value: 'Acetate',
      },
      {
        label: 'Lens',
        value: 'Polarised G-15',
      },
      {
        label: 'UV protection',
        value: 'UV400',
      },
      {
        label: 'Lens width',
        value: '52 mm',
      },
      {
        label: 'Included',
        value: 'Hard case, cloth',
      },
    ],
    isFeatured: false,
    isBestSeller: true,
    isNewArrival: false,
    createdAt: '2026-03-04',
    colors: [
      {
        name: 'Gloss Black',
        hex: '#18181a',
      },
      {
        name: 'Tortoise',
        hex: '#7a4a24',
      },
    ],
  },
  {
    name: 'Round Metal Sunglasses',
    slug: 'aurelie-round-metal-sunglasses',
    description:
      'A 44 mm round lens in a titanium frame that weighs almost nothing on the bridge. Gradient green lenses with adjustable acetate nose pads.',
    shortDescription: 'Featherweight titanium in a period-correct round',
    images: [
      'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1572635196237-14b3f281503f?auto=format&fit=crop&w=900&q=80',
    ],
    price: 4499,
    category: 'accessories',
    brand: 'Aurélie',
    sku: 'ZY-ACC-003',
    stock: 29,
    tags: ['sunglasses', 'eyewear', 'shades', 'titanium', 'round'],
    highlights: [
      'Titanium frame, 18 g total',
      'Gradient green lenses',
      'Adjustable acetate nose pads',
      'UV400 protection',
    ],
    specifications: [
      {
        label: 'Frame',
        value: 'Titanium',
      },
      {
        label: 'Lens',
        value: 'Gradient green',
      },
      {
        label: 'UV protection',
        value: 'UV400',
      },
      {
        label: 'Lens width',
        value: '44 mm',
      },
      {
        label: 'Weight',
        value: '18 g',
      },
    ],
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: false,
    createdAt: '2026-04-15',
    compareAtPrice: 6499,
    colors: [
      {
        name: 'Gold',
        hex: '#c9a24a',
      },
      {
        name: 'Gunmetal',
        hex: '#5c6066',
      },
    ],
  },
  {
    name: 'Structured Leather Satchel',
    slug: 'atelier-nord-structured-satchel',
    description:
      'Vegetable-tanned leather over a rigid frame, with a hand-woven base panel that takes a full working day to complete. It will darken with use, which is the point.',
    shortDescription: 'Vegetable-tanned leather with a woven base',
    images: [
      'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=900&q=80',
    ],
    price: 15999,
    category: 'accessories',
    brand: 'Atelier Nord',
    sku: 'ZY-ACC-004',
    stock: 8,
    tags: ['bag', 'handbag', 'satchel', 'leather bag', 'tote'],
    highlights: [
      'Vegetable-tanned full-grain leather',
      'Hand-woven base panel',
      'Solid brass hardware',
      'Detachable, adjustable shoulder strap',
    ],
    specifications: [
      {
        label: 'Material',
        value: 'Full-grain vegetable-tanned leather',
      },
      {
        label: 'Hardware',
        value: 'Solid brass',
      },
      {
        label: 'Dimensions',
        value: '28 × 21 × 12 cm',
      },
      {
        label: 'Lining',
        value: 'Cotton twill',
      },
      {
        label: 'Strap',
        value: 'Detachable, adjustable',
      },
    ],
    isFeatured: true,
    isBestSeller: false,
    isNewArrival: false,
    createdAt: '2026-08-02',
    compareAtPrice: 21999,
    colors: [
      {
        name: 'Amber',
        hex: '#c2622b',
      },
      {
        name: 'Teal',
        hex: '#1c6b71',
      },
    ],
  },
  {
    name: 'Teal Top-Handle Bag',
    slug: 'atelier-nord-teal-top-handle-bag',
    description:
      'A compact frame bag sized for a phone, a card holder and not much else — which is what makes it work in the evening. Smooth calf leather with a lacquered edge finish.',
    shortDescription: 'Compact frame bag with gold-tone hardware',
    images: [
      'https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=900&q=80',
    ],
    price: 13499,
    category: 'accessories',
    brand: 'Atelier Nord',
    sku: 'ZY-ACC-005',
    stock: 55,
    tags: ['bag', 'handbag', 'top handle', 'purse'],
    highlights: [
      'Smooth calf leather',
      'Hand-lacquered edge finish',
      'Gold-tone turn-lock closure',
      'Optional chain strap included',
    ],
    specifications: [
      {
        label: 'Material',
        value: 'Smooth calf leather',
      },
      {
        label: 'Hardware',
        value: 'Gold-tone brass',
      },
      {
        label: 'Dimensions',
        value: '22 × 15 × 8 cm',
      },
      {
        label: 'Closure',
        value: 'Turn-lock',
      },
      {
        label: 'Included',
        value: 'Chain strap, dust bag',
      },
    ],
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: true,
    createdAt: '2026-09-11',
    colors: [
      {
        name: 'Peacock Teal',
        hex: '#136d78',
      },
    ],
  },
  {
    name: 'Rose Gold Halo Ring',
    slug: 'lumiere-rose-gold-solitaire-ring',
    description:
      'A cushion-cut morganite centre stone in an 18k rose gold halo setting, with pavé shoulders. Each piece ships with an independent gemmological certificate.',
    shortDescription: '18k rose gold with a certified centre stone',
    images: [
      'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?auto=format&fit=crop&w=900&q=80',
    ],
    price: 28999,
    category: 'accessories',
    brand: 'Lumière',
    sku: 'ZY-ACC-006',
    stock: 68,
    tags: ['ring', 'jewellery', 'jewelry', 'gold', 'diamond'],
    highlights: [
      '18k rose gold, hallmarked',
      'Cushion-cut morganite centre',
      'Pavé-set shoulders',
      'Independent certification included',
    ],
    specifications: [
      {
        label: 'Metal',
        value: '18k rose gold',
      },
      {
        label: 'Centre stone',
        value: 'Morganite, cushion cut',
      },
      {
        label: 'Accent stones',
        value: 'Pavé white sapphire',
      },
      {
        label: 'Band width',
        value: '2.1 mm',
      },
      {
        label: 'Certification',
        value: 'Included',
      },
    ],
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: false,
    createdAt: '2026-07-18',
    compareAtPrice: 36999,
  },
  {
    name: 'Rose Dress Watch 36 mm',
    slug: 'meridian-rose-dress-watch',
    description:
      'Deliberately small at 36 mm, with a domed sapphire crystal and a slim rose-gold-plated case. Sits flat under a shirt cuff, which most dress watches no longer do.',
    shortDescription: 'A 36 mm case that slides under a cuff',
    images: [
      'https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=900&q=80',
    ],
    price: 16999,
    category: 'accessories',
    brand: 'Meridian',
    sku: 'ZY-ACC-007',
    stock: 81,
    tags: ['watch', 'dress watch', 'wristwatch', 'rose gold'],
    highlights: [
      '36 mm slim case, 8.2 mm thick',
      'Domed sapphire crystal',
      'Swiss quartz movement',
      'Interchangeable quick-release strap',
    ],
    specifications: [
      {
        label: 'Case',
        value: '36 mm, rose gold plated',
      },
      {
        label: 'Thickness',
        value: '8.2 mm',
      },
      {
        label: 'Movement',
        value: 'Swiss quartz',
      },
      {
        label: 'Crystal',
        value: 'Domed sapphire',
      },
      {
        label: 'Strap',
        value: 'Quick-release leather',
      },
    ],
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: false,
    createdAt: '2026-02-16',
    compareAtPrice: 19999,
  },
  {
    name: 'Signature Eau de Parfum',
    slug: 'maison-lys-signature-eau-de-parfum',
    description:
      'An iris-forward eau de parfum that dries down into vetiver and amber over about an hour. Concentrated at 18%, so two sprays last a working day.',
    shortDescription: 'Iris, vetiver and warm amber · 50 ml',
    images: [
      'https://images.unsplash.com/photo-1585386959984-a4155224a1ad?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=900&q=80',
    ],
    price: 9450,
    category: 'beauty',
    brand: 'Maison Lys',
    sku: 'ZY-BTY-001',
    stock: 94,
    tags: ['perfume', 'fragrance', 'eau de parfum', 'scent'],
    highlights: [
      '18% fragrance concentration',
      'Top: bergamot, pink pepper',
      'Heart: iris, orris root',
      'Base: vetiver, amber, cedar',
    ],
    specifications: [
      {
        label: 'Volume',
        value: '50 ml',
      },
      {
        label: 'Concentration',
        value: 'Eau de parfum, 18%',
      },
      {
        label: 'Family',
        value: 'Woody floral',
      },
      {
        label: 'Longevity',
        value: '7–9 hours',
      },
      {
        label: 'Made in',
        value: 'Grasse, France',
      },
    ],
    isFeatured: false,
    isBestSeller: true,
    isNewArrival: false,
    createdAt: '2026-06-22',
    compareAtPrice: 11800,
  },
  {
    name: 'Daily Skincare Set',
    slug: 'curo-daily-skincare-set',
    description:
      'A three-step routine that does not require a decision tree. Gel cleanser, a 10% niacinamide serum, and a ceramide moisturiser — fragrance-free throughout.',
    shortDescription: 'Cleanser, serum and moisturiser in one routine',
    images: [
      'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=900&q=80',
    ],
    price: 2999,
    category: 'beauty',
    brand: 'Curo',
    sku: 'ZY-BTY-002',
    stock: 107,
    tags: ['skincare', 'skincare set', 'cleanser', 'serum', 'moisturiser'],
    highlights: [
      'Three-step routine, morning and night',
      '10% niacinamide serum',
      'Ceramide-rich moisturiser',
      'Fragrance-free and non-comedogenic',
    ],
    specifications: [
      {
        label: 'Contents',
        value: 'Cleanser 150 ml, serum 30 ml, moisturiser 50 ml',
      },
      {
        label: 'Key actives',
        value: 'Niacinamide, ceramides',
      },
      {
        label: 'Skin type',
        value: 'All, including sensitive',
      },
      {
        label: 'Fragrance',
        value: 'None',
      },
      {
        label: 'Shelf life',
        value: '12 months after opening',
      },
    ],
    isFeatured: false,
    isBestSeller: true,
    isNewArrival: false,
    createdAt: '2026-05-08',
    compareAtPrice: 4199,
  },
  {
    name: 'Barrier Repair Night Cream',
    slug: 'curo-barrier-repair-cream',
    description:
      'A thicker overnight cream built around a ceramide and cholesterol blend at the ratio your skin barrier actually uses. Heavy enough to feel like something; light enough not to move onto the pillow.',
    shortDescription: 'Overnight ceramide repair, fragrance-free',
    images: [
      'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&w=900&q=80',
    ],
    price: 1899,
    category: 'beauty',
    brand: 'Curo',
    sku: 'ZY-BTY-003',
    stock: 24,
    tags: ['skincare', 'moisturiser', 'night cream', 'ceramide'],
    highlights: [
      'Ceramide NP, AP and EOP complex',
      'Squalane and cholesterol blend',
      'Fragrance- and essential-oil-free',
      'Dermatologist tested',
    ],
    specifications: [
      {
        label: 'Volume',
        value: '50 ml',
      },
      {
        label: 'Key actives',
        value: 'Ceramides, squalane, cholesterol',
      },
      {
        label: 'Use',
        value: 'Night',
      },
      {
        label: 'Skin type',
        value: 'Dry, compromised barrier',
      },
      {
        label: 'Fragrance',
        value: 'None',
      },
    ],
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: true,
    createdAt: '2026-08-26',
  },
  {
    name: 'Everyday Glow Cosmetics Kit',
    slug: 'aeva-glow-cosmetics-kit',
    description:
      'A seven-piece kit assembled around one warm neutral palette, so every piece works with every other piece. Includes brushes that are worth keeping.',
    shortDescription: 'Seven pieces for a five-minute face',
    images: [
      'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1585386959984-a4155224a1ad?auto=format&fit=crop&w=900&q=80',
    ],
    price: 3499,
    category: 'beauty',
    brand: 'Aeva',
    sku: 'ZY-BTY-004',
    stock: 3,
    tags: ['makeup', 'cosmetics', 'kit', 'beauty set'],
    highlights: [
      'Seven coordinated pieces',
      'Two synthetic brushes included',
      'Buildable, blendable formulas',
      'Cruelty-free and vegan',
    ],
    specifications: [
      {
        label: 'Contents',
        value: '7 pieces including 2 brushes',
      },
      {
        label: 'Finish',
        value: 'Satin, buildable',
      },
      {
        label: 'Palette',
        value: 'Warm neutral',
      },
      {
        label: 'Cruelty-free',
        value: 'Yes',
      },
      {
        label: 'Vegan',
        value: 'Yes',
      },
    ],
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: false,
    createdAt: '2026-04-29',
    compareAtPrice: 4999,
  },
  {
    name: 'Minimal Skincare Trio',
    slug: 'oskia-minimal-skincare-trio',
    description:
      'Three products in refillable glass, sold with a refill pouch from the start. Minimal ingredient lists and no colourants — the packaging is the only design statement.',
    shortDescription: 'Toner, essence and oil in refillable glass',
    images: [
      'https://images.unsplash.com/photo-1631729371254-42c2892f0e6e?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&w=900&q=80',
    ],
    price: 5299,
    category: 'beauty',
    brand: 'Oskia',
    sku: 'ZY-BTY-005',
    stock: 50,
    tags: ['skincare', 'skincare set', 'toner', 'essence', 'face oil'],
    highlights: [
      'Refillable glass bottles',
      'Refill pouch included',
      'Under twelve ingredients per product',
      'No colourants or synthetic fragrance',
    ],
    specifications: [
      {
        label: 'Contents',
        value: 'Toner 120 ml, essence 60 ml, oil 30 ml',
      },
      {
        label: 'Packaging',
        value: 'Refillable glass',
      },
      {
        label: 'Fragrance',
        value: 'Natural, from botanicals',
      },
      {
        label: 'Skin type',
        value: 'Normal to dry',
      },
      {
        label: 'Shelf life',
        value: '9 months after opening',
      },
    ],
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: false,
    createdAt: '2026-03-12',
  },
  {
    name: 'Insulated Bottle 750 ml',
    slug: 'terra-insulated-bottle-750',
    description:
      'Double-walled 18/8 stainless steel with a powder-coated finish that does not get slippery when wet. The lid comes apart completely, which is the only way a bottle lid ever gets properly clean.',
    shortDescription: 'Cold for 24 hours, hot for 12',
    images: [
      'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=900&q=80',
    ],
    price: 2199,
    category: 'home',
    brand: 'Terra',
    sku: 'ZY-HOM-001',
    stock: 63,
    tags: ['bottle', 'water bottle', 'insulated bottle', 'flask'],
    highlights: [
      'Double-walled 18/8 stainless steel',
      '24 h cold / 12 h hot',
      'Fully disassemblable lid',
      'Powder-coated, condensation-free exterior',
    ],
    specifications: [
      {
        label: 'Capacity',
        value: '750 ml',
      },
      {
        label: 'Material',
        value: '18/8 stainless steel',
      },
      {
        label: 'Insulation',
        value: 'Double wall vacuum',
      },
      {
        label: 'Weight',
        value: '380 g empty',
      },
      {
        label: 'Dishwasher safe',
        value: 'Lid only',
      },
    ],
    isFeatured: true,
    isBestSeller: true,
    isNewArrival: false,
    createdAt: '2026-01-30',
    compareAtPrice: 2899,
    colors: [
      {
        name: 'Sage',
        hex: '#6f8a72',
      },
      {
        name: 'Chalk',
        hex: '#e8e5de',
      },
      {
        name: 'Ink',
        hex: '#232629',
      },
    ],
  },
  {
    name: 'Stoneware Cup Set of 4',
    slug: 'terra-stoneware-cup-set',
    description:
      'Wheel-thrown stoneware with a reactive glaze that pools differently on every piece. Sold as a set of four, and every set is visibly a set of four individuals.',
    shortDescription: 'Wheel-thrown, reactive glaze, no two alike',
    images: [
      'https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=80',
    ],
    price: 3299,
    category: 'home',
    brand: 'Terra',
    sku: 'ZY-HOM-002',
    stock: 76,
    tags: ['cups', 'mugs', 'stoneware', 'ceramic', 'tableware'],
    highlights: [
      'Wheel-thrown stoneware',
      'Reactive glaze, unique to each piece',
      'Dishwasher and microwave safe',
      'Stackable profile',
    ],
    specifications: [
      {
        label: 'Contents',
        value: '4 cups',
      },
      {
        label: 'Capacity',
        value: '250 ml each',
      },
      {
        label: 'Material',
        value: 'Stoneware',
      },
      {
        label: 'Glaze',
        value: 'Reactive, food safe',
      },
      {
        label: 'Care',
        value: 'Dishwasher safe',
      },
    ],
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: true,
    createdAt: '2026-08-15',
  },
  {
    name: 'Matte Ceramic Planter',
    slug: 'terra-matte-planter-medium',
    description:
      'A matte-glazed planter with a real drainage hole and a matching saucer, which a surprising number of decorative planters still omit. Sized for a 15 cm nursery pot.',
    shortDescription: 'Drainage hole and saucer, actually included',
    images: [
      'https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1631729371254-42c2892f0e6e?auto=format&fit=crop&w=900&q=80',
    ],
    price: 1799,
    category: 'home',
    brand: 'Terra',
    sku: 'ZY-HOM-003',
    stock: 89,
    tags: ['planter', 'pot', 'ceramic', 'plant pot', 'garden'],
    highlights: [
      'Drainage hole with matching saucer',
      'Fits a 15 cm nursery pot',
      'Matte food-safe glaze',
      'Felt base pads included',
    ],
    specifications: [
      {
        label: 'Dimensions',
        value: '17 × 16 cm',
      },
      {
        label: 'Fits',
        value: '15 cm nursery pot',
      },
      {
        label: 'Material',
        value: 'Glazed ceramic',
      },
      {
        label: 'Drainage',
        value: 'Hole and saucer',
      },
      {
        label: 'Weight',
        value: '1.2 kg',
      },
    ],
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: false,
    createdAt: '2026-02-05',
    compareAtPrice: 2499,
  },
];
