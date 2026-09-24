/**
 * Full re-feed of both Interakt indexes.
 *
 * Shared by the CLI backfill and the reindex API route the Hygraph app calls, so
 * a Studio-triggered re-feed and `npm run interakt:ingest` do exactly the same
 * thing rather than drifting apart.
 */

import { buildAllDocuments } from "./build";
import { bulkWrite, listDocumentIds, uploadDocuments, type IngestTarget } from "./ingest";
import type { InteraktDocument } from "./types";

const BATCH_SIZE = 500;

export type IndexResult = {
  index: "products" | "content";
  documents: number;
  indexed: number;
  failed: number;
  deleted: number;
  /** Set when reconciliation was refused; the upload still succeeded. */
  warning?: string;
  errors: string[];
};

export type ReindexResult = {
  siteUrl: string;
  skipped: number;
  indexes: IndexResult[];
  durationMs: number;
};

function target(which: "products" | "content"): IngestTarget {
  const baseUrl = process.env.INTERAKT_BASE_URL;
  const indexId =
    which === "products"
      ? process.env.INTERAKT_PRODUCTS_INDEX_ID
      : process.env.INTERAKT_CONTENT_INDEX_ID;
  const ingestionKey =
    which === "products"
      ? process.env.INTERAKT_PRODUCTS_INGESTION_KEY
      : process.env.INTERAKT_CONTENT_INGESTION_KEY;

  if (!baseUrl) throw new Error("INTERAKT_BASE_URL is not set");
  if (!indexId) throw new Error(`INTERAKT_${which.toUpperCase()}_INDEX_ID is not set`);
  if (!ingestionKey) throw new Error(`INTERAKT_${which.toUpperCase()}_INGESTION_KEY is not set`);

  return { baseUrl, indexId, ingestionKey };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function ingestOne(
  label: "products" | "content",
  documents: InteraktDocument[],
  allowEmpty: boolean,
  log: (line: string) => void,
): Promise<IndexResult> {
  const result: IndexResult = {
    index: label,
    documents: documents.length,
    indexed: 0,
    failed: 0,
    deleted: 0,
    errors: [],
  };

  // An unauthorised or misconfigured read returns an empty set rather than an
  // error, and reconciling against that would empty the index.
  if (documents.length === 0 && !allowEmpty) {
    throw new Error(`${label}: refusing to reconcile against zero documents`);
  }

  const t = target(label);

  for (const [i, batch] of chunk(documents, BATCH_SIZE).entries()) {
    const summary = await uploadDocuments(t, batch, `hygraph-${label}-${i + 1}.json`);
    result.indexed += summary.indexed;
    result.failed += summary.failed;
    result.errors.push(...summary.errors.slice(0, 5));
    log(`${label}: batch ${i + 1} — ${summary.indexed} indexed, ${summary.failed} failed`);
  }

  // Ingestion keys are scoped per operation, so a write-only key uploads fine
  // and then 403s here. The upload already happened; that is a warning.
  try {
    const live = new Set(documents.map((d) => d.uniqueId));
    const stale = (await listDocumentIds(t)).filter((id) => !live.has(id));

    for (const batch of chunk(stale, BATCH_SIZE)) {
      await bulkWrite(
        t,
        batch.map((documentId) => ({ action: "delete" as const, documentId })),
      );
      result.deleted += batch.length;
    }
    if (result.deleted > 0) log(`${label}: deleted ${result.deleted} stale documents`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("403")) {
      result.warning = "Upload succeeded; reconciliation refused. Grant the key 'delete'.";
      log(`${label}: ${result.warning}`);
    } else {
      throw error;
    }
  }

  return result;
}

export async function reindexAll(options?: {
  siteUrl?: string;
  only?: "products" | "content";
  allowEmpty?: boolean;
  log?: (line: string) => void;
}): Promise<ReindexResult> {
  const started = Date.now();
  const log = options?.log ?? (() => {});
  const siteUrl = options?.siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002";

  const built = await buildAllDocuments(siteUrl);
  log(`built ${built.products.length} products and ${built.content.length} content documents`);

  const indexes: IndexResult[] = [];
  if (!options?.only || options.only === "products") {
    indexes.push(await ingestOne("products", built.products, options?.allowEmpty ?? false, log));
  }
  if (!options?.only || options.only === "content") {
    indexes.push(await ingestOne("content", built.content, options?.allowEmpty ?? false, log));
  }

  return {
    siteUrl,
    skipped: built.skipped.length,
    indexes,
    durationMs: Date.now() - started,
  };
}
