/**
 * Browser-side Interakt search client.
 *
 * Auth is `X-Access-Token`, which is a *different* credential from the ingestion
 * key: access tokens are public and read-only by design, and origin-bound. This
 * instance currently allows all origins (an empty allowed-origins list means
 * `Access-Control-Allow-Origin: *`), so a 403 here almost always means the
 * origin list was tightened without adding this site.
 *
 * Paths verified against the running backend — the published docs are wrong:
 *   docs say  POST /api/v1/search-experiences/{slug}/search
 *   reality   POST /api/v1/search           (the experience comes from the token)
 */

export type SearchHit = {
  id: string;
  score?: number;
  /** The token endpoint returns `source`; the slug endpoint returns `fields`. */
  source?: Record<string, unknown>;
  fields?: Record<string, unknown>;
  highlights?: Record<string, string[]>;
};

export type FacetBucket = { key: string | number; count: number };
export type Facet = { field: string; type: string; label?: string; buckets: FacetBucket[] };

export type DisplayField = {
  fieldName: string;
  role: string;
  label?: string;
  order: number;
};

export type SearchResponse = {
  results: SearchHit[];
  total: { value: number; relation: string };
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  facets: Facet[];
  took: number;
  indexesSearched: { id: string; name: string; displayName?: string }[];
  displayConfig?: { displayFields?: DisplayField[] };
};

export type SearchFilter = { field: string; operator: string; value: string | number | boolean };

export type SearchRequest = {
  query: string;
  indexId?: string;
  page?: number;
  pageSize?: number;
  filters?: SearchFilter[];
  searchType?: "lexical" | "semantic" | "hybrid" | "auto";
};

const baseUrl = process.env.NEXT_PUBLIC_INTERAKT_BASE_URL ?? "";
const token = process.env.NEXT_PUBLIC_INTERAKT_SEARCH_TOKEN ?? "";

export const isConfigured = Boolean(baseUrl && token);

export const INDEX_IDS = {
  products: process.env.NEXT_PUBLIC_INTERAKT_PRODUCTS_INDEX_ID ?? "",
  content: process.env.NEXT_PUBLIC_INTERAKT_CONTENT_INDEX_ID ?? "",
};

/** The API rejects an empty query, so browsing uses a match-everything term. */
export const BROWSE_QUERY = "*";

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Access-Token": token },
    body: JSON.stringify(body),
    signal,
  });

  if (res.status === 403) {
    throw new Error(
      `Interakt rejected this origin. Add ${window.location.origin} to the experience's allowed origins.`,
    );
  }
  if (!res.ok) throw new Error(`Interakt ${res.status}: ${await res.text()}`);

  const json = (await res.json()) as { success: boolean; data: T; error?: string };
  if (!json.success) throw new Error(json.error ?? "Interakt returned an unsuccessful response");
  return json.data;
}

export function search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResponse> {
  return post<SearchResponse>("/api/v1/search", request, signal);
}

export type Suggestion = { text: string; score?: number; field?: string; highlight?: string };

export async function autocomplete(
  query: string,
  signal?: AbortSignal,
): Promise<Suggestion[]> {
  const data = await post<{ suggestions?: Suggestion[] }>(
    "/api/v1/autocomplete",
    { query, maxSuggestions: 6 },
    signal,
  );
  return data.suggestions ?? [];
}

/**
 * Streams the AI summary.
 *
 * Server-sent events over POST, so EventSource is unusable (it is GET-only) and
 * the frames are parsed by hand. The JSON parse sits outside the try so a
 * server-sent `error` event surfaces instead of being swallowed as an empty
 * summary.
 */
export async function streamSummary(
  request: { query: string; results: SearchHit[]; totalResults: number },
  onToken: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/v1/summarize`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Access-Token": token },
    signal,
    body: JSON.stringify({
      query: request.query,
      totalResults: request.totalResults,
      results: request.results.map((hit) => ({
        id: hit.id,
        index: { id: "default", name: "default" },
        fields: hit.source ?? hit.fields ?? {},
      })),
    }),
  });

  if (!res.ok || !res.body) throw new Error(`Summary unavailable (${res.status})`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;

      const payload = line.slice("data: ".length).trim();
      if (!payload || payload === "[DONE]") continue;

      const event = JSON.parse(payload) as { type?: string; text?: string; message?: string };
      if (event.type === "error") throw new Error(event.message ?? "Summary failed");
      if (event.type === "content" && event.text) onToken(event.text);
    }
  }
}

/** Reads a field from a hit regardless of which response shape came back. */
export function hitField(hit: SearchHit, field: string | undefined): unknown {
  if (!field) return undefined;
  const source = hit.source ?? hit.fields ?? {};
  return source[field];
}

/**
 * One field per display role for the whole experience — `resolveField()` in the
 * widget takes the lowest-order match and there is no per-index override, which
 * is why both indexes share a field vocabulary.
 */
export function resolveRole(
  displayConfig: SearchResponse["displayConfig"],
  role: string,
): string | undefined {
  const fields = displayConfig?.displayFields ?? [];
  return [...fields].filter((f) => f.role === role).sort((a, b) => a.order - b.order)[0]?.fieldName;
}
