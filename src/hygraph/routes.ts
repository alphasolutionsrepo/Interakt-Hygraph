/**
 * Single source of truth for content-type URLs.
 *
 * Shared by the site's own links AND, in phase 2, by the canonical URL written
 * into each Interakt search document — so a route change cannot silently leave
 * the search index pointing at 404s.
 */

export type ContentType =
  | "product"
  | "category"
  | "article"
  | "post"
  | "faq"
  | "policy"
  | "author";

export const TYPE_PATHS: Record<ContentType, string> = {
  product: "/products",
  category: "/categories",
  article: "/guides",
  post: "/blog",
  faq: "/faq",
  policy: "",
  // The site has no per-author page yet, so an author result lands on the
  // journal index. Adding /authors/[slug] later only needs this line changed.
  author: "/blog",
};

export const TYPE_LABELS: Record<ContentType, string> = {
  product: "Product",
  category: "Category",
  article: "Guide",
  post: "Journal",
  faq: "FAQ",
  policy: "Policy",
  author: "Author",
};

/** Types whose slug does not form part of the path. */
const SLUGLESS: ContentType[] = ["author"];

export function pathFor(type: ContentType, slug: string): string {
  const base = TYPE_PATHS[type];
  // FAQs are all on one page, anchored by slug.
  if (type === "faq") return `${base}#${slug}`;
  if (SLUGLESS.includes(type)) return base;
  return `${base}/${slug}`;
}
