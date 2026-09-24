/**
 * Hygraph webhook: turning an intent into an Interakt document.
 *
 * Split from webhook-intent.ts, which holds the pure signature/intent logic and
 * must stay importable in tests without any credentials.
 */

import {
  getIndexableArticleById,
  getIndexableAuthorById,
  getIndexableFaqById,
  getIndexablePolicyById,
  getIndexablePostById,
  getIndexableProductById,
} from "@/hygraph/queries";
import {
  articleToDocument,
  authorToDocument,
  faqToDocument,
  isIndexable,
  policyToDocument,
  postToDocument,
  productToDocument,
} from "./to-document";
import type { InteraktDocument } from "./types";
import productLines from "./product-lines.json";

export * from "./webhook-intent";
export { isIndexable };

/**
 * Refetches the entry and maps it, using the same field selection and mapper as
 * the backfill — so an incrementally-updated document is byte-identical to the
 * one a full re-feed would produce.
 */
export async function buildDocumentFor(
  typename: string,
  entryId: string,
  siteUrl: string,
): Promise<InteraktDocument | null> {
  const lines = productLines as Record<string, string>;

  switch (typename) {
    case "Product": {
      const entry = await getIndexableProductById(entryId);
      return entry ? productToDocument(entry, siteUrl, lines[entry.productSlug]) : null;
    }
    case "Article": {
      const entry = await getIndexableArticleById(entryId);
      return entry ? articleToDocument(entry, siteUrl) : null;
    }
    case "BlogPost": {
      const entry = await getIndexablePostById(entryId);
      return entry ? postToDocument(entry, siteUrl) : null;
    }
    case "FaqItem": {
      const entry = await getIndexableFaqById(entryId);
      return entry ? faqToDocument(entry, siteUrl) : null;
    }
    case "PolicyPage": {
      const entry = await getIndexablePolicyById(entryId);
      return entry ? policyToDocument(entry, siteUrl) : null;
    }
    case "Author": {
      const entry = await getIndexableAuthorById(entryId);
      return entry ? authorToDocument(entry, siteUrl) : null;
    }
    default:
      return null;
  }
}
