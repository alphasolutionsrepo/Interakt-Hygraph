/**
 * Document shapes for the two Interakt indexes.
 *
 * Hard constraints these shapes exist to satisfy, all read from the Interakt
 * backend rather than its docs:
 *
 *  - **Completely flat.** The Configure Mappings inference walks nested objects
 *    into dotted field names (`author.name`), and Elasticsearch rejects a mapping
 *    property containing a dot. Nothing sanitises it, so the index simply fails
 *    to create. Arrays therefore hold primitives only — an array of objects is
 *    typed `json` and never descended.
 *  - **Shared spine across BOTH indexes.** A Search Experience has one
 *    `displayConfig`, and `resolveField()` takes the first field matching a role
 *    for the whole experience. Two indexes does not buy two card shapes, so
 *    products and content must agree on `title`, `description`, `imageUrl`, `url`.
 *  - **Namespaced `uniqueId`.** Multi-index results are fused with RRF, which
 *    dedupes on the document id. `product:<id>` / `guide:<id>` guarantees a
 *    product and a guide can never collapse into one hit.
 *  - **Integers only** for numeric fields. The app type `number` maps to ES
 *    `integer`, so 4.2 would silently truncate to 4.
 */

export type DocType = "product" | "guide" | "journal" | "faq" | "policy" | "author";

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  product: "Product",
  guide: "Guide",
  journal: "Journal",
  faq: "Help",
  policy: "Policy",
  author: "Author",
};

/** Carried by every document in both indexes, with identical field names. */
export type DocumentSpine = {
  uniqueId: string;
  docType: DocType;
  docTypeLabel: string;
  title: string;
  description: string;
  /** Full prose, and the only field marked isVectorSource. */
  body: string;
  url: string;
  imageUrl?: string;
  imageAlt?: string;
  tags?: string[];
  updatedAt?: string;
  publishedAt?: string;
};

export type ProductDocument = DocumentSpine & {
  docType: "product";
  brand?: string;
  /** Family name, so the five variants of one product group together. */
  productLine?: string;
  variantName?: string;
  sku?: string;
  /** Whole USD — see the integer note above. */
  price?: number;
  currency?: string;
  inStock?: boolean;
  /** Rounded to a whole star. */
  rating?: number;
  reviewCount?: number;
  material?: string;
  categories?: string[];
  size?: string;
  color?: string;
};

export type ContentDocument = DocumentSpine & {
  docType: Exclude<DocType, "product">;
  /** One facet spanning guides, FAQs and policies: "Buying guide", "Shipping"… */
  contentType?: string;
  author?: string;
  authorTitle?: string;
  readingTime?: number;
  relatedProducts?: string[];
};

export type InteraktDocument = ProductDocument | ContentDocument;

/**
 * Names Interakt reserves. `uniqueId` is ours to set (it becomes the provider
 * `_id`); the rest must never appear in a payload.
 */
export const RESERVED_FIELD_NAMES = [
  "additionalData",
  "customFields",
  "content_embedding",
  "_id",
  "_indexId",
  "_indexName",
] as const;

/** Drops undefined, null and empty arrays. Keeps "" and 0. */
export function compact<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => {
      if (v === undefined || v === null) return false;
      if (Array.isArray(v) && v.length === 0) return false;
      return true;
    }),
  ) as T;
}
