"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BROWSE_QUERY,
  autocomplete,
  search,
  streamSummary,
  type Facet,
  type SearchFilter,
  type SearchResponse,
  type Suggestion,
} from "@/interakt/search-client";

type Params = {
  query: string;
  page: number;
  pageSize: number;
  indexId?: string;
  filters: SearchFilter[];
};

/**
 * Debounced search with stale-response protection.
 *
 * Responses are keyed by the request that produced them, so a slow reply for an
 * earlier keystroke can never overwrite a newer one — the usual cause of results
 * that briefly disagree with the query box.
 */
export function useInteraktSearch(params: Params) {
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = JSON.stringify(params);
  const latest = useRef(key);

  useEffect(() => {
    latest.current = key;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await search(
          {
            query: params.query.trim() || BROWSE_QUERY,
            page: params.page,
            pageSize: params.pageSize,
            ...(params.indexId ? { indexId: params.indexId } : {}),
            ...(params.filters.length ? { filters: params.filters } : {}),
          },
          controller.signal,
        );
        if (latest.current === key) setData(result);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (latest.current === key) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (latest.current === key) setLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, params.query, params.page, params.pageSize, params.indexId, params.filters]);

  return { data, loading, error };
}

export function useAutocomplete(query: string, enabled: boolean) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  useEffect(() => {
    if (!enabled || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setSuggestions(await autocomplete(query.trim(), controller.signal));
      } catch {
        // Autocomplete is a convenience; a failure should never surface.
        setSuggestions([]);
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, enabled]);

  return suggestions;
}

/**
 * Streamed AI summary.
 *
 * Keyed on the query *and* the result ids, so a summary can never be shown
 * against a different set of results than the one it was generated from.
 */
export function useAiSummary(data: SearchResponse | null, query: string, enabled: boolean) {
  const [summary, setSummary] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [available, setAvailable] = useState(true);

  const ids = (data?.results ?? []).map((r) => r.id).join(",");

  useEffect(() => {
    if (!enabled || !data || data.results.length === 0 || !query.trim() || query.trim() === BROWSE_QUERY) {
      setSummary("");
      return;
    }

    const controller = new AbortController();
    setSummary("");
    setStreaming(true);

    streamSummary(
      { query: query.trim(), results: data.results.slice(0, 6), totalResults: data.total.value },
      (text) => setSummary((prev) => prev + text),
      controller.signal,
    )
      .catch(() => {
        // A rejection here means summaries are off for this experience.
        if (!controller.signal.aborted) setAvailable(false);
      })
      .finally(() => {
        if (!controller.signal.aborted) setStreaming(false);
      });

    return () => controller.abort();
  }, [ids, query, enabled, data]);

  return { summary, streaming, available };
}

/**
 * Remembers the buckets seen before any filter was applied.
 *
 * The backend recomputes facets with all active filters applied, so selecting
 * "Brand: Fenn" collapses the brand facet to just Fenn and you lose the ability
 * to switch to another brand without clearing first. Caching the unfiltered
 * buckets per query keeps every option on screen.
 */
export function useStableFacets(facets: Facet[] | undefined, queryKey: string) {
  const [cache, setCache] = useState<Record<string, Facet>>({});
  const cachedFor = useRef(queryKey);

  const reset = useCallback(() => setCache({}), []);

  useEffect(() => {
    if (cachedFor.current !== queryKey) {
      cachedFor.current = queryKey;
      setCache({});
    }
  }, [queryKey]);

  useEffect(() => {
    if (!facets) return;
    setCache((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const facet of facets) {
        const existing = next[facet.field];
        if (!existing || facet.buckets.length > existing.buckets.length) {
          next[facet.field] = facet;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [facets]);

  return { stable: Object.values(cache), reset };
}
