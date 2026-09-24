/**
 * Shapes for the seed corpus.
 *
 * Every record carries a stable, hand-written `slug`. It is the natural key for
 * idempotent upserts, the URL segment on the site, and (in phase 2) the basis
 * for the Interakt document id. Never generate these randomly.
 *
 * Rich-text bodies are `string[]` of markdown-subset lines — see lib/richtext.ts.
 */

export type CategorySeed = {
  slug: string;
  name: string;
  excerpt: string;
  description: string[];
  /** Spanish translation of the short fields only. */
  es?: { name: string; excerpt: string };
};

export type AuthorSeed = {
  slug: string;
  name: string;
  title: string;
  description: string;
  bio: string[];
};

export type ProductVariantSeed =
  | { kind: "Clothing"; size: string; color: string }
  | { kind: "Shoe"; size: string; color: string }
  | { kind: "Accessory"; color: string }
  | { kind: "Decor"; color: string };

export type ProductSeed = {
  slug: string;
  name: string;
  /** Image pool key — the product family, so photos match the subject. */
  imagePool: string;
  brand: string;
  sku: string;
  price: number;
  categories: string[];
  tags: string[];
  material: string;
  rating: number;
  reviewCount: number;
  inStock: boolean;
  shortDescription: string;
  description: string[];
  variant?: ProductVariantSeed;
  seo: { title: string; description: string };
  es?: { name: string; shortDescription: string };
};

export type ArticleSeed = {
  slug: string;
  title: string;
  articleType:
    | "BUYING_GUIDE"
    | "HOW_TO"
    | "GEAR_REVIEW"
    | "TRAIL_STORY"
    | "SIZING_GUIDE"
    | "CARE_AND_REPAIR"
    | "NEWS";
  excerpt: string;
  author: string;
  postDate: string;
  readingTime: number;
  tags: string[];
  body: string[];
  featuredProducts?: string[];
  es?: { title: string; excerpt: string };
};

/** Long-form editorial that lives on BlogPost rather than Article. */
export type BlogPostSeed = {
  slug: string;
  title: string;
  excerpt: string;
  author: string;
  postDate: string;
  readingTime: number;
  tags: string[];
  body: string[];
  es?: { title: string; excerpt: string };
};

export type FaqSeed = {
  slug: string;
  question: string;
  category:
    | "SHIPPING"
    | "RETURNS"
    | "SIZING"
    | "PAYMENTS"
    | "PRODUCT_CARE"
    | "WARRANTY"
    | "ACCOUNT"
    | "SUSTAINABILITY";
  sortOrder: number;
  answer: string[];
  es?: { question: string };
};

export type PolicySeed = {
  slug: string;
  title: string;
  summary: string;
  effectiveDate: string;
  body: string[];
  es?: { title: string; summary: string };
};
