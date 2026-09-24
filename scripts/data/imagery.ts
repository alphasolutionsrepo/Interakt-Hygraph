/**
 * Topical imagery.
 *
 * The first cut of this seed pulled 40 arbitrary photos from picsum.photos and
 * handed them out round-robin, so a down jacket was as likely to show a car park
 * as a jacket. Photos are now searched per subject on Unsplash and uploaded by
 * scripts/import-images.ts.
 *
 * A previous attempt used loremflickr, whose URL-based API needs no key. It does
 * not survive volume: asked for 134 images it answers most requests with a single
 * generated placeholder, and throttling our own submissions does not help because
 * Hygraph fetches the URLs on its own schedule. Hence a real API with a key.
 *
 * Each unique `keyword` costs one Unsplash search, and the free tier allows 50
 * per hour — so keywords are deliberately shared between pools where the subject
 * is the same. Pools sharing a keyword still get DIFFERENT photos from the one
 * result set.
 */

export type ImagePool = {
  /** Stable pool id, also the filename stem in Hygraph. */
  key: string;
  /** Unsplash search term. Shared between pools to conserve API calls. */
  keyword: string;
  /** How many distinct photos to fetch for this pool. */
  count: number;
};

/**
 * Fresh prefix per import generation. `seed-meridian-` was the original picsum
 * set and `meridian-` the abandoned loremflickr one; both are superseded and
 * can be deleted once the token has delete permission on Asset.
 */
export const ASSET_PREFIX = "img-";

/** One pool per product family — the key matches the family key in products.ts. */
export const productPools: ImagePool[] = [
  { key: "alpine-shell", keyword: "rain jacket", count: 3 },
  { key: "kestrel-windshell", keyword: "windbreaker", count: 3 },
  { key: "fenn-down-hoody", keyword: "down jacket", count: 3 },
  { key: "ridge-synthetic", keyword: "puffer jacket", count: 3 },
  { key: "harbor-raincoat", keyword: "rain jacket", count: 3 },
  { key: "crag-softshell", keyword: "softshell jacket", count: 3 },
  { key: "tessa-merino-crew", keyword: "merino wool shirt", count: 3 },
  { key: "tessa-merino-legging", keyword: "leggings", count: 3 },
  { key: "pulse-synthetic-tee", keyword: "sports tshirt", count: 3 },
  { key: "alder-grid-fleece", keyword: "fleece jacket", count: 3 },
  { key: "bothy-wool-shirt", keyword: "flannel shirt", count: 3 },
  { key: "vantage-trouser", keyword: "hiking pants", count: 3 },
  { key: "scree-softshell-trouser", keyword: "hiking pants", count: 3 },
  { key: "squall-overtrouser", keyword: "rain pants", count: 3 },
  { key: "northfell-trail-runner", keyword: "trail running shoes", count: 3 },
  { key: "northfell-gtx-boot", keyword: "hiking boots", count: 3 },
  { key: "scarp-approach-shoe", keyword: "climbing shoes", count: 3 },
  { key: "tarn-waterproof-mid", keyword: "hiking boots", count: 3 },
  { key: "cinder-sneaker", keyword: "sneakers", count: 3 },
  { key: "ember-down-bootie", keyword: "slippers", count: 3 },
  { key: "eddy-recovery-sandal", keyword: "sandals", count: 3 },
  { key: "cairn-daypack", keyword: "daypack", count: 3 },
  { key: "cairn-trek-pack", keyword: "backpack", count: 3 },
  { key: "skimmer-vest", keyword: "running vest", count: 3 },
  { key: "brim-sun-hat", keyword: "sun hat", count: 3 },
  { key: "lumen-beanie", keyword: "beanie", count: 3 },
  { key: "grip-liner-glove", keyword: "gloves", count: 3 },
  { key: "tarn-quilt", keyword: "sleeping bag", count: 3 },
  { key: "loft-sleeping-mat", keyword: "camping mat", count: 3 },
  { key: "hearth-wool-blanket", keyword: "wool blanket", count: 3 },
];

/** One hero per category. Keyed `cat-<slug>`. */
export const categoryPools: ImagePool[] = [
  { key: "cat-shoes", keyword: "hiking boots", count: 1 },
  { key: "cat-chancletas", keyword: "slippers", count: 1 },
  { key: "cat-sportswear", keyword: "trail running", count: 1 },
  { key: "cat-urban", keyword: "city street style", count: 1 },
  { key: "cat-new-arrival", keyword: "outdoor gear", count: 1 },
  { key: "cat-decor", keyword: "cabin interior", count: 1 },
  { key: "cat-accessories", keyword: "gloves", count: 1 },
  { key: "cat-clothes", keyword: "clothing rail", count: 1 },
  { key: "cat-jackets", keyword: "rain jacket", count: 1 },
  { key: "cat-base-layers", keyword: "merino wool shirt", count: 1 },
  { key: "cat-trousers", keyword: "hiking pants", count: 1 },
  { key: "cat-packs", keyword: "backpack", count: 1 },
  { key: "cat-headwear", keyword: "beanie", count: 1 },
  { key: "cat-sleep-systems", keyword: "tent camping", count: 1 },
];

/** Editorial imagery, chosen per article from its tags. */
export const editorialPools: ImagePool[] = [
  { key: "ed-mountain-hiking", keyword: "mountain hiking", count: 3 },
  { key: "ed-camping", keyword: "camping tent", count: 3 },
  { key: "ed-trail-running", keyword: "trail running", count: 3 },
  { key: "ed-climbing", keyword: "rock climbing", count: 2 },
  { key: "ed-winter", keyword: "winter mountains", count: 3 },
  { key: "ed-forest", keyword: "forest trail", count: 2 },
  { key: "ed-gear", keyword: "hiking gear", count: 3 },
  { key: "ed-repair", keyword: "sewing repair", count: 2 },
  { key: "ed-wool", keyword: "wool yarn", count: 2 },
  { key: "ed-factory", keyword: "textile factory", count: 2 },
  { key: "ed-coast", keyword: "coastal mountains", count: 3 },
  { key: "ed-navigation", keyword: "map compass", count: 2 },
];

export const allPools: ImagePool[] = [...productPools, ...categoryPools, ...editorialPools];

/**
 * Tag -> editorial pool, checked in order, so the more specific subjects win
 * before the generic hiking fallback.
 */
const TAG_POOLS: [string[], string][] = [
  [["winter", "snow", "cold-weather"], "ed-winter"],
  [["trail-running", "running", "fastpacking", "ultralight"], "ed-trail-running"],
  [["climbing", "approach", "scrambling"], "ed-climbing"],
  [
    ["camping", "tents", "sleeping-bags", "sleep-systems", "sleeping-mats", "quilts", "r-value", "dry-bags", "rain"],
    "ed-camping",
  ],
  [
    ["repair", "field-repair", "care", "dwr", "washing", "durability", "failure-modes", "pfc-free"],
    "ed-repair",
  ],
  [["merino", "wool", "sourcing", "base-layers"], "ed-wool"],
  [
    ["manufacturing", "supply-chain", "ethics", "process", "data", "pricing", "business", "transparency", "operations", "inventory", "retrospective"],
    "ed-factory",
  ],
  [
    ["trail-story", "scotland", "norway", "lofoten", "dolomites", "sweden", "kungsleden", "cape-wrath", "hut-to-hut", "alta-via", "autumn", "spring"],
    "ed-coast",
  ],
  [["navigation", "compass", "weather", "planning", "safety", "skills"], "ed-navigation"],
  [["footwear", "boots", "socks", "blisters", "sizing", "fit", "fitting", "leather"], "ed-gear"],
  [["forest", "day-walk", "technique", "beginner", "training"], "ed-forest"],
];

export function poolForTags(tags: string[]): string {
  for (const [needles, pool] of TAG_POOLS) {
    if (tags.some((tag) => needles.includes(tag))) return pool;
  }
  return "ed-mountain-hiking";
}

export function poolForCategory(slug: string): string {
  return `cat-${slug}`;
}

export function fileNameFor(poolKey: string, index: number): string {
  return `${ASSET_PREFIX}${poolKey}-${String(index).padStart(2, "0")}.jpg`;
}
