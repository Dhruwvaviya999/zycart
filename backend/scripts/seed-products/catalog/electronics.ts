import type { CategoryDef, Tier } from '../types';
import { brands, byTier, DEVICE_COLORS, paragraph, refCode, spec } from './helpers';

const WARRANTY = '1 year manufacturer warranty';

/* Smartphones -------------------------------------------------------- */

const PHONE_LINES: Record<string, [string, number, number][]> = {
  Samsung: [
    ['Galaxy A', 15, 56],
    ['Galaxy M', 14, 55],
    ['Galaxy F', 14, 55],
    ['Galaxy S', 23, 25],
  ],
  Apple: [['iPhone', 15, 17]],
  OnePlus: [
    ['Nord CE', 3, 5],
    ['Nord', 3, 5],
    ['', 12, 13],
  ],
  Redmi: [
    ['Note', 13, 14],
    ['', 13, 14],
  ],
  realme: [
    ['Narzo', 70, 80],
    ['', 12, 14],
    ['P', 1, 3],
    ['GT', 6, 7],
  ],
  vivo: [
    ['T', 3, 4],
    ['Y', 28, 58],
    ['V', 30, 40],
  ],
  OPPO: [
    ['A', 3, 79],
    ['Reno', 11, 13],
    ['F', 25, 27],
  ],
  Motorola: [
    ['moto g', 35, 85],
    ['edge', 50, 60],
  ],
  iQOO: [
    ['Z', 7, 9],
    ['Neo', 9, 10],
  ],
  Nothing: [['Phone', 2, 3]],
  Google: [['Pixel', 8, 9]],
  POCO: [
    ['X', 6, 7],
    ['M', 6, 7],
    ['F', 6, 7],
  ],
};

const PHONE_CHIPS: Record<Tier, string[]> = {
  budget: ['MediaTek Dimensity 6300', 'MediaTek Helio G99', 'Snapdragon 4 Gen 2', 'Unisoc T760'],
  mid: [
    'MediaTek Dimensity 7300',
    'Snapdragon 7s Gen 3',
    'Snapdragon 7 Gen 3',
    'MediaTek Dimensity 8300',
  ],
  premium: [
    'Snapdragon 8 Gen 3',
    'Snapdragon 8 Elite',
    'MediaTek Dimensity 9300+',
    'Google Tensor G4',
  ],
};

/* Laptops ------------------------------------------------------------ */

const LAPTOP_LINES: Record<string, { line: string; gaming?: boolean }[]> = {
  HP: [
    { line: 'Pavilion 15' },
    { line: 'Victus 15', gaming: true },
    { line: 'Envy x360 14' },
    { line: 'OmniBook 5' },
    { line: '15s' },
  ],
  Dell: [
    { line: 'Inspiron 15 3530' },
    { line: 'Vostro 3520' },
    { line: 'XPS 13' },
    { line: 'G15 5530', gaming: true },
    { line: 'Inspiron 14 Plus' },
  ],
  Lenovo: [
    { line: 'IdeaPad Slim 3' },
    { line: 'IdeaPad Slim 5' },
    { line: 'ThinkPad E14' },
    { line: 'LOQ 15', gaming: true },
    { line: 'Legion 5', gaming: true },
    { line: 'Yoga Slim 7' },
  ],
  ASUS: [
    { line: 'Vivobook 15' },
    { line: 'Zenbook 14 OLED' },
    { line: 'TUF Gaming F15', gaming: true },
    { line: 'ROG Strix G16', gaming: true },
    { line: 'Vivobook S14' },
  ],
  Acer: [
    { line: 'Aspire 7' },
    { line: 'Swift Go 14' },
    { line: 'Nitro V 15', gaming: true },
    { line: 'Aspire Lite' },
  ],
  MSI: [
    { line: 'Modern 14' },
    { line: 'Thin GF63', gaming: true },
    { line: 'Katana 15', gaming: true },
  ],
  Apple: [{ line: 'MacBook Air 13' }, { line: 'MacBook Air 15' }, { line: 'MacBook Pro 14' }],
};

const LAPTOP_CPUS: { name: string; level: number; amd?: boolean }[] = [
  { name: 'Intel Core i3-1315U', level: 0 },
  { name: 'AMD Ryzen 3 7320U', level: 0, amd: true },
  { name: 'Intel Core i5-1335U', level: 1 },
  { name: 'AMD Ryzen 5 7535HS', level: 1, amd: true },
  { name: 'Intel Core i5-13420H', level: 1 },
  { name: 'Intel Core Ultra 5 125H', level: 2 },
  { name: 'AMD Ryzen 7 7840HS', level: 2, amd: true },
  { name: 'Intel Core i7-13620H', level: 2 },
  { name: 'Intel Core Ultra 7 155H', level: 3 },
  { name: 'Intel Core i9-14900HX', level: 4 },
];

/* Category ------------------------------------------------------------ */

export const electronics: CategoryDef = {
  slug: 'electronics',
  name: 'Electronics',
  description: 'Phones, laptops, audio, wearables and everything that plugs in',
  image:
    'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=700&q=80',
  gstRate: 18,
  hsnCode: '8517',
  tryOnEnabled: false,
  code: 'ELE',
  weight: 22,
  reviewScale: 2600,
  subcategories: [
    {
      key: 'smartphones',
      name: 'Smartphones',
      code: 'PHN',
      weight: 18,
      images: 'smartphones',
      brands: brands(
        ['Samsung', 'mid', 3],
        ['Apple', 'premium', 2],
        ['OnePlus', 'mid', 2],
        ['Redmi', 'budget', 3],
        ['realme', 'budget', 2],
        ['vivo', 'mid', 2],
        ['OPPO', 'mid', 1],
        ['Motorola', 'budget', 2],
        ['iQOO', 'mid', 1],
        ['Nothing', 'mid', 1],
        ['Google', 'premium', 1],
        ['POCO', 'budget', 2],
      ),
      discount: [0.05, 0.3],
      stockScale: 70,
      lowStockThreshold: 8,
      build({ rng, brand }) {
        const [family, lo, hi] = rng.pick(PHONE_LINES[brand.name]!);
        const number = rng.int(lo, hi);
        const isApple = brand.name === 'Apple';
        const flagship =
          family === 'Galaxy S' ||
          family === 'Pixel' ||
          isApple ||
          (brand.name === 'OnePlus' && family === '');
        const tier: typeof brand.tier = flagship ? 'premium' : brand.tier;
        const suffix = isApple
          ? rng.weighted([
              ['', 4],
              [' Plus', 2],
              [' Pro', 3],
              [' Pro Max', 2],
            ] as const)
          : rng.weighted([
              ['', 3],
              [' 5G', 5],
              [' Pro 5G', 3],
              [' Pro+ 5G', 1],
              [' Lite 5G', 1],
            ] as const);
        // "Galaxy A35" and "moto g85" run the number on; "Note 14" and "Reno 12" do not.
        const joiner = /\b[A-Za-z]$/.test(family) ? '' : ' ';
        const model = `${brand.name} ${family}${joiner}${number}${suffix}`.replace(/\s+/g, ' ');

        const rams = byTier(tier, [4, 6, 8], [8, 12], [8, 12, 16]);
        const ram = isApple ? 8 : rng.pick(rams);
        const storage = rng.pick(
          byTier(tier, [64, 128, 128, 256], [128, 256, 256], [256, 512, 1024]),
        );
        const storageLabel = storage >= 1024 ? '1TB' : `${storage}GB`;
        const color = rng.pick(DEVICE_COLORS);

        const chip = isApple
          ? `Apple A${number + 2}${suffix.includes('Pro') ? ' Pro' : ''}`
          : rng.pick(PHONE_CHIPS[tier]);
        const screen = rng.pick(
          byTier(
            tier,
            ['6.6', '6.67', '6.72', '6.74'],
            ['6.67', '6.7', '6.74', '6.78'],
            ['6.1', '6.3', '6.7', '6.8'],
          ),
        );
        const panel =
          tier === 'budget' && rng.chance(0.5)
            ? 'FHD+ LCD, 90Hz'
            : `${tier === 'premium' ? 'LTPO ' : ''}AMOLED, 120Hz`;
        const mainCam = rng.pick(byTier(tier, [50, 50, 108], [50, 64, 200], [48, 50, 200]));
        const battery = isApple ? rng.int(33, 46) * 100 : rng.pick([5000, 5000, 5500, 6000]);
        const charging = isApple
          ? '20W wired, MagSafe'
          : `${rng.pick(byTier(tier, [18, 33, 45], [45, 67, 80], [45, 65, 100]))}W fast charging`;

        const base = byTier(tier, 9500, 22000, 64000) * (isApple ? 1.25 : 1);
        const mrp =
          base *
          (1 + [4, 6, 8, 12, 16].indexOf(ram) * 0.09) *
          (1 + [64, 128, 256, 512, 1024].indexOf(storage) * 0.14) *
          rng.float(0.92, 1.1);

        return {
          name: `${model} (${color.name}, ${isApple ? storageLabel : `${ram}GB RAM, ${storageLabel} Storage`})`,
          mrp,
          shortDescription: `${screen}" ${panel.split(',')[0]} display, ${chip}, ${mainCam}MP camera and a ${battery} mAh battery.`,
          description: paragraph(
            rng,
            [
              `The ${model} pairs a ${screen}-inch ${panel} display with the ${chip} for smooth everyday performance.`,
              `${ram}GB of RAM and ${storageLabel} of storage leave room for apps, games and years of photos.`,
            ],
            [
              `The ${mainCam}MP main camera captures sharp, detailed shots in daylight, and night mode keeps low-light photos clean.`,
              `A ${battery} mAh battery comfortably lasts a full day, and ${charging} tops it up quickly.`,
              `5G, Wi-Fi 6 and Bluetooth 5.3 keep it connected wherever you are.`,
              `It ships with ${isApple ? 'iOS 18' : 'Android 15'} and is promised multiple years of OS and security updates.`,
              `The in-box contents include the handset, a USB Type-C cable, a SIM ejector tool and documentation.`,
            ],
            3,
          ),
          highlights: [
            `${ram}GB RAM | ${storageLabel} ROM`,
            `${screen} inch ${panel}`,
            `${mainCam}MP main camera`,
            `${battery} mAh battery with ${charging}`,
            chip,
          ],
          specifications: [
            spec('RAM', `${ram} GB`),
            spec('Internal Storage', storageLabel),
            spec('Processor', chip),
            spec('Display', `${screen} inch ${panel}`),
            spec(
              'Rear Camera',
              `${mainCam}MP + ${rng.pick(['8MP', '12MP', '2MP', '50MP'])}${tier !== 'budget' ? ` + ${rng.pick(['2MP', '10MP telephoto', '12MP ultra-wide'])}` : ''}`,
            ),
            spec('Front Camera', `${rng.pick([8, 12, 16, 32, 50])}MP`),
            spec('Battery', `${battery} mAh`),
            spec('Charging', charging),
            spec(
              'Connectivity',
              `5G, Wi-Fi 6, Bluetooth 5.3${tier !== 'budget' ? ', NFC' : ''}, USB Type-C`,
            ),
            spec('Operating System', isApple ? 'iOS 18' : 'Android 15'),
            spec('Colour', color.name),
            spec('Warranty', WARRANTY),
          ],
          tags: [
            'mobile',
            'phone',
            '5g',
            `${ram}gb ram`,
            storageLabel.toLowerCase(),
            color.name.toLowerCase(),
          ],
          colors: [color],
        };
      },
    },
    {
      key: 'laptops',
      name: 'Laptops',
      code: 'LAP',
      weight: 12,
      images: 'laptops',
      brands: brands(
        ['HP', 'mid', 3],
        ['Dell', 'mid', 3],
        ['Lenovo', 'mid', 3],
        ['ASUS', 'mid', 3],
        ['Acer', 'budget', 2],
        ['MSI', 'mid', 1],
        ['Apple', 'premium', 2],
      ),
      discount: [0.08, 0.32],
      stockScale: 35,
      lowStockThreshold: 5,
      build({ rng, brand }) {
        const { line, gaming } = rng.pick(LAPTOP_LINES[brand.name]!);
        const isApple = brand.name === 'Apple';
        const cpu = isApple
          ? { name: rng.pick(['Apple M3', 'Apple M4', 'Apple M4 Pro']), level: 3 }
          : rng.pick(LAPTOP_CPUS.filter((c) => (gaming ? c.level >= 1 : c.level <= 3)));
        const ram = isApple
          ? rng.pick([16, 24])
          : rng.pick(cpu.level >= 2 ? [16, 16, 32] : [8, 16]);
        const ssd = rng.pick(cpu.level >= 2 ? [512, 1024] : [512, 512, 1024]);
        const ssdLabel = ssd >= 1024 ? '1TB SSD' : `${ssd}GB SSD`;
        const gpu = isApple
          ? 'Integrated 10-core GPU'
          : gaming
            ? rng.pick([
                'NVIDIA GeForce RTX 3050 6GB',
                'NVIDIA GeForce RTX 4050 6GB',
                'NVIDIA GeForce RTX 4060 8GB',
              ])
            : cpu.amd
              ? 'AMD Radeon Graphics'
              : cpu.level >= 2
                ? 'Intel Arc Graphics'
                : 'Intel Iris Xe Graphics';
        const size = line.match(/1[3-6]/)?.[0] ?? rng.pick(['14', '15.6', '16']);
        const panel = isApple
          ? 'Liquid Retina display'
          : gaming
            ? `FHD IPS, ${rng.pick([144, 165])}Hz`
            : rng.pick(['FHD IPS, anti-glare', '2.8K OLED, 120Hz', 'FHD+ IPS, 60Hz', 'WUXGA IPS']);
        const weight = gaming ? rng.float(2.1, 2.6) : rng.float(1.2, 1.8);
        const battery = isApple ? rng.int(15, 18) : gaming ? rng.int(5, 7) : rng.int(8, 13);
        const color = rng.pick(
          isApple
            ? ['Midnight', 'Starlight', 'Space Grey', 'Silver']
            : ['Natural Silver', 'Mica Silver', 'Graphite Black', 'Cloud Grey', 'Arctic Grey'],
        );

        const mrp =
          (isApple ? 92000 : 36000) *
          (1 + cpu.level * 0.28) *
          (gaming && !isApple ? 1.25 : 1) *
          (ram >= 32 ? 1.15 : ram >= 16 ? 1.05 : 1) *
          (ssd >= 1024 ? 1.1 : 1) *
          rng.float(0.92, 1.08);

        const model = `${brand.name} ${line}`;
        return {
          name: `${model} ${cpu.name.replace(/^(Intel|AMD|Apple) /, '')} ${gaming ? 'Gaming ' : ''}Laptop (${ram}GB RAM, ${ssdLabel}, ${size}", ${color})`,
          mrp,
          shortDescription: `${cpu.name}, ${ram}GB RAM, ${ssdLabel} and a ${size}-inch ${panel.split(',')[0]} screen in a ${weight.toFixed(2)} kg chassis.`,
          description: paragraph(
            rng,
            [
              `The ${model} runs on the ${cpu.name} with ${ram}GB of memory and a ${ssdLabel} for fast boots and quick app launches.`,
              gaming
                ? `A ${gpu} and a high-refresh ${panel} panel make it ready for modern AAA titles at high settings.`
                : `Its ${size}-inch ${panel} panel is easy on the eyes through long workdays and classes.`,
            ],
            [
              `Battery life of up to ${battery} hours means you can leave the charger at home for most of the day.`,
              `At ${weight.toFixed(2)} kg it slips easily into a backpack.`,
              `A backlit keyboard, Full HD webcam and dual-array microphones make video calls clear and late-night typing easy.`,
              `Ports include USB Type-C with Power Delivery, USB-A, HDMI and a headphone jack${isApple ? ' (MagSafe charging on the Pro)' : ''}.`,
              isApple
                ? 'macOS Sequoia comes preinstalled.'
                : 'It ships with Windows 11 Home and a lifetime licence for Office Home & Student 2021.',
            ],
            3,
          ),
          highlights: [
            cpu.name,
            `${ram}GB RAM | ${ssdLabel}`,
            `${size}" ${panel}`,
            gpu,
            `Up to ${battery} hours battery`,
          ],
          specifications: [
            spec('Processor', cpu.name),
            spec('RAM', `${ram} GB ${isApple ? 'unified memory' : 'DDR5'}`),
            spec('Storage', ssdLabel),
            spec('Display', `${size} inch ${panel}`),
            spec('Graphics', gpu),
            spec('Battery Life', `Up to ${battery} hours`),
            spec('Weight', `${weight.toFixed(2)} kg`),
            spec('Operating System', isApple ? 'macOS' : 'Windows 11 Home'),
            spec('Connectivity', 'Wi-Fi 6E, Bluetooth 5.3'),
            spec('Colour', color),
            spec('Warranty', WARRANTY),
          ],
          tags: [
            'laptop',
            'notebook',
            ...(gaming ? ['gaming laptop'] : ['thin and light']),
            `${ram}gb ram`,
            cpu.name.toLowerCase(),
          ],
        };
      },
    },
    {
      key: 'tablets',
      name: 'Tablets',
      code: 'TAB',
      weight: 5,
      images: 'tablets',
      brands: brands(
        ['Apple', 'premium', 2],
        ['Samsung', 'mid', 3],
        ['Lenovo', 'budget', 2],
        ['Xiaomi', 'mid', 2],
        ['OnePlus', 'mid', 1],
        ['realme', 'budget', 1],
      ),
      discount: [0.05, 0.3],
      stockScale: 40,
      build({ rng, brand }) {
        const lines: Record<string, string[]> = {
          Apple: ['iPad 10th Gen', 'iPad Air 11"', 'iPad Pro 11"', 'iPad mini'],
          Samsung: ['Galaxy Tab A9+', 'Galaxy Tab S9 FE', 'Galaxy Tab S10+'],
          Lenovo: ['Tab M11', 'Tab P12', 'Tab M10 Gen 3'],
          Xiaomi: ['Pad 6', 'Pad 7', 'Redmi Pad Pro'],
          OnePlus: ['Pad Go', 'Pad 2'],
          realme: ['Pad 2', 'Pad 2 Lite'],
        };
        const line = rng.pick(lines[brand.name]!);
        const storage = rng.pick([64, 128, 256]);
        const ram = brand.name === 'Apple' ? 8 : rng.pick([4, 6, 8]);
        const cellular = rng.chance(0.35);
        const screen = rng.pick(['10.9', '11', '11.5', '12.1', '12.4']);
        const battery = rng.pick([7040, 8000, 8840, 10090]);
        const color = rng.pick(DEVICE_COLORS);
        const mrp =
          byTier(brand.tier, 16000, 28000, 52000) *
          (1 + [64, 128, 256].indexOf(storage) * 0.18) *
          (cellular ? 1.2 : 1) *
          rng.float(0.92, 1.1);
        return {
          name: `${brand.name} ${line} ${screen}" Tablet (${ram}GB RAM, ${storage}GB, ${cellular ? 'Wi-Fi + 5G' : 'Wi-Fi'}, ${color.name})`,
          mrp,
          shortDescription: `${screen}-inch display, ${storage}GB storage and all-day battery for streaming, notes and study.`,
          description: paragraph(
            rng,
            [
              `The ${brand.name} ${line} puts a ${screen}-inch high-resolution display in a slim metal body that is equally at home on the sofa and in the classroom.`,
            ],
            [
              `${ram}GB of RAM keeps split-screen multitasking smooth.`,
              `A ${battery} mAh battery delivers up to 12 hours of video playback.`,
              `Quad speakers with Dolby Atmos make films and calls sound full.`,
              `Stylus support turns it into a notebook and sketchpad (stylus sold separately).`,
              cellular
                ? 'A built-in 5G modem keeps you online away from Wi-Fi.'
                : 'Wi-Fi 6 keeps downloads and streaming quick at home.',
            ],
            3,
          ),
          highlights: [
            `${screen}" display`,
            `${ram}GB RAM | ${storage}GB`,
            cellular ? 'Wi-Fi + 5G' : 'Wi-Fi',
            `${battery} mAh battery`,
          ],
          specifications: [
            spec('Display', `${screen} inch, 2K resolution`),
            spec('RAM', `${ram} GB`),
            spec('Storage', `${storage} GB`),
            spec(
              'Connectivity',
              cellular ? 'Wi-Fi 6, 5G, Bluetooth 5.3' : 'Wi-Fi 6, Bluetooth 5.3',
            ),
            spec('Battery', `${battery} mAh`),
            spec('Stylus Support', 'Yes (sold separately)'),
            spec('Colour', color.name),
            spec('Warranty', WARRANTY),
          ],
          tags: ['tablet', 'ipad', 'study', color.name.toLowerCase()],
          colors: [color],
        };
      },
    },
    {
      key: 'headphones',
      name: 'Headphones',
      code: 'HPH',
      weight: 8,
      images: 'headphones',
      brands: brands(
        ['Sony', 'premium', 2],
        ['boAt', 'budget', 3],
        ['JBL', 'mid', 3],
        ['Sennheiser', 'premium', 1],
        ['Bose', 'premium', 1],
        ['Skullcandy', 'mid', 1],
        ['Noise', 'budget', 2],
        ['Marshall', 'premium', 1],
      ),
      discount: [0.1, 0.6],
      stockScale: 90,
      build({ rng, brand }) {
        const lines: Record<string, string[]> = {
          Sony: ['WH-CH', 'WH-XB', 'WH-1000XM', 'ULT Wear '],
          boAt: ['Rockerz ', 'Nirvana ', 'Immortal '],
          JBL: ['Tune ', 'Live ', 'Tour One M'],
          Sennheiser: ['HD ', 'Momentum ', 'Accentum '],
          Bose: ['QuietComfort ', 'QC Ultra '],
          Skullcandy: ['Crusher ', 'Hesh ', 'Riff '],
          Noise: ['Two ', 'Three ', 'Airwave '],
          Marshall: ['Major ', 'Monitor ', 'Motif '],
        };
        const series =
          `${rng.pick(lines[brand.name]!)}${rng.int(2, 9)}${rng.pick(['50', '20', '70', '00', '5'])}${rng.pick(['', 'NC', 'BT', ' Pro', ' Max'])}`.replace(
            /\s+/g,
            ' ',
          );
        const anc = brand.tier !== 'budget' ? rng.chance(0.75) : rng.chance(0.35);
        const battery = rng.pick([30, 40, 50, 60, 70]);
        const driver = rng.pick([30, 40, 40, 50]);
        const color = rng.pick(DEVICE_COLORS.slice(0, 6));
        const mrp = byTier(brand.tier, 3999, 8999, 29990) * (anc ? 1.3 : 1) * rng.float(0.85, 1.15);
        return {
          name: `${brand.name} ${series} Wireless Over-Ear Headphones${anc ? ' with Active Noise Cancellation' : ''} (${color.name})`,
          mrp,
          shortDescription: `${driver}mm drivers, ${battery} hours of playback${anc ? ', active noise cancellation' : ''} and multipoint Bluetooth.`,
          description: paragraph(
            rng,
            [
              `${brand.name}'s ${series} headphones use ${driver}mm dynamic drivers tuned for deep bass and clear vocals.`,
            ],
            [
              anc
                ? 'Hybrid active noise cancellation quietens buses, flights and open offices.'
                : 'Plush ear cushions seal out ambient noise passively.',
              `Up to ${battery} hours of playback, and a 10-minute charge adds hours more.`,
              'Bluetooth 5.3 with multipoint lets you switch between phone and laptop without re-pairing.',
              'Built-in microphones with ENC keep your voice clear on calls.',
              'They fold flat into the included travel pouch.',
            ],
            3,
          ),
          highlights: [
            `${driver}mm drivers`,
            `${battery} hours playback`,
            anc ? 'Active Noise Cancellation' : 'Passive noise isolation',
            'Bluetooth 5.3, multipoint',
          ],
          specifications: [
            spec('Type', 'Over-ear, wireless'),
            spec('Driver Size', `${driver} mm`),
            spec('Battery Life', `Up to ${battery} hours`),
            spec('Noise Cancellation', anc ? 'Active (ANC)' : 'Passive'),
            spec('Connectivity', 'Bluetooth 5.3, 3.5mm AUX'),
            spec('Microphone', 'Yes, with ENC'),
            spec('Colour', color.name),
            spec('Warranty', WARRANTY),
          ],
          tags: [
            'headphones',
            'wireless',
            'bluetooth',
            ...(anc ? ['anc', 'noise cancelling'] : []),
            'audio',
          ],
          colors: [color],
        };
      },
    },
    {
      key: 'earbuds',
      name: 'True Wireless Earbuds',
      code: 'TWS',
      weight: 9,
      images: 'earbuds',
      brands: brands(
        ['boAt', 'budget', 4],
        ['Noise', 'budget', 3],
        ['OnePlus', 'mid', 2],
        ['Nothing', 'mid', 1],
        ['Samsung', 'mid', 2],
        ['Apple', 'premium', 1],
        ['realme', 'budget', 2],
        ['JBL', 'mid', 2],
        ['Sony', 'premium', 1],
      ),
      discount: [0.15, 0.7],
      stockScale: 150,
      build({ rng, brand }) {
        const lines: Record<string, string[]> = {
          boAt: ['Airdopes 141', 'Airdopes 311 Pro', 'Airdopes Atom 81', 'Nirvana Ion'],
          Noise: ['Buds VS104', 'Buds N1 Pro', 'Air Buds Pro 3', 'Buds X Prime'],
          OnePlus: ['Nord Buds 3', 'Nord Buds 3 Pro', 'Buds 3'],
          Nothing: ['Ear (a)', 'Ear', 'CMF Buds Pro 2'],
          Samsung: ['Galaxy Buds FE', 'Galaxy Buds3', 'Galaxy Buds3 Pro'],
          Apple: ['AirPods 4', 'AirPods Pro (2nd Gen)'],
          realme: ['Buds T300', 'Buds Air 6', 'Buds T110'],
          JBL: ['Wave Beam', 'Tune Buds', 'Live Pro 2'],
          Sony: ['WF-C700N', 'WF-1000XM5'],
        };
        const line = rng.pick(lines[brand.name]!);
        const anc =
          line.includes('Pro') || brand.tier !== 'budget' ? rng.chance(0.8) : rng.chance(0.3);
        const battery = rng.pick([30, 40, 42, 50, 60]);
        const ip = rng.pick(['IPX4', 'IPX5', 'IP54', 'IP55']);
        const color = rng.pick(DEVICE_COLORS.slice(0, 7));
        const mrp =
          byTier(brand.tier, 2499, 5999, 22900) * (anc ? 1.25 : 1) * rng.float(0.85, 1.15);
        return {
          name: `${brand.name} ${line} True Wireless Earbuds${anc ? ' with ANC' : ''}, ${battery}H Playback (${color.name})`,
          mrp,
          shortDescription: `${battery} hours total playback with the case, ${ip} sweat resistance and low-latency gaming mode.`,
          description: paragraph(
            rng,
            [
              `The ${brand.name} ${line} are compact true wireless earbuds with a pocketable charging case.`,
            ],
            [
              `They deliver up to ${battery} hours of total playback with the case, and fast charging gives 2 hours of music from 10 minutes.`,
              anc
                ? 'Active noise cancellation tunes out traffic and chatter, and a transparency mode lets the world back in.'
                : 'An ergonomic in-ear fit gives good passive isolation.',
              `${ip} sweat and splash resistance makes them gym-friendly.`,
              'A low-latency mode keeps audio in sync for gaming and video.',
              'Quad microphones with ENC keep calls clear outdoors.',
            ],
            3,
          ),
          highlights: [
            `${battery}H total playback`,
            anc ? 'Active Noise Cancellation' : 'ENC for calls',
            `${ip} rated`,
            'Bluetooth 5.3, low-latency mode',
          ],
          specifications: [
            spec('Type', 'True wireless, in-ear'),
            spec('Total Playback', `Up to ${battery} hours`),
            spec('Noise Cancellation', anc ? 'Active (ANC)' : 'ENC (calls)'),
            spec('Water Resistance', ip),
            spec('Bluetooth', '5.3'),
            spec('Charging Port', 'USB Type-C'),
            spec('Colour', color.name),
            spec('Warranty', WARRANTY),
          ],
          tags: [
            'earbuds',
            'tws',
            'wireless earphones',
            'bluetooth',
            ...(anc ? ['anc'] : []),
            'audio',
          ],
          colors: [color],
        };
      },
    },
    {
      key: 'smartwatches',
      name: 'Smartwatches',
      code: 'SWT',
      weight: 8,
      images: 'smartwatches',
      brands: brands(
        ['Noise', 'budget', 4],
        ['boAt', 'budget', 3],
        ['Fire-Boltt', 'budget', 3],
        ['Amazfit', 'mid', 2],
        ['Samsung', 'mid', 2],
        ['Apple', 'premium', 1],
        ['Garmin', 'premium', 1],
        ['OnePlus', 'mid', 1],
      ),
      discount: [0.15, 0.75],
      stockScale: 120,
      build({ rng, brand }) {
        const lines: Record<string, string[]> = {
          Noise: ['ColorFit Pro 5', 'ColorFit Icon 4', 'NoiseFit Halo 2', 'ColorFit Pulse 4 Max'],
          boAt: ['Wave Sigma 3', 'Storm Call 3', 'Lunar Discovery', 'Ultima Vogue'],
          'Fire-Boltt': ['Phoenix Ultra', 'Ninja Call Pro Plus', 'Visionary', 'Gladiator Pro'],
          Amazfit: ['GTR 4', 'GTS 4 Mini', 'Active 2', 'Bip 5'],
          Samsung: ['Galaxy Watch7 44mm', 'Galaxy Watch FE', 'Galaxy Watch Ultra'],
          Apple: ['Watch SE (GPS, 44mm)', 'Watch Series 10 (GPS, 46mm)'],
          Garmin: ['Forerunner 165', 'Venu Sq 2', 'Instinct 2 Solar'],
          OnePlus: ['Watch 2R', 'Watch 2'],
        };
        const line = rng.pick(lines[brand.name]!);
        const display = rng.pick([
          '1.96" AMOLED',
          '1.43" AMOLED',
          '2.01" HD',
          '1.85" TFT',
          '1.5" Super AMOLED',
        ]);
        const days = brand.name === 'Apple' ? 1 : rng.pick([5, 7, 10, 14]);
        const strap = rng.pick(['Silicone', 'Metal Mesh', 'Nylon Loop', 'Leather']);
        const color = rng.pick(DEVICE_COLORS.slice(0, 8));
        const mrp = byTier(brand.tier, 3999, 15999, 34900) * rng.float(0.85, 1.2);
        return {
          name: `${brand.name} ${line} Smartwatch, ${display} Display, Bluetooth Calling (${color.name}, ${strap} Strap)`,
          mrp,
          shortDescription: `${display} always-on display, heart-rate and SpO2 tracking, 100+ sports modes and up to ${days} days of battery.`,
          description: paragraph(
            rng,
            [
              `The ${brand.name} ${line} has a bright ${display} screen that stays readable in direct sun.`,
            ],
            [
              '24x7 heart-rate, SpO2, stress and sleep tracking give a clear picture of your health.',
              'Over 100 sports modes, with auto-detection for walking and running.',
              'Bluetooth calling lets you take calls from your wrist through the built-in mic and speaker.',
              `Battery life runs up to ${days} ${days === 1 ? 'day' : 'days'} on a single charge.`,
              'IP68 water resistance means it can stay on in the rain and the shower.',
              'Smart notifications, music controls and a find-my-phone feature are all a swipe away.',
            ],
            3,
          ),
          highlights: [
            `${display} display`,
            'Bluetooth calling',
            'SpO2 & heart-rate tracking',
            `Up to ${days} day battery`,
            'IP68 water resistant',
          ],
          specifications: [
            spec('Display', display),
            spec('Battery Life', `Up to ${days} ${days === 1 ? 'day' : 'days'}`),
            spec('Sensors', 'Heart rate, SpO2, accelerometer, gyroscope'),
            spec('Water Resistance', 'IP68'),
            spec('Calling', 'Bluetooth calling'),
            spec('Strap Material', strap),
            spec('Compatibility', brand.name === 'Apple' ? 'iOS' : 'Android & iOS'),
            spec('Colour', color.name),
            spec('Warranty', WARRANTY),
          ],
          tags: [
            'smartwatch',
            'fitness tracker',
            'wearable',
            'bluetooth calling',
            strap.toLowerCase(),
          ],
          colors: [color],
        };
      },
    },
    {
      key: 'speakers',
      name: 'Speakers',
      code: 'SPK',
      weight: 6,
      images: 'speakers',
      brands: brands(
        ['JBL', 'mid', 3],
        ['boAt', 'budget', 3],
        ['Sony', 'mid', 2],
        ['Marshall', 'premium', 1],
        ['Bose', 'premium', 1],
        ['Amazon', 'mid', 1],
        ['Zebronics', 'budget', 2],
      ),
      discount: [0.1, 0.55],
      stockScale: 70,
      build({ rng, brand }) {
        const smart = brand.name === 'Amazon' || rng.chance(0.15);
        const type = smart
          ? 'Smart Speaker'
          : rng.pick(['Portable Bluetooth Speaker', 'Party Speaker', 'Bluetooth Soundbar Speaker']);
        const watts = smart ? rng.pick([5, 15, 20]) : rng.pick([10, 16, 20, 30, 40, 60, 100]);
        const lines: Record<string, string[]> = {
          JBL: ['Flip', 'Go', 'Charge', 'Clip', 'PartyBox'],
          boAt: ['Stone', 'PartyPal', 'Aavante'],
          Sony: ['SRS-XB', 'SRS-XE', 'ULT Field'],
          Marshall: ['Emberton', 'Willen', 'Middleton', 'Stanmore'],
          Bose: ['SoundLink Flex', 'SoundLink Micro', 'SoundLink Max'],
          Zebronics: ['Zeb-Sound Feast', 'Zeb-Music Bomb', 'Zeb-Action'],
        };
        const series =
          brand.name === 'Amazon'
            ? rng.pick(['Echo Dot (5th Gen)', 'Echo Pop', 'Echo (4th Gen)'])
            : `${rng.pick(lines[brand.name]!)} ${rng.int(1, 9)}${rng.pick(['', '00', '0', ' Pro'])}`;
        const battery = smart ? 0 : rng.pick([8, 12, 16, 20, 24]);
        const color = rng.pick(DEVICE_COLORS.slice(0, 8));
        const mrp =
          byTier(brand.tier, 1999, 7999, 21999) * (watts / 20) ** 0.4 * rng.float(0.9, 1.15);
        return {
          name: `${brand.name} ${series} ${watts}W ${type} (${color.name})`,
          mrp,
          shortDescription: smart
            ? `Voice-controlled ${watts}W smart speaker with Alexa built in.`
            : `${watts}W output, ${battery} hours of playback and IP67 dust and water resistance.`,
          description: paragraph(
            rng,
            [
              `The ${brand.name} ${series} delivers ${watts}W of room-filling sound with punchy bass.`,
            ],
            smart
              ? [
                  'Ask Alexa to play music, set alarms, control smart lights and read out the news.',
                  'A microphone-off button gives you control over privacy.',
                  'Pair two units for stereo sound.',
                ]
              : [
                  `Up to ${battery} hours of playtime on a single charge.`,
                  'IP67 dust and water resistance means it can go to the beach or poolside.',
                  'Pair two speakers for true stereo.',
                  'A built-in power bank can top up your phone in a pinch.',
                  'Bluetooth 5.3 gives a stable connection up to 10 metres away.',
                ],
            2,
          ),
          highlights: [
            `${watts}W output`,
            smart ? 'Alexa built in' : `${battery} hours playback`,
            smart ? 'Wi-Fi & Bluetooth' : 'IP67 rated',
            'Bluetooth 5.3',
          ],
          specifications: [
            spec('Type', type),
            spec('Output Power', `${watts} W`),
            spec('Battery Life', smart ? 'Mains powered' : `Up to ${battery} hours`),
            spec('Connectivity', smart ? 'Wi-Fi, Bluetooth' : 'Bluetooth 5.3, AUX, USB'),
            spec('Water Resistance', smart ? 'Not rated' : 'IP67'),
            spec('Colour', color.name),
            spec('Warranty', WARRANTY),
          ],
          tags: [
            'speaker',
            'bluetooth speaker',
            ...(smart ? ['smart speaker', 'alexa'] : ['portable speaker']),
            'audio',
          ],
          colors: [color],
        };
      },
    },
    {
      key: 'televisions',
      name: 'Televisions',
      code: 'TVS',
      weight: 7,
      images: 'televisions',
      brands: brands(
        ['Samsung', 'mid', 3],
        ['LG', 'mid', 3],
        ['Sony', 'premium', 2],
        ['Xiaomi', 'budget', 3],
        ['TCL', 'budget', 2],
        ['Hisense', 'budget', 1],
        ['OnePlus', 'mid', 1],
        ['Vu', 'budget', 1],
      ),
      discount: [0.15, 0.45],
      stockScale: 18,
      lowStockThreshold: 3,
      build({ rng, brand }) {
        const size = rng.weighted([
          [32, 3],
          [43, 4],
          [50, 3],
          [55, 3],
          [65, 2],
          [75, 1],
        ] as const);
        const panel =
          size === 32
            ? 'HD Ready LED'
            : rng.weighted([
                ['4K Ultra HD LED', 5],
                ['4K QLED', 3],
                ['4K Mini LED', 1],
                ['4K OLED', brand.tier === 'budget' ? 0 : 1],
              ] as const);
        const cm = Math.round(size * 2.54);
        const os = rng.pick(
          brand.name === 'Samsung'
            ? ['Tizen']
            : brand.name === 'LG'
              ? ['webOS']
              : ['Google TV', 'Android TV'],
        );
        const hz = panel.includes('OLED') || panel.includes('Mini') ? 120 : rng.pick([60, 60, 120]);
        const sound = rng.pick([20, 24, 30, 40, 50]);
        const tvLines: Record<string, string[]> = {
          Samsung: ['Crystal 4K Vista', 'Crystal 4K iSmart', 'Neo QLED', 'The Frame'],
          LG: ['UR75', 'UT80', 'QNED80', 'OLED evo C4'],
          Sony: ['Bravia 2', 'Bravia 3', 'Bravia 7', 'Bravia X75L'],
          Xiaomi: ['X Pro', 'A Pro', 'Smart TV 5A'],
          TCL: ['C655', 'C755', 'P745', 'V6B'],
          Hisense: ['A6N', 'E7N', 'U6N'],
          OnePlus: ['Y1S Pro', 'Q2 Pro', 'Y1S'],
          Vu: ['GloLED', 'Vibe', 'Masterpiece'],
        };
        const series = rng.pick(tvLines[brand.name]!);
        const panelFactor = panel.includes('OLED')
          ? 2.6
          : panel.includes('Mini')
            ? 1.7
            : panel.includes('QLED')
              ? 1.3
              : 1;
        const mrp =
          byTier(brand.tier, 1, 1.2, 1.6) *
          { 32: 15000, 43: 32000, 50: 42000, 55: 52000, 65: 85000, 75: 140000 }[size] *
          panelFactor *
          rng.float(0.9, 1.1);
        return {
          name: `${brand.name} ${series} ${cm} cm (${size} inch) ${panel} Smart ${os.endsWith('TV') ? os : `${os} TV`} (${refCode(rng, size === 32 ? 'AA##AA' : `${size}AA###`)})`,
          mrp,
          shortDescription: `${size}-inch ${panel} panel, ${hz}Hz, ${sound}W Dolby Audio and ${os} with all major streaming apps.`,
          description: paragraph(
            rng,
            [
              `The ${brand.name} ${series} is a ${size}-inch ${panel} smart TV running ${os}, with Netflix, Prime Video, JioCinema and YouTube built in.`,
            ],
            [
              `A ${hz}Hz panel with HDR10 support keeps sport and fast action smooth and detailed.`,
              `${sound}W speakers with Dolby Audio fill a living room without a soundbar.`,
              'Three HDMI ports (one with eARC) and two USB ports connect consoles, set-top boxes and sound systems.',
              'Built-in Chromecast and screen mirroring put phone content on the big screen.',
              'Free standard installation is arranged after delivery.',
            ],
            3,
          ),
          highlights: [
            `${size}" ${panel}`,
            `${hz}Hz refresh rate`,
            `${sound}W Dolby Audio`,
            `${os} smart platform`,
            '3 HDMI | 2 USB',
          ],
          specifications: [
            spec('Screen Size', `${cm} cm (${size} inch)`),
            spec('Display Type', panel),
            spec('Resolution', size === 32 ? '1366 x 768' : '3840 x 2160'),
            spec('Refresh Rate', `${hz} Hz`),
            spec('Smart Platform', os),
            spec('Sound Output', `${sound} W`),
            spec('Ports', '3 HDMI, 2 USB, Ethernet, Optical'),
            spec('Warranty', `${rng.pick([1, 2])} year comprehensive warranty`),
          ],
          tags: ['tv', 'television', 'smart tv', `${size} inch tv`, panel.toLowerCase()],
        };
      },
    },
    {
      key: 'cameras',
      name: 'Cameras',
      code: 'CAM',
      weight: 4,
      images: 'cameras',
      brands: brands(
        ['Canon', 'mid', 3],
        ['Nikon', 'mid', 2],
        ['Sony', 'premium', 3],
        ['Fujifilm', 'mid', 2],
        ['GoPro', 'mid', 1],
      ),
      discount: [0.05, 0.25],
      stockScale: 15,
      lowStockThreshold: 3,
      build({ rng, brand }) {
        const lines: Record<string, string[]> = {
          Canon: ['EOS R50', 'EOS R10', 'EOS 200D II', 'EOS R8'],
          Nikon: ['Z50', 'Z fc', 'D7500', 'Z30'],
          Sony: ['Alpha ZV-E10', 'Alpha 6400', 'Alpha 7 IV', 'ZV-1F'],
          Fujifilm: ['X-T30 II', 'X-S20', 'Instax Mini 12'],
          GoPro: ['HERO12 Black', 'HERO13 Black'],
        };
        const line = rng.pick(lines[brand.name]!);
        const instant = line.includes('Instax');
        const action = brand.name === 'GoPro';
        const mp = instant ? 0 : rng.pick([20.9, 24.1, 24.2, 26.1, 33]);
        const kit =
          instant || action
            ? ''
            : rng.pick([
                '18-45mm',
                '18-55mm',
                '16-50mm',
                '15-45mm',
                '28-70mm',
                '18-55mm + 55-250mm Twin',
              ]);
        const body = instant ? '' : rng.pick(['Black', 'Black', 'Silver', 'White']);
        const mrp = instant
          ? 7999
          : action
            ? 41000
            : byTier(brand.tier, 45000, 62000, 120000) * rng.float(0.85, 1.25);
        const type = instant ? 'Instant Camera' : action ? 'Action Camera' : 'Mirrorless Camera';
        return {
          name: `${brand.name} ${line} ${type}${kit ? ` with ${kit} Lens Kit` : ''} (${instant ? rng.pick(['Pastel Blue', 'Blossom Pink', 'Clay White', 'Mint Green']) : body})`,
          mrp,
          shortDescription: instant
            ? 'Point, shoot and print credit-card-sized photos in seconds.'
            : `${mp ? `${mp}MP sensor, ` : ''}4K video and fast autofocus${kit ? `, bundled with a ${kit} lens` : ''}.`,
          description: paragraph(
            rng,
            [
              instant
                ? `The ${brand.name} ${line} prints instant photos with automatic exposure, so every shot comes out right.`
                : `The ${brand.name} ${line} is a ${type.toLowerCase()} built for creators who want more than a phone can give.`,
            ],
            instant
              ? [
                  'A close-up mode handles selfies and detail shots.',
                  'Runs on two AA batteries for about 100 shots.',
                  'Film packs are sold separately.',
                ]
              : [
                  mp
                    ? `Its ${mp}MP sensor captures rich colour and clean high-ISO shots.`
                    : 'HyperSmooth stabilisation keeps footage steady without a gimbal.',
                  '4K video recording with clean HDMI output suits YouTube and vlogging.',
                  'Eye and subject-detection autofocus locks on to people, animals and vehicles.',
                  'A vari-angle touchscreen makes framing from awkward angles easy.',
                  'Wi-Fi and Bluetooth transfer photos straight to your phone.',
                ],
            3,
          ),
          highlights: instant
            ? ['Instant prints', 'Automatic exposure', 'Selfie mirror']
            : [
                mp ? `${mp}MP sensor` : '5.3K video',
                '4K video',
                'Fast hybrid autofocus',
                ...(kit ? [`${kit} kit lens`] : []),
              ],
          specifications: [
            spec('Camera Type', type),
            ...(mp ? [spec('Effective Pixels', `${mp} MP`)] : []),
            ...(kit ? [spec('Lens', kit)] : []),
            spec('Video', instant ? 'No' : action ? '5.3K60, 4K120' : '4K 30p'),
            spec('Connectivity', instant ? 'None' : 'Wi-Fi, Bluetooth, USB Type-C'),
            spec('Warranty', '2 year manufacturer warranty'),
          ],
          tags: [
            'camera',
            type.toLowerCase(),
            ...(instant ? ['instax', 'polaroid'] : ['photography', 'vlogging']),
          ],
        };
      },
    },
    {
      key: 'computer accessories',
      name: 'Computer & Gaming Accessories',
      code: 'ACC',
      weight: 8,
      images: 'keyboards',
      brands: brands(
        ['Logitech', 'mid', 4],
        ['HP', 'budget', 2],
        ['Zebronics', 'budget', 3],
        ['Redgear', 'budget', 2],
        ['Cosmic Byte', 'budget', 2],
        ['Sony', 'premium', 1],
        ['Anker', 'mid', 2],
        ['Portronics', 'budget', 2],
      ),
      discount: [0.1, 0.6],
      stockScale: 140,
      build({ rng, brand }) {
        const kinds = [
          { type: 'Wireless Mouse', pool: 'mice', base: 899 },
          { type: 'Gaming Mouse', pool: 'mice', base: 1999 },
          { type: 'Mechanical Gaming Keyboard', pool: 'keyboards', base: 3499 },
          { type: 'Wireless Keyboard and Mouse Combo', pool: 'keyboards', base: 1999 },
          { type: 'Wireless Gamepad', pool: 'gamepads', base: 2499 },
          { type: 'GaN Fast Charger', pool: 'chargers', base: 1999 },
        ] as const;
        const kind =
          brand.name === 'Sony'
            ? kinds[4]
            : brand.name === 'Anker' || brand.name === 'Portronics'
              ? rng.pick([kinds[5], kinds[0]])
              : rng.pick(kinds.slice(0, 5));
        const model = `${rng.pick(['MX', 'G', 'K', 'Pro', 'Zeb', 'Nano', 'Volt', 'Hyper'])} ${rng.int(1, 9)}${rng.int(0, 9)}${rng.pick(['0', '5', 'S', 'X', ''])}`;
        const color = rng.pick(['Black', 'Graphite', 'White', 'Pale Grey', 'Blue']);
        const detail =
          kind.pool === 'mice'
            ? `${rng.pick([1600, 4000, 8000, 12000, 25600])} DPI`
            : kind.pool === 'keyboards'
              ? rng.pick([
                  'Blue switches',
                  'Red switches',
                  'Brown switches',
                  'Silent membrane keys',
                ])
              : kind.pool === 'gamepads'
                ? rng.pick(['PC & Android compatible', 'PS5 compatible', 'Bluetooth & 2.4GHz'])
                : `${rng.pick([33, 45, 65, 100])}W USB-C PD`;
        const mrp = kind.base * byTier(brand.tier, 0.8, 1.2, 2.6) * rng.float(0.85, 1.2);
        return {
          name: `${brand.name} ${model} ${kind.type} (${detail}, ${color})`,
          mrp,
          shortDescription: `${kind.type} with ${detail.toLowerCase()} — plug in or pair and go.`,
          description: paragraph(
            rng,
            [
              `The ${brand.name} ${model} is a ${kind.type.toLowerCase()} with ${detail.toLowerCase()}.`,
            ],
            [
              'Plug-and-play setup on Windows, macOS, ChromeOS and Android.',
              'A durable build rated for millions of clicks or cycles.',
              'Low-latency 2.4GHz wireless with a nano receiver that stores inside the device.',
              'Compact enough to carry between home and office every day.',
              'Backed by a hassle-free replacement warranty.',
            ],
            3,
          ),
          highlights: [kind.type, detail, 'Plug and play', `${rng.pick([1, 2])} year warranty`],
          specifications: [
            spec('Type', kind.type),
            spec('Key Feature', detail),
            spec(
              'Connectivity',
              kind.pool === 'chargers'
                ? 'USB Type-C'
                : rng.pick(['2.4GHz wireless', 'Bluetooth + 2.4GHz', 'Wired USB']),
            ),
            spec('Compatibility', 'Windows, macOS, Android'),
            spec('Colour', color),
            spec('Warranty', WARRANTY),
          ],
          tags: [
            'computer accessories',
            kind.type.toLowerCase(),
            ...(kind.type.includes('Gaming') || kind.pool === 'gamepads' ? ['gaming'] : []),
          ],
          images: kind.pool,
        };
      },
    },
  ],
};
