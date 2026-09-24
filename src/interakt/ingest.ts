/**
 * Interakt ingestion client.
 *
 * Server-to-server only: these endpoints send no CORS headers and the key can
 * write and delete. Two corrections against the published Interakt docs, both
 * verified in the backend source:
 *
 *   docs say  POST /api/v1/search-indexes/{id}/documents   header X-Api-Key
 *   reality   POST /api/search-indexes/{id}/documents      Authorization: Bearer ik_…
 *
 * There is no /v1 segment on the ingestion API, and `X-Api-Key` is not read at
 * all — `ingestion-key.middleware.ts` deliberately accepts only Bearer so a
 * public widget token can never be mistaken for an ingestion key.
 */

import type { InteraktDocument } from "./types";

export type IngestTarget = {
  baseUrl: string;
  indexId: string;
  ingestionKey: string;
};

export type UploadSummary = {
  total: number;
  indexed: number;
  failed: number;
  errors: string[];
};

/** Caps enforced by the API: 10,000 documents and 10 MB per request. */
export const MAX_DOCUMENTS_PER_REQUEST = 10_000;
export const MAX_BYTES_PER_REQUEST = 10 * 1024 * 1024;

function endpoint(target: IngestTarget, suffix = ""): string {
  return `${target.baseUrl.replace(/\/$/, "")}/api/search-indexes/${target.indexId}/documents${suffix}`;
}

function headers(target: IngestTarget): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${target.ingestionKey}`,
  };
}

/**
 * POST with 429 handling.
 *
 * Bulk allows 60 requests/min and full upload only 30, so a backfill that
 * ignores Retry-After stalls partway through rather than failing outright —
 * which is worse, because it looks like it worked.
 */
async function postWithRetry(
  url: string,
  target: IngestTarget,
  body: unknown,
  attempt = 0,
): Promise<Response> {
  const res = await fetch(url, {
    method: "POST",
    headers: headers(target),
    body: JSON.stringify(body),
  });

  if (res.status === 429 && attempt < 5) {
    const wait = Number(res.headers.get("Retry-After") ?? 60);
    console.warn(`  rate limited, waiting ${wait}s`);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return postWithRetry(url, target, body, attempt + 1);
  }

  if (!res.ok) {
    throw new Error(`Interakt ${res.status} ${res.statusText}: ${await res.text()}`);
  }
  return res;
}

/** Full upload. Provisions the index if needed and regenerates embeddings. */
export async function uploadDocuments(
  target: IngestTarget,
  documents: InteraktDocument[],
  sourceFileName?: string,
): Promise<UploadSummary> {
  if (documents.length === 0) return { total: 0, indexed: 0, failed: 0, errors: [] };

  if (documents.length > MAX_DOCUMENTS_PER_REQUEST) {
    throw new Error(`${documents.length} documents exceeds the ${MAX_DOCUMENTS_PER_REQUEST} cap`);
  }
  const bytes = Buffer.byteLength(JSON.stringify({ documents, sourceFileName }));
  if (bytes > MAX_BYTES_PER_REQUEST) {
    throw new Error(`payload is ${(bytes / 1024 / 1024).toFixed(1)} MB, over the 10 MB cap`);
  }

  const res = await postWithRetry(endpoint(target), target, { documents, sourceFileName });
  const json = (await res.json()) as {
    data?: { summary?: { total?: number; indexed?: number; failed?: number }; errors?: unknown[] };
  };

  const summary = json.data?.summary;
  const errors = (json.data?.errors ?? []).map((e) =>
    typeof e === "string" ? e : JSON.stringify(e),
  );

  return {
    total: summary?.total ?? documents.length,
    indexed: summary?.indexed ?? 0,
    failed: summary?.failed ?? 0,
    errors,
  };
}

/**
 * Every document id currently in the index.
 *
 * The provider refuses deep pagination, so the walk stops at the documented
 * 10,000-document ceiling rather than looping forever.
 */
export async function listDocumentIds(target: IngestTarget): Promise<string[]> {
  const PAGE_SIZE = 100;
  const MAX_PAGES = 100;
  const ids: string[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(`${endpoint(target)}?page=${page}&pageSize=${PAGE_SIZE}`, {
      headers: headers(target),
    });
    if (!res.ok) {
      throw new Error(`Interakt ${res.status} listing documents: ${await res.text()}`);
    }

    const json = (await res.json()) as {
      data?: { documents?: { id?: string; uniqueId?: string }[]; pagination?: { totalPages?: number } };
    };
    const docs = json.data?.documents ?? [];
    for (const doc of docs) {
      const id = doc.uniqueId ?? doc.id;
      if (id) ids.push(String(id));
    }

    const totalPages = Number(json.data?.pagination?.totalPages ?? 1);
    if (docs.length === 0 || page >= totalPages) break;
  }

  return ids;
}

export type BulkOperation =
  | { action: "upload"; document: InteraktDocument; documentId?: string }
  | { action: "merge"; documentId: string; document: Partial<InteraktDocument> }
  | { action: "delete"; documentId: string };

/**
 * Mixed batch, up to 10,000 operations.
 *
 * This is the right endpoint for webhook traffic: a `delete` here is idempotent,
 * whereas `DELETE /documents/:id` 404s for an already-removed document, which
 * would turn a harmless webhook replay into a failing handler.
 */
export async function bulkWrite(
  target: IngestTarget,
  operations: BulkOperation[],
): Promise<unknown> {
  if (operations.length === 0) return null;
  const res = await postWithRetry(endpoint(target, "/bulk"), target, { operations });
  return res.json();
}
