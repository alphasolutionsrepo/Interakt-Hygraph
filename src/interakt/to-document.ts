/**
 * Hygraph entries -> flat Interakt documents.
 *
 * Every model gets normalised onto the same spine (`title`, `description`,
 * `body`, `url`, `imageUrl`) because a Search Experience has a single
 * `displayConfig` with one field per display role — shared naming is what makes
 * heterogeneous results render as sensible cards.
 *
 * URLs come from `pathFor()` in src/hygraph/routes.ts, the same function the
 * site's own links use, so the index can never point at a route that moved.
 */

import { pathFor } from "@/hygraph/routes";
import {
  DOC_TYPE_LABELS,
  compact,
  type ContentDocument,
  type ProductDocument,
} from "./types";
import type {
  IndexableArticle,
  IndexableAuthor,
  IndexableFaq,
  IndexablePolicy,
  IndexablePost,
  IndexableProduct,
} from "@/hygraph/queries";

const trimSlash = (url: string) => url.replace(/\/$/, "");

/** SHIPPING -> Shipping, BUYING_GUIDE -> Buying guide. */
export function humaniseEnum(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase().replace(/_/g, " ");
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Size_42 -> EU 42; clothing sizes pass through unchanged. */
function readableSize(size: string | null | undefined): string | undefined {
  if (!size) return undefined;
  return size.replace(/^Size_/, "EU ");
}

/**
 * Hygraph's rich-text `.text` returns the literal two-character sequence \n
 * rather than a real newline. Left alone, an indexed body reads
 * "work.\nHow the grid works" in a search snippet and feeds those artifacts
 * straight into the embedding.
 */
function plain(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  return text
    .replace(/\\r\\n|\\n|\\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Joins the lede, the prose and any extra signal into the single field the
 * embedding is built from. The description is deliberately repeated as the first
 * paragraph so the vector always sees the summary.
 */
function buildBody(parts: (string | null | undefined)[]): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join("\n\n").trim();
}

/**
 * Width of the image URL written into the index.
 *
 * Hygraph serves transformed assets by inserting a transform segment between the
 * environment token and the asset handle. The raw asset is 1600x1200 and ~320KB,
 * which the chat widget renders at full size because it lives in a shadow root
 * the site cannot style. At 300px wide the same image is ~15KB.
 */
const INDEX_IMAGE_WIDTH = 300;

/**
 * Idempotent: a URL that already carries a transform has three path segments and
 * will not match, so re-running the mapper never double-wraps it.
 */
function resized(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.replace(
    /^(https:\/\/[^/]+\/[^/]+)\/([^/]+)$/,
    `$1/resize=width:${INDEX_IMAGE_WIDTH}/$2`,
  );
}

/** Numeric fields must be integers: the app type `number` maps to ES `integer`. */
const asInt = (n: number | null | undefined): number | undefined =>
  typeof n === "number" && Number.isFinite(n) ? Math.round(n) : undefined;

export function productToDocument(
  product: IndexableProduct,
  siteUrl: string,
  productLine?: string,
): ProductDocument {
  const variant = product.productVariant?.productType;
  const size = readableSize(variant?.shoeSize ?? variant?.clothingSize);
  const color =
    variant?.shoeColor ??
    variant?.clothingColor ??
    variant?.accessoryColor ??
    variant?.decorColor ??
    undefined;

  const image = product.productImage?.[0];
  const categories = product.productCategories.map((c) => c.categoryName);

  // Spec details are real query signal ("which one is leather?"), so they go
  // into the indexed prose rather than being left as facets only.
  const specs = [
    product.material ? `Material: ${product.material}.` : "",
    size ? `Size: ${size}.` : "",
    color ? `Colour: ${color}.` : "",
    categories.length ? `Category: ${categories.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return compact({
    uniqueId: `product:${product.id}`,
    docType: "product",
    docTypeLabel: DOC_TYPE_LABELS.product,
    title: product.productName,
    description: product.shortDescription ?? "",
    body: buildBody([product.shortDescription, plain(product.productDescription?.text), specs]),
    url: `${trimSlash(siteUrl)}${pathFor("product", product.productSlug)}`,
    imageUrl: resized(image?.url),
    imageAlt: image?.altText ?? undefined,
    tags: product.tags,
    brand: product.brand ?? undefined,
    productLine,
    variantName:
      productLine && product.productName.startsWith(productLine)
        ? product.productName.slice(productLine.length).trim() || undefined
        : undefined,
    sku: product.sku ?? undefined,
    price: asInt(product.productPrice),
    currency: "USD",
    inStock: product.inStock ?? undefined,
    rating: asInt(product.rating),
    reviewCount: asInt(product.reviewCount),
    material: product.material ?? undefined,
    categories,
    size,
    color,
    updatedAt: product.updatedAt ?? undefined,
    publishedAt: product.publishedAt ?? undefined,
  }) as ProductDocument;
}

export function articleToDocument(article: IndexableArticle, siteUrl: string): ContentDocument {
  const author = article.authors?.[0];
  return compact({
    uniqueId: `guide:${article.id}`,
    docType: "guide",
    docTypeLabel: DOC_TYPE_LABELS.guide,
    title: article.title,
    description: article.excerpt ?? "",
    body: buildBody([article.excerpt, plain(article.articleText?.text)]),
    url: `${trimSlash(siteUrl)}${pathFor("article", article.slug)}`,
    imageUrl: resized(article.articleImage?.url),
    imageAlt: article.articleImage?.altText ?? undefined,
    tags: article.tags,
    contentType: humaniseEnum(article.articleType),
    author: author?.name ?? undefined,
    authorTitle: author?.title ?? undefined,
    readingTime: asInt(article.readingTime),
    relatedProducts: article.featuredProducts?.map((p) => p.productName),
    updatedAt: article.updatedAt ?? undefined,
    publishedAt: article.postDate ?? article.publishedAt ?? undefined,
  }) as ContentDocument;
}

export function postToDocument(post: IndexablePost, siteUrl: string): ContentDocument {
  return compact({
    uniqueId: `journal:${post.id}`,
    docType: "journal",
    docTypeLabel: DOC_TYPE_LABELS.journal,
    title: post.title,
    description: post.excerpt ?? "",
    // `content` is the localized field; `body` is the legacy one kept populated
    // for entries that predate the migration.
    body: buildBody([post.excerpt, plain(post.content?.text ?? post.body?.text)]),
    url: `${trimSlash(siteUrl)}${pathFor("post", post.slug)}`,
    imageUrl: resized(post.coverImage?.url),
    imageAlt: post.coverImage?.altText ?? undefined,
    tags: post.tags,
    contentType: "Journal",
    author: post.author?.name ?? undefined,
    authorTitle: post.author?.title ?? undefined,
    readingTime: asInt(post.readingTime),
    updatedAt: post.updatedAt ?? undefined,
    publishedAt: post.postDate ?? post.publishedAt ?? undefined,
  }) as ContentDocument;
}

export function faqToDocument(faq: IndexableFaq, siteUrl: string): ContentDocument {
  const answer = plain(faq.answer?.text) ?? "";
  // FAQs have no summary field, so the first sentence of the answer becomes one.
  const firstLine = answer.split("\n").find((line) => line.trim().length > 0) ?? "";

  return compact({
    uniqueId: `faq:${faq.id}`,
    docType: "faq",
    docTypeLabel: DOC_TYPE_LABELS.faq,
    title: faq.question,
    description: firstLine,
    body: buildBody([faq.question, answer]),
    url: `${trimSlash(siteUrl)}${pathFor("faq", faq.slug)}`,
    contentType: humaniseEnum(faq.category),
    updatedAt: faq.updatedAt ?? undefined,
    publishedAt: faq.publishedAt ?? undefined,
  }) as ContentDocument;
}

export function policyToDocument(policy: IndexablePolicy, siteUrl: string): ContentDocument {
  return compact({
    uniqueId: `policy:${policy.id}`,
    docType: "policy",
    docTypeLabel: DOC_TYPE_LABELS.policy,
    title: policy.title,
    description: policy.summary ?? "",
    body: buildBody([policy.summary, plain(policy.body?.text)]),
    url: `${trimSlash(siteUrl)}${pathFor("policy", policy.slug)}`,
    contentType: "Policy",
    updatedAt: policy.updatedAt ?? undefined,
    publishedAt: policy.publishedAt ?? undefined,
  }) as ContentDocument;
}

export function authorToDocument(author: IndexableAuthor, siteUrl: string): ContentDocument {
  return compact({
    uniqueId: `author:${author.id}`,
    docType: "author",
    docTypeLabel: DOC_TYPE_LABELS.author,
    title: author.name ?? "",
    description: author.description ?? "",
    body: buildBody([author.description, plain(author.bio?.text)]),
    url: `${trimSlash(siteUrl)}${pathFor("author", author.slug)}`,
    imageUrl: resized(author.avatar?.url),
    imageAlt: author.avatar?.altText ?? undefined,
    contentType: "Author",
    author: author.name ?? undefined,
    authorTitle: author.title ?? undefined,
    updatedAt: author.updatedAt ?? undefined,
    publishedAt: author.publishedAt ?? undefined,
  }) as ContentDocument;
}

/**
 * Whether a document carries enough text to be worth indexing.
 *
 * A document with no summary and almost no prose contributes nothing to
 * retrieval and makes the result list look broken. This currently excludes
 * three entries left over from the original Hygraph playground: a stub article
 * whose body is one placeholder sentence, and two author records for real
 * people who have no bio — content we should not invent copy for.
 *
 * Exported so the phase-2 backfill and the webhook apply exactly the same rule
 * as the sample generator; an entry that is skipped on ingest must also be
 * skipped on update, or it reappears.
 */
export const MIN_BODY_CHARS = 120;

export function isIndexable(doc: { description?: string; body?: string }): boolean {
  const hasSummary = Boolean(doc.description?.trim());
  const bodyLength = doc.body?.trim().length ?? 0;
  return hasSummary || bodyLength >= MIN_BODY_CHARS;
}
