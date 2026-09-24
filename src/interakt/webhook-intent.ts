/**
 * Hygraph webhook: signature verification and intent resolution.
 *
 * Deliberately free of Hygraph and Interakt clients so it stays unit-testable
 * without credentials — the fetching half lives in webhook.ts.
 *
 * Two things here are load-bearing and easy to get wrong:
 *
 *  1. **Intent comes from `operation`, never from the body.** A delete still
 *     ships the full pre-delete entry, so sniffing the payload for "does this
 *     look like a real document" would happily re-index something that has just
 *     been removed, leaving results that 404.
 *  2. **Deletes go through the bulk endpoint.** `DELETE /documents/:id` returns
 *     404 for an already-removed document, which would turn a harmless webhook
 *     replay into a failing handler. A bulk `delete` is idempotent.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export type WebhookIndex = "products" | "content";
export type WebhookAction = "upsert" | "delete" | "ignore";

export type WebhookIntent = {
  action: WebhookAction;
  /** Namespaced Interakt id, e.g. `guide:cku…`. */
  uniqueId?: string;
  index?: WebhookIndex;
  typename?: string;
  entryId?: string;
  reason?: string;
};

/** Hygraph typename -> which index it belongs to and its id prefix. */
const ROUTING: Record<string, { index: WebhookIndex; prefix: string }> = {
  Product: { index: "products", prefix: "product" },
  Article: { index: "content", prefix: "guide" },
  BlogPost: { index: "content", prefix: "journal" },
  FaqItem: { index: "content", prefix: "faq" },
  PolicyPage: { index: "content", prefix: "policy" },
  Author: { index: "content", prefix: "author" },
};

/**
 * Verifies the `gcms-signature` header.
 *
 * Format: `sign=<base64>, env=<environment>, t=<timestamp>`. The signed payload
 * is a JSON object wrapping the RAW body — re-serialising a parsed body changes
 * key order and whitespace and breaks the HMAC.
 */
export function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;

  const parts = Object.fromEntries(
    header.split(", ").map((part) => {
      const index = part.indexOf("=");
      return [part.slice(0, index), part.slice(index + 1)];
    }),
  ) as { sign?: string; env?: string; t?: string };

  if (!parts.sign || !parts.env || !parts.t) return false;

  const payload = JSON.stringify({
    Body: rawBody,
    EnvironmentName: parts.env,
    TimeStamp: Number(parts.t),
  });

  const expected = createHmac("sha256", secret).update(payload).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.sign);
  return a.length === b.length && timingSafeEqual(a, b);
}

type WebhookPayload = {
  operation?: string;
  data?: { __typename?: string; id?: string; stage?: string };
};

/**
 * What to do with this delivery.
 *
 * The index only holds published content, so draft-stage churn is ignored:
 * `publish` puts an entry in, `unpublish` and `delete` take it out, and
 * create/update on a draft mean nothing until it is published.
 */
export function resolveIntent(payload: WebhookPayload): WebhookIntent {
  const operation = String(payload.operation ?? "").toLowerCase();
  const typename = payload.data?.__typename;
  const entryId = payload.data?.id;

  if (!typename || !entryId) {
    return { action: "ignore", reason: "payload has no __typename or id" };
  }

  const route = ROUTING[typename];
  if (!route) return { action: "ignore", typename, entryId, reason: `${typename} is not indexed` };

  const base = {
    typename,
    entryId,
    index: route.index,
    uniqueId: `${route.prefix}:${entryId}`,
  };

  if (operation === "publish") return { ...base, action: "upsert" };
  if (operation === "unpublish" || operation === "delete") return { ...base, action: "delete" };

  return { ...base, action: "ignore", reason: `operation "${operation}" needs no index change` };
}
