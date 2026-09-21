/**
 * Single source of truth for content-type URLs.
 *
 * Shared by the site's own links AND, in phase 2, by the canonical URL written
 * into each Interakt search document — so a route change cannot silently leave
 * the search index pointing at 404s.
 */

export type ContentType = "product" | "category" | "article" | "post" | "faq" | "policy";

export const TYPE_PATHS: Record<ContentType, string> = {
  product: "/products",
  category: "/categories",
  article: "/guides",
  post: "/blog",
  faq: "/faq",
  policy: "",
};

export const TYPE_LABELS: Record<ContentType, string> = {
  product: "Product",
  category: "Category",
  article: "Guide",
  post: "Journal",
  faq: "FAQ",
  policy: "Policy",
};

export function pathFor(type: ContentType, slug: string): string {
  const base = TYPE_PATHS[type];
  // FAQs are all on one page, anchored by slug.
  if (type === "faq") return `${base}#${slug}`;
  return `${base}/${slug}`;
}
