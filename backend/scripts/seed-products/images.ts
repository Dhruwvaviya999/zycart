import type { Rng } from './random';

/**
 * Product photography, from Unsplash.
 *
 * Every id below was checked twice before it was added: an HTTP request
 * confirmed it resolves to an image, and a contact sheet of thumbnails
 * confirmed it actually shows the thing its pool is named for. Ids are never
 * invented here — an id that is merely well-formed is a broken image on the
 * storefront.
 *
 * Unsplash is also the only third-party image host the storefront's
 * `next.config.ts` allows, so these render through `next/image` without any
 * configuration change.
 *
 * Pools are small, so images repeat across a large catalogue. That is the
 * honest trade-off of using real, working photos rather than placeholder
 * services; swapping in your own photography later is a data change.
 */
export const IMAGE_POOLS = {
  smartphones: [
    '1574944985070-8f3ebc6b79d2',
    '1565849904461-04a58ad377e0',
    '1598327105666-5b89351aff97',
    '1601784551446-20c9e07cdbdb',
    '1512499617640-c74ae3a79d37',
    '1580910051074-3eb694886505',
    '1567581935884-3349723552ca',
    '1585060544812-6b45742d762f',
    '1616348436168-de43ad0db179',
    '1511707171634-5f897ff02aa9',
    '1610945265064-0e34e5519bbf',
    '1592750475338-74b7b21085ab',
  ],
  laptops: [
    '1496181133206-80ce9b88a853',
    '1525547719571-a2d4ac8945e2',
    '1588872657578-7efd1f1555ed',
    '1603302576837-37561b2e2302',
    '1517336714731-489689fd1ca8',
    '1541807084-5c52b6b3adef',
    '1611186871348-b1ce696e52c9',
    '1593642632823-8f785ba67e45',
    '1531297484001-80022131f5a1',
    '1484788984921-03950022c9ef',
    '1498050108023-c5249f4df085',
  ],
  tablets: [
    '1544244015-0df4b3ffc6b0',
    '1561154464-82e9adf32764',
    '1589739900243-4b52cd9b104e',
    '1585790050230-5dd28404ccb9',
    '1542751110-97427bbecf20',
  ],
  headphones: [
    '1505740420928-5e560c06d30e',
    '1583394838336-acd977736f90',
    '1618366712010-f4ae9c647dcb',
    '1546435770-a3e426bf472b',
    '1484704849700-f032a568e944',
    '1613040809024-b4ef7ba99bc3',
  ],
  earbuds: [
    '1572569511254-d8f925fe2cbb',
    '1606220588913-b3aacb4d2f46',
    '1600294037681-c80b4cb5b434',
    '1590658268037-6bf12165a8df',
  ],
  smartwatches: [
    '1523275335684-37898b6baf30',
    '1579586337278-3befd40fd17a',
    '1546868871-7041f2a55e12',
    '1508685096489-7aacd43bd3b1',
    '1575311373937-040b8e1fd5b6',
    '1434493789847-2f02dc6ca35d',
    '1617043786394-f977fa12eddf',
  ],
  speakers: [
    '1608043152269-423dbba4e7e1',
    '1545454675-3531b543be5d',
    '1589003077984-894e133dabab',
    '1558089687-f282ffcbc126',
    '1543512214-318c7553f230',
    '1507646227500-4d389b0012be',
  ],
  televisions: [
    '1593359677879-a4bb92f829d1',
    '1593784991095-a205069470b6',
    '1461151304267-38535e780c79',
    '1567690187548-f07b1d7bf5a9',
  ],
  cameras: [
    '1526170375885-4d8ecf77b99f',
    '1502920917128-1aa500764cbd',
    '1516035069371-29a1b244cc32',
    '1617005082133-548c4dd27f35',
    '1510127034890-ba27508e9f1c',
    '1564466809058-bf4114d55352',
  ],
  keyboards: ['1587829741301-dc798b83add3', '1595225476474-87563907a212'],
  mice: ['1527864550417-7fd91fc51a46'],
  gamepads: ['1592840496694-26d035b52b48', '1606144042614-b2417e99c4e3'],
  chargers: ['1583863788434-e58a36330cf0'],
  tshirts: [
    '1618354691373-d851c5c3a990',
    '1521572163474-6864f9cf17ab',
    '1583743814966-8936f5b7be1a',
    '1576566588028-4147f3842f27',
    '1562157873-818bc0726f68',
    '1529374255404-311a2a4f1fd9',
    '1503341504253-dff4815485f1',
  ],
  shirts: [
    '1602810318383-e386cc2a3ccf',
    '1596755094514-f87e34085b2c',
    '1603252109303-2751441dd157',
    '1598033129183-c4f50c736f10',
    '1607345366928-199ea26cfe3e',
  ],
  jeans: [
    '1541099649105-f69ad21f3246',
    '1582552938357-32b906df40cb',
    '1604176354204-9268737828e4',
    '1475178626620-a4d074967452',
    '1542272604-787c3835535d',
    '1591195853828-11db59a44f6b',
  ],
  jackets: [
    '1551028719-00167b16eac5',
    '1544022613-e87ca75a784a',
    '1556821840-3a63f95609a7',
    '1578768079052-aa76e52ff62e',
    '1548126032-079a0fb0099d',
    '1591047139829-d91aecb6caea',
    '1620799140408-edc6dcb6d633',
  ],
  dresses: [
    '1595777457583-95e059d581b8',
    '1572804013309-59a88b7e92f1',
    '1539008835657-9e8e9680c956',
    '1515372039744-b8f02a3ae446',
    '1585487000160-6ebcfceb0d03',
    '1496747611176-843222e1e57c',
  ],
  sarees: ['1610030469983-98e550d6193c', '1617627143750-d86bc21e42bb'],
  kurtas: ['1583391733956-3750e0ff4e8b', '1597983073493-88cd35cf93b0'],
  runningShoes: [
    '1542291026-7eec264c27ff',
    '1491553895911-0055eca6402d',
    '1606107557195-0e29a4b5b4aa',
    '1600185365926-3a2ce3cdb9eb',
    '1539185441755-769473a23570',
    '1595341888016-a392ef81b7de',
  ],
  sneakers: [
    '1608231387042-66d1773070a5',
    '1549298916-b41d501d3772',
    '1525966222134-fcfa99b8ae77',
    '1595950653106-6c9ebd614d3a',
    '1460353581641-37baddab0fa2',
    '1514989940723-e8e51635b782',
    '1600269452121-4f2416e55c28',
    '1607522370275-f14206abe5d3',
    '1603808033192-082d6919d3e1',
  ],
  formalShoes: [
    '1560343090-f0409e92791a',
    '1449505278894-297fdb3edbc1',
    '1533867617858-e7b97e060509',
    '1614252235316-8c857d38b5f4',
  ],
  boots: ['1520639888713-7851133b1ed0', '1608256246200-53e635b5b65f', '1605812860427-4024433a70fd'],
  heelsSandals: [
    '1562273138-f46be4ebdf33',
    '1543163521-1bf539c55dd2',
    '1515347619252-60a4bf4fff4f',
  ],
  watches: [
    '1523170335258-f5ed11844a49',
    '1524592094714-0f0654e20314',
    '1542496658-e33a6d0d50f6',
    '1587836374828-4dbafa94cf0e',
    '1533139502658-0198f920d8e8',
    '1522312346375-d1a52e2b99b3',
  ],
  sunglasses: [
    '1508296695146-257a814070b4',
    '1572635196237-14b3f281503f',
    '1511499767150-a48a237f0083',
    '1577803645773-f96470509666',
  ],
  handbags: [
    '1584917865442-de89df76afd3',
    '1590874103328-eac38a683ce7',
    '1594223274512-ad4803739b7c',
    '1548036328-c9fa89d128fa',
    '1559563458-527698bf5295',
  ],
  backpacks: ['1553062407-98eeb64c6a62', '1622560480605-d83c853bc5c3'],
  wallets: ['1627123424574-724758594e93'],
  belts: ['1624222247344-550fb60583dc'],
  cookware: [
    '1590794056226-79ef3a8147e1',
    '1556910633-5099dc3971e8',
    '1556909212-d5b604d0c90d',
    '1556911220-bff31c812dba',
    '1593618998160-e34014e67546',
  ],
  drinkware: [
    '1602143407151-7111542de6e8',
    '1610701596007-11502861dcfa',
    '1514228742587-6b1558fcca3d',
    '1578749556568-bc2c40e68b61',
    '1603199506016-b9a594b593c0',
    '1595434091143-b375ced5fe5c',
  ],
  furniture: [
    '1555041469-a586c61ea9bc',
    '1586023492125-27b2c045efd7',
    '1513694203232-719a280e022f',
    '1503602642458-232111445657',
    '1567538096630-e0c55bd6374c',
    '1517705008128-361805f42e86',
    '1616627547584-bf28cee262db',
    '1578500494198-246f612d3b3d',
  ],
  bedding: [
    '1631049307264-da0ec9d70304',
    '1540518614846-7eded433c457',
    '1616594039964-ae9021a400a0',
    '1505693416388-ac5ce068fe85',
    '1522771739844-6a9f6d5f14af',
    '1584100936595-c0654b55a2e2',
  ],
  decor: [
    '1513506003901-1e6a229e2d15',
    '1507473885765-e6ed057f782c',
    '1540932239986-30128078f3c5',
    '1612196808214-b8e1d6145a8c',
  ],
  refrigerators: ['1571175443880-49e1d25b2bc5', '1584568694244-14fbdf83bd30'],
  washingMachines: [
    '1626806787461-102c1bfaaea1',
    '1610557892470-55d9e80c0bce',
    '1604335399105-a0c585fd81a1',
  ],
  microwaves: ['1585659722983-3a675dabf23d', '1574269909862-7e1d70bb8078'],
  mixers: ['1585515320310-259814833e62', '1585237672814-8f85a8118bf6'],
  kettlesCoffee: ['1594213114663-d94db9b17125', '1570222094114-d054a817e56b'],
  vacuums: ['1558317374-067fb5f30001', '1527515637462-cff94eecc1ac'],
  fans: ['1565151443833-29bf2ba5dd8d'],
  irons: ['1489274495757-95c7c837b101'],
  skincare: [
    '1571781926291-c477ebfd024b',
    '1556228720-195a672e8a03',
    '1631729371254-42c2892f0e6e',
    '1598440947619-2c35fc9aa908',
    '1612817288484-6f916006741a',
    '1608248543803-ba4f8c70ae0b',
    '1620916566398-39f1143ab7be',
    '1617897903246-719242758050',
    '1556229010-6c3f2c9ca5f8',
    '1625772452859-1c03d5bf1137',
  ],
  makeup: [
    '1596462502278-27bfdc403348',
    '1522335789203-aabd1fc54bc9',
    '1586495777744-4413f21062fa',
  ],
  fragrances: [
    '1585386959984-a4155224a1ad',
    '1541643600914-78b084683601',
    '1592945403244-b3fbafd7f539',
    '1523293182086-7651a899d37f',
    '1594035910387-fea47794261f',
  ],
  gymEquipment: [
    '1534438327276-14e5300c3a48',
    '1583454110551-21f2fa2afe61',
    '1584735935682-2f2b69dff9d2',
    '1576678927484-cc907957088c',
    '1556817411-31ae72fa3ea0',
    '1517836357463-d25dfeac3438',
  ],
  yoga: [
    '1601925260368-ae2f83cf8b7f',
    '1518611012118-696072aa579a',
    '1571019613454-1cb2f99b2d8b',
    '1599058917212-d750089bc07e',
  ],
  cricket: ['1531415074968-036ba1b575da', '1540747913346-19e32dc3e97e'],
  ballSports: [
    '1575361204480-aadea25e6e68',
    '1614632537190-23e4146777db',
    '1614632537423-1e6c2e7e0aab',
    '1546519638-68e109498ffc',
  ],
  racketSports: ['1626224583764-f87db24ac4ea', '1622279457486-62dcc4a431d6'],
  cycles: [
    '1485965120184-e220f721d03e',
    '1532298229144-0ec0c57515c7',
    '1576435728678-68d0fbf94e91',
    '1517649763962-0c623066013b',
  ],
} as const satisfies Record<string, readonly string[]>;

export type ImagePool = keyof typeof IMAGE_POOLS;

export const IMAGE_HOST = 'https://images.unsplash.com/';

/** The same parameters the hand-written seed uses, so both catalogues look alike. */
const fullUrl = (id: string): string => `${IMAGE_HOST}photo-${id}?auto=format&fit=crop&w=900&q=80`;

/**
 * A close-up of the same photograph, cropped by Unsplash's imgix focal-point
 * zoom. It reads as the "detail" shot every product page has, and it lets a
 * product from a small pool still carry more than one image without borrowing
 * a photo of something else.
 */
const detailUrl = (id: string, rng: Rng): string => {
  const x = rng.float(0.4, 0.6).toFixed(2);
  const y = rng.float(0.4, 0.6).toFixed(2);
  const zoom = rng.float(1.6, 2.2).toFixed(1);
  return `${IMAGE_HOST}photo-${id}?auto=format&fit=crop&crop=focalpoint&fp-x=${x}&fp-y=${y}&fp-z=${zoom}&w=900&q=80`;
};

/**
 * Two to four images for one product.
 *
 * The lead photo rotates through the pool by `ordinal` (the product's position
 * within its subcategory), so neighbouring cards on a listing do not all open
 * on the same picture. The rest are other photos from the same pool, and a
 * detail crop of the lead whenever the pool runs short.
 */
export function pickImages(pool: ImagePool, ordinal: number, rng: Rng): string[] {
  const ids: readonly string[] = IMAGE_POOLS[pool];
  const lead = ids[ordinal % ids.length]!;
  const others = rng.shuffle(ids.filter((id) => id !== lead));
  const wanted = rng.int(2, 4);

  const images = [fullUrl(lead)];
  for (const id of others) {
    if (images.length >= wanted - 1) break;
    images.push(fullUrl(id));
  }
  images.push(detailUrl(lead, rng));

  return images.slice(0, Math.max(2, wanted));
}
