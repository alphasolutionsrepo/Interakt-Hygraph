function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

/** Public, published-content-only endpoint. Safe in the browser bundle. */
export const cdnEndpoint = required(
  process.env.NEXT_PUBLIC_HYGRAPH_CDN_ENDPOINT,
  "NEXT_PUBLIC_HYGRAPH_CDN_ENDPOINT",
);

export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002";

export const siteName = "Meridian";
export const siteTagline = "Apparel and outdoor supply";
