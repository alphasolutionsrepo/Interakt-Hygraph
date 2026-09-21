import type { AuthorSeed, CategorySeed } from "./types";

/**
 * Categories. The first eight slugs already exist in Hygraph from the original
 * playground content — they are upserted, not duplicated, so their existing
 * product links survive.
 */
export const categories: CategorySeed[] = [
  {
    slug: "shoes",
    name: "Footwear",
    excerpt: "Trail runners, approach shoes and hiking boots built for long days on rough ground.",
    description: [
      "Footwear is the one piece of kit that has to fit you specifically. A pack that is slightly wrong is an annoyance; a shoe that is slightly wrong ends the trip.",
      "We stock three broad shapes. Trail runners for speed and drainage, approach shoes for scrambling and rock contact, and boots for load carrying and cold ground.",
      "Every model here is listed with its real stack height, drop and last width, because those three numbers predict comfort far better than a size label does.",
    ],
    es: {
      name: "Calzado",
      excerpt: "Zapatillas de trail, de aproximación y botas de montaña para jornadas largas.",
    },
  },
  {
    slug: "chancletas",
    name: "Camp Slippers",
    excerpt: "Packable down booties and recovery sandals for the end of the day.",
    description: [
      "Camp footwear is a small luxury that pays for itself. Getting out of wet boots restores circulation, dries your feet and prevents the blisters that show up on day three.",
      "Down booties weigh almost nothing and pack to the size of a fist. Recovery sandals are heavier but can be worn on short water crossings and around town.",
    ],
    es: {
      name: "Calzado de campamento",
      excerpt: "Botines de plumón y sandalias de recuperación para el final del día.",
    },
  },
  {
    slug: "sportswear",
    name: "Active",
    excerpt: "Breathable layers for running, fastpacking and high-output days.",
    description: [
      "High-output clothing has one job: move moisture away from you faster than you produce it. Everything in this category is chosen for breathability first and weather resistance second.",
      "If you are moving hard and staying warm through effort, you want less insulation than you think and more ventilation than most brands build in.",
    ],
    es: {
      name: "Deportivo",
      excerpt: "Capas transpirables para correr, fastpacking y días de alta intensidad.",
    },
  },
  {
    slug: "urban",
    name: "Everyday",
    excerpt: "Technical fabrics cut for the commute, the cafe and the airport.",
    description: [
      "Not every waterproof needs taped seams and a helmet-compatible hood. This category is the quieter end of the range: the same fabrics, cut so they do not look like expedition kit.",
      "Muted colours, fewer pockets, hems that sit properly under a bag strap.",
    ],
    es: {
      name: "Diario",
      excerpt: "Tejidos técnicos cortados para el día a día.",
    },
  },
  {
    slug: "new-arrival",
    name: "New Arrivals",
    excerpt: "The most recent additions to the Meridian range.",
    description: [
      "Everything that has landed in the last eight weeks, including restocks of pieces that sold out over the winter.",
    ],
    es: { name: "Novedades", excerpt: "Las incorporaciones más recientes a la gama Meridian." },
  },
  {
    slug: "decor",
    name: "Home & Basecamp",
    excerpt: "Blankets, lanterns and enamelware for the cabin, the van and the back garden.",
    description: [
      "The gear that does not go in the pack but makes the trip. Wool blankets that survive a campfire, lanterns that run on the same batteries as your headtorch, enamelware that does not chip when it falls off a tailgate.",
    ],
    es: {
      name: "Hogar y campamento",
      excerpt: "Mantas, faroles y menaje esmaltado para la cabaña y la furgoneta.",
    },
  },
  {
    slug: "accessories",
    name: "Accessories",
    excerpt: "Gloves, caps, belts, dry bags and the small things that get forgotten.",
    description: [
      "Small items, disproportionate consequences. A pair of liner gloves weighs 40 grams and is the difference between usable hands and useless ones at a windy summit.",
    ],
    es: {
      name: "Accesorios",
      excerpt: "Guantes, gorras, cinturones, bolsas estancas y lo que siempre se olvida.",
    },
  },
  {
    slug: "clothes",
    name: "Apparel",
    excerpt: "Shirts, trousers, fleece and everything worn between skin and shell.",
    description: [
      "The middle of the layering system, where most people over-buy. Two well-chosen mid layers cover more conditions than five specialised ones.",
    ],
    es: { name: "Ropa", excerpt: "Camisas, pantalones, forros y todo lo que va entre piel y capa exterior." },
  },
  {
    slug: "jackets",
    name: "Shells & Insulation",
    excerpt: "Hardshells, windshells, down and synthetic insulation rated by real-world use.",
    description: [
      "A shell keeps weather out. Insulation keeps heat in. Confusing the two is the most common and most expensive mistake in outdoor clothing.",
      "Hardshells are rated by hydrostatic head and breathability. Anything above 20,000mm is genuinely stormproof; below 10,000mm is a shower shell, whatever the marketing says.",
      "For insulation, the number that matters is fill power for down and fabric weight in grams per square metre for synthetic. Down is lighter and packs smaller; synthetic keeps insulating when wet.",
    ],
    es: {
      name: "Capas exteriores y aislamiento",
      excerpt: "Chaquetas impermeables, cortavientos, plumón y aislamiento sintético.",
    },
  },
  {
    slug: "base-layers",
    name: "Base Layers",
    excerpt: "Merino and synthetic next-to-skin layers in three weights.",
    description: [
      "Base layers are measured in grams per square metre. 150gsm for high output and warm conditions, 200gsm as a true all-rounder, 260gsm for cold and low activity.",
      "Merino resists odour and stays warm damp, but wears out faster. Synthetic dries quicker and lasts longer, but you will smell it by day two. Blends split the difference and are what most people should buy.",
    ],
    es: { name: "Primera capa", excerpt: "Capas de merino y sintéticas en tres gramajes." },
  },
  {
    slug: "trousers",
    name: "Trousers & Shorts",
    excerpt: "Softshell, stretch-woven and windproof legwear for four seasons.",
    description: [
      "Legwear gets less attention than it deserves. Most people are perfectly layered above the waist and wearing cotton below it.",
      "Stretch-woven fabrics handle three seasons. Softshell adds wind resistance and light water repellency for shoulder season. Full waterproof overtrousers stay in the pack until they are genuinely needed.",
    ],
    es: { name: "Pantalones", excerpt: "Softshell, tejidos elásticos y cortavientos para cuatro estaciones." },
  },
  {
    slug: "packs",
    name: "Packs",
    excerpt: "Daypacks, fastpacking vests and multi-day carries from 12 to 65 litres.",
    description: [
      "Pack volume is the least useful number on the label. Carry system, torso length and how the load sits against your back matter far more.",
      "As a rough guide: 12-20 litres for a day out, 25-35 for a long day or a hut trip, 40-50 for a weekend, 55-65 for a week or for winter kit.",
    ],
    es: { name: "Mochilas", excerpt: "Mochilas de día, chalecos de fastpacking y cargas de varios días." },
  },
  {
    slug: "headwear",
    name: "Headwear",
    excerpt: "Caps, beanies, sun hats and neck gaiters.",
    description: [
      "You lose a meaningful amount of heat through an uncovered head in cold wind, and gain a meaningful amount of sunburn through an uncovered neck in summer. Both problems weigh under 60 grams to solve.",
    ],
    es: { name: "Gorros y gorras", excerpt: "Gorras, gorros, sombreros de sol y bragas de cuello." },
  },
  {
    slug: "sleep-systems",
    name: "Sleep Systems",
    excerpt: "Bags, quilts and mats rated by comfort limit rather than survival limit.",
    description: [
      "Sleeping bag temperature ratings are widely misread. The 'comfort' rating is the one to use. The 'limit' rating means you will survive the night, not enjoy it.",
      "Your mat matters as much as your bag. R-value measures insulation from the ground, and ground steals more heat than air does. R-value 2 is summer, 4 is three-season, 5 and above is winter.",
    ],
    es: { name: "Descanso", excerpt: "Sacos, edredones y esterillas valorados por confort real." },
  },
];

export const authors: AuthorSeed[] = [
  {
    slug: "marta-vidal",
    name: "Marta Vidal",
    title: "Head of Product Testing",
    description: "Runs Meridian's field testing programme from the Pyrenees.",
    bio: [
      "Marta spent nine years as a mountain guide in the Pyrenees before joining Meridian to run product testing.",
      "She is responsible for the wear-testing programme, which means most new samples spend a winter in the Ordesa valley before anyone in the office sees a production version.",
      "She writes mainly about footwear fit, layering and the gap between lab ratings and what actually happens in weather.",
    ],
  },
  {
    slug: "joss-adeyemi",
    name: "Joss Adeyemi",
    title: "Senior Editor",
    description: "Writes the buying guides and long-form trail pieces.",
    bio: [
      "Joss came to Meridian from magazine publishing and is responsible for most of the buying guides on this site.",
      "His working rule is that a guide should help you not buy something as often as it helps you buy something.",
      "He has walked the Cape Wrath Trail twice, the second time in considerably better boots.",
    ],
  },
  {
    slug: "ines-kaufmann",
    name: "Ines Kaufmann",
    title: "Materials Lead",
    description: "Fabric sourcing, membranes and the repair programme.",
    bio: [
      "Ines is a textile engineer who joined Meridian to lead fabric sourcing and now also runs the repair programme.",
      "She is the reason our hardshells list hydrostatic head and breathability figures rather than a marketing tier name.",
      "She writes about membranes, durable water repellency, and why washing your waterproof more often makes it work better.",
    ],
  },
  {
    slug: "tomas-lindqvist",
    name: "Tomas Lindqvist",
    title: "Winter Category Manager",
    description: "Sleep systems, insulation and cold-weather kit.",
    bio: [
      "Tomas has spent twenty winters in northern Sweden and holds firm views about sleeping bag ratings.",
      "He manages the winter category and the sleep systems range, and is the internal authority on when down beats synthetic and when it emphatically does not.",
    ],
  },
  {
    slug: "priya-raman",
    name: "Priya Raman",
    title: "Fit and Sizing Specialist",
    description: "Builds the size charts and the fit guides.",
    bio: [
      "Priya builds Meridian's size charts from scan data rather than inherited industry blocks, which is why our sizing does not match the brand you wore last.",
      "She writes the sizing guides and handles the fit questions that come through customer support.",
    ],
  },
  {
    slug: "callum-shaw",
    name: "Callum Shaw",
    title: "Field Tester",
    description: "Fastpacking, trail running and lightweight setups.",
    bio: [
      "Callum tests the light end of the range: running vests, trail shoes, minimal shelters.",
      "He is a former ultrarunner who now covers the same ground more slowly and with better photographs.",
    ],
  },
];
