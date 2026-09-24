/**
 * Builds the Interakt documents from live Hygraph content.
 *
 * Lives in src/ rather than scripts/ so the reindex API route can call it
 * without pulling the seed corpus into the server bundle. The one thing it
 * needed from the seed data — which product family each variant belongs to — is
 * baked out to product-lines.json by `npm run interakt:sample`.
 */

import {
  articleToDocument,
  authorToDocument,
  faqToDocument,
  isIndexable,
  policyToDocument,
  postToDocument,
  productToDocument,
} from "./to-document";
import type { ContentDocument, ProductDocument } from "./types";
import { getIndexableContent, getIndexableProducts } from "@/hygraph/queries";
import productLines from "./product-lines.json";

export type BuiltDocuments = {
  products: ProductDocument[];
  content: ContentDocument[];
  /** Entries with no usable text, excluded from both indexes. */
  skipped: (ProductDocument | ContentDocument)[];
  counts: Record<string, number>;
};

export async function buildAllDocuments(siteUrl: string): Promise<BuiltDocuments> {
  const lines = productLines as Record<string, string>;

  const [rawProducts, content] = await Promise.all([
    getIndexableProducts(),
    getIndexableContent(),
  ]);

  const allProducts = rawProducts.map((p) =>
    productToDocument(p, siteUrl, lines[p.productSlug]),
  );

  const allContent: ContentDocument[] = [
    ...content.articles.map((a) => articleToDocument(a, siteUrl)),
    ...content.posts.map((p) => postToDocument(p, siteUrl)),
    ...content.faqs.map((f) => faqToDocument(f, siteUrl)),
    ...content.policies.map((p) => policyToDocument(p, siteUrl)),
    ...content.authors.map((a) => authorToDocument(a, siteUrl)),
  ];

  return {
    products: allProducts.filter(isIndexable),
    content: allContent.filter(isIndexable),
    skipped: [...allProducts, ...allContent].filter((d) => !isIndexable(d)),
    counts: {
      guides: content.articles.length,
      journal: content.posts.length,
      faqs: content.faqs.length,
      policies: content.policies.length,
      authors: content.authors.length,
    },
  };
}
