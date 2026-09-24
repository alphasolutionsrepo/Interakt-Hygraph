"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  INDEX_IDS,
  hitField,
  isConfigured,
  resolveRole,
  type Facet,
  type SearchFilter,
  type SearchHit,
} from "@/interakt/search-client";
import {
  useAiSummary,
  useAutocomplete,
  useInteraktSearch,
  useStableFacets,
} from "@/hooks/useInteraktSearch";

const PAGE_SIZE = 12;

const TABS = [
  { id: "all", label: "Everything", indexId: undefined },
  { id: "products", label: "Products", indexId: INDEX_IDS.products },
  { id: "content", label: "Guides & help", indexId: INDEX_IDS.content },
] as const;

/**
 * Facets worth showing, in display order.
 *
 * The experience returns the union of every facetable field across both indexes,
 * which includes numeric fields bucketed one value at a time — a `reviewCount`
 * facet with ten buckets of single numbers is noise, not navigation. This is the
 * allow-list; everything else is dropped.
 */
const FACET_LABELS: Record<string, string> = {
  docType: "Type",
  contentType: "Topic",
  brand: "Brand",
  productLine: "Product line",
  categories: "Category",
  color: "Colour",
  size: "Size",
  author: "Author",
  rating: "Rating",
  inStock: "Availability",
};

const EXAMPLE_QUERIES = [
  "waterproof jacket for Scottish winter",
  "how long do returns take",
  "boots for heavy loads",
  "what R-value do I need",
];

function formatBucketKey(field: string, key: string | number): string {
  if (field === "inStock") return key === 1 || key === "1" ? "In stock" : "Out of stock";
  if (field === "rating") return `${key} stars and up`;
  if (field === "docType") {
    const labels: Record<string, string> = {
      product: "Product",
      guide: "Guide",
      journal: "Journal",
      faq: "Help",
      policy: "Policy",
      author: "Author",
    };
    return labels[String(key)] ?? String(key);
  }
  return String(key);
}

function ResultCard({
  hit,
  roles,
}: {
  hit: SearchHit;
  roles: Record<string, string | undefined>;
}) {
  const title = String(hitField(hit, roles.title) ?? "Untitled");
  const description = hitField(hit, roles.description);
  const image = hitField(hit, roles.image);
  const url = hitField(hit, roles.link);
  const price = hitField(hit, roles.price);
  const docType = String(hitField(hit, "docTypeLabel") ?? "");
  const badge = hitField(hit, "brand") ?? hitField(hit, "author");

  // Links are absolute (the index stores canonical URLs), so make them relative
  // to keep client-side navigation on the site.
  const href = typeof url === "string" ? url.replace(/^https?:\/\/[^/]+/, "") : "#";

  return (
    <Link
      href={href}
      className="group flex gap-4 rounded-lg border border-stone-200 p-4 transition hover:border-stone-400 dark:border-stone-800 dark:hover:border-stone-600"
    >
      <div className="relative hidden h-24 w-24 shrink-0 overflow-hidden rounded bg-stone-100 sm:block dark:bg-stone-900">
        {typeof image === "string" && image ? (
          <Image src={image} alt="" fill sizes="96px" className="object-cover" />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {docType ? (
            <span className="rounded bg-stone-100 px-2 py-0.5 text-stone-600 dark:bg-stone-900 dark:text-stone-400">
              {docType}
            </span>
          ) : null}
          {typeof badge === "string" && badge ? (
            <span className="text-stone-500">{badge}</span>
          ) : null}
        </div>

        <h3 className="mt-1 font-medium leading-snug text-stone-900 dark:text-stone-100">{title}</h3>

        {typeof description === "string" && description ? (
          <p className="mt-1 line-clamp-2 text-sm text-stone-600 dark:text-stone-400">
            {description}
          </p>
        ) : null}

        {typeof price === "number" ? (
          <p className="mt-2 font-semibold text-stone-900 dark:text-stone-100">
            {new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            }).format(price)}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

function FacetPanel({
  facets,
  active,
  onToggle,
}: {
  facets: Facet[];
  active: SearchFilter[];
  onToggle: (field: string, value: string | number) => void;
}) {
  const shown = facets
    .filter((f) => FACET_LABELS[f.field] && f.buckets.length > 0)
    .sort(
      (a, b) =>
        Object.keys(FACET_LABELS).indexOf(a.field) - Object.keys(FACET_LABELS).indexOf(b.field),
    );

  if (shown.length === 0) return null;

  return (
    <aside className="space-y-6">
      {shown.map((facet) => (
        <div key={facet.field}>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">
            {FACET_LABELS[facet.field]}
          </h3>
          <ul className="space-y-1">
            {facet.buckets.slice(0, 8).map((bucket) => {
              const selected = active.some(
                (f) => f.field === facet.field && String(f.value) === String(bucket.key),
              );
              return (
                <li key={String(bucket.key)}>
                  <button
                    type="button"
                    onClick={() => onToggle(facet.field, bucket.key)}
                    className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-sm transition ${
                      selected
                        ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                        : "text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-900"
                    }`}
                  >
                    <span className="truncate">{formatBucketKey(facet.field, bucket.key)}</span>
                    <span className={selected ? "text-stone-300 dark:text-stone-600" : "text-stone-400"}>
                      {bucket.count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </aside>
  );
}

export function SearchExperience({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [submitted, setSubmitted] = useState(initialQuery);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("all");
  const [filters, setFilters] = useState<SearchFilter[]>([]);
  const [page, setPage] = useState(1);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const indexId = TABS.find((t) => t.id === tab)?.indexId;

  const params = useMemo(
    () => ({ query: submitted, page, pageSize: PAGE_SIZE, indexId, filters }),
    [submitted, page, indexId, filters],
  );

  const { data, loading, error } = useInteraktSearch(params);
  const suggestions = useAutocomplete(query, focused && query !== submitted);
  const { stable } = useStableFacets(data?.facets, `${submitted}|${tab}`);
  const { summary, streaming, available } = useAiSummary(data, submitted, true);

  const roles = useMemo(
    () => ({
      title: resolveRole(data?.displayConfig, "title") ?? "title",
      description: resolveRole(data?.displayConfig, "description") ?? "description",
      image: resolveRole(data?.displayConfig, "image") ?? "imageUrl",
      link: resolveRole(data?.displayConfig, "link") ?? "url",
      price: resolveRole(data?.displayConfig, "price") ?? "price",
    }),
    [data?.displayConfig],
  );

  function runSearch(value: string) {
    setSubmitted(value);
    setPage(1);
    setFilters([]);
    setFocused(false);
  }

  function toggleFilter(field: string, value: string | number) {
    setPage(1);
    setFilters((prev) => {
      const existing = prev.find((f) => f.field === field && String(f.value) === String(value));
      if (existing) return prev.filter((f) => f !== existing);
      // One value per field keeps the filter set predictable.
      return [...prev.filter((f) => f.field !== field), { field, operator: "eq", value }];
    });
  }

  if (!isConfigured) {
    return (
      <div className="rounded-lg border border-dashed border-stone-300 p-10 text-center text-stone-500 dark:border-stone-700">
        Search is not configured. Set <code>NEXT_PUBLIC_INTERAKT_BASE_URL</code> and{" "}
        <code>NEXT_PUBLIC_INTERAKT_SEARCH_TOKEN</code>.
      </div>
    );
  }

  const total = data?.total.value ?? 0;
  const approximate = data?.total.relation === "gte";

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch(query);
        }}
        className="relative"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Search products, guides and help…"
          className="w-full rounded-lg border border-stone-300 bg-white px-4 py-3 text-base outline-none transition focus:border-stone-500 dark:border-stone-700 dark:bg-stone-950"
        />

        {focused && suggestions.length > 0 ? (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-stone-200 bg-white shadow-lg dark:border-stone-800 dark:bg-stone-950">
            {suggestions.map((s) => (
              <li key={s.text}>
                <button
                  type="button"
                  onMouseDown={() => {
                    setQuery(s.text);
                    runSearch(s.text);
                  }}
                  className="block w-full px-4 py-2 text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-900"
                >
                  {s.text}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </form>

      {!submitted ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {EXAMPLE_QUERIES.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                setQuery(q);
                runSearch(q);
              }}
              className="rounded-full border border-stone-300 px-3 py-1 text-sm text-stone-600 transition hover:border-stone-500 dark:border-stone-700 dark:text-stone-400"
            >
              {q}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-2 border-b border-stone-200 dark:border-stone-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setPage(1);
              setFilters([]);
            }}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition ${
              tab === t.id
                ? "border-stone-900 font-medium text-stone-900 dark:border-stone-100 dark:text-stone-100"
                : "border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
            }`}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto py-2 text-sm text-stone-500">
          {loading ? "Searching…" : `${approximate ? "about " : ""}${total} results`}
          {data?.took ? ` · ${data.took}ms` : ""}
        </span>
      </div>

      {error ? (
        <p className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {available && (summary || streaming) ? (
        <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50/60 p-5 dark:border-emerald-900 dark:bg-emerald-950/30">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
            AI summary
          </p>
          <p className="text-sm leading-6 text-stone-800 dark:text-stone-200">
            {summary}
            {streaming ? <span className="ml-0.5 animate-pulse">▍</span> : null}
          </p>
        </div>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[200px_1fr]">
        <FacetPanel facets={stable} active={filters} onToggle={toggleFilter} />

        <div>
          {filters.length > 0 ? (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {filters.map((f) => (
                <button
                  key={`${f.field}-${f.value}`}
                  type="button"
                  onClick={() => toggleFilter(f.field, f.value as string)}
                  className="rounded-full bg-stone-900 px-3 py-1 text-xs text-white dark:bg-stone-100 dark:text-stone-900"
                >
                  {FACET_LABELS[f.field]}: {formatBucketKey(f.field, f.value as string)} ×
                </button>
              ))}
              <button
                type="button"
                onClick={() => setFilters([])}
                className="text-xs text-stone-500 underline"
              >
                Clear all
              </button>
            </div>
          ) : null}

          {data && data.results.length === 0 && !loading ? (
            <p className="text-stone-600 dark:text-stone-400">
              Nothing matched. Try a broader phrase, or clear the filters.
            </p>
          ) : null}

          <div className="space-y-3">
            {data?.results.map((hit) => (
              <ResultCard key={hit.id} hit={hit} roles={roles} />
            ))}
          </div>

          {data && data.pagination.totalPages > 1 ? (
            <div className="mt-8 flex items-center justify-between">
              <button
                type="button"
                disabled={!data.pagination.hasPreviousPage}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded border border-stone-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-stone-700"
              >
                Previous
              </button>
              <span className="text-sm text-stone-500">
                Page {data.pagination.page} of {data.pagination.totalPages}
              </span>
              <button
                type="button"
                disabled={!data.pagination.hasNextPage}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border border-stone-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-stone-700"
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
