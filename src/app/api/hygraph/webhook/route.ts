import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { bulkWrite, type IngestTarget } from "@/interakt/ingest";
import {
  buildDocumentFor,
  isIndexable,
  resolveIntent,
  verifySignature,
  type WebhookIndex,
} from "@/interakt/webhook";

/**
 * Incremental sync: Hygraph publish/unpublish/delete -> Interakt.
 *
 * Configure the webhook with trigger actions `publish`, `unpublish` and
 * `delete`, and set a secret key so deliveries are signed.
 */

export const runtime = "nodejs";

function target(index: WebhookIndex): IngestTarget {
  const baseUrl = process.env.INTERAKT_BASE_URL;
  const indexId =
    index === "products"
      ? process.env.INTERAKT_PRODUCTS_INDEX_ID
      : process.env.INTERAKT_CONTENT_INDEX_ID;
  const ingestionKey =
    index === "products"
      ? process.env.INTERAKT_PRODUCTS_INGESTION_KEY
      : process.env.INTERAKT_CONTENT_INGESTION_KEY;

  if (!baseUrl || !indexId || !ingestionKey) {
    throw new Error(`Interakt is not configured for the ${index} index`);
  }
  return { baseUrl, indexId, ingestionKey };
}

export async function POST(request: Request) {
  const secret = process.env.HYGRAPH_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "HYGRAPH_WEBHOOK_SECRET is not configured" },
      { status: 500 },
    );
  }

  // Read the body as text: verifying against a re-serialised object fails,
  // because JSON.stringify does not reproduce the original bytes.
  const rawBody = await request.text();

  if (!verifySignature(rawBody, request.headers.get("gcms-signature"), secret)) {
    return NextResponse.json({ ok: false, error: "Bad signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "Body is not JSON" }, { status: 400 });
  }

  // Purge first and unconditionally. Keeping the site fresh must not depend on
  // the search integration being healthy.
  //
  // Next 16 requires a cacheLife profile as the second argument; "max" purges
  // rather than merely marking stale. (`updateTag` would be the read-your-own-
  // writes variant, but it is Server-Action only.)
  revalidateTag("hygraph", "max");

  const intent = resolveIntent(payload as Parameters<typeof resolveIntent>[0]);

  if (intent.action === "ignore" || !intent.index || !intent.uniqueId) {
    return NextResponse.json({ ok: true, revalidated: true, skipped: intent.reason });
  }

  try {
    const t = target(intent.index);

    if (intent.action === "delete") {
      await bulkWrite(t, [{ action: "delete", documentId: intent.uniqueId }]);
      return NextResponse.json({
        ok: true,
        revalidated: true,
        action: "delete",
        uniqueId: intent.uniqueId,
      });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002";
    const document = await buildDocumentFor(intent.typename!, intent.entryId!, siteUrl);

    // A publish we cannot fetch, or one too thin to index, is removed rather
    // than left behind as a stale hit.
    if (!document || !isIndexable(document)) {
      await bulkWrite(t, [{ action: "delete", documentId: intent.uniqueId }]);
      return NextResponse.json({
        ok: true,
        revalidated: true,
        action: "delete",
        uniqueId: intent.uniqueId,
        reason: document ? "no usable text" : "entry not found in the published stage",
      });
    }

    await bulkWrite(t, [
      { action: "upload", document, documentId: document.uniqueId },
    ]);

    return NextResponse.json({
      ok: true,
      revalidated: true,
      action: "upsert",
      uniqueId: document.uniqueId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[hygraph-webhook]", message);
    // The revalidate already happened, so say so even while reporting failure.
    return NextResponse.json({ ok: false, revalidated: true, error: message }, { status: 500 });
  }
}
