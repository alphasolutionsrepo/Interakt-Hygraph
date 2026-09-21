import { cdnEndpoint } from "./env";

const MAX_ATTEMPTS = 6;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Every read goes through here.
 *
 * Tagged 'hygraph' so a single revalidateTag('hygraph') from a Hygraph webhook
 * invalidates the whole site rather than needing per-route bookkeeping.
 *
 * Reads the CDN endpoint unauthenticated — published content on this project is
 * publicly readable, so no token is ever shipped to the browser or needed here.
 *
 * Retries on 429: a full static build renders ~180 pages in parallel workers and
 * comfortably trips the project's read limit without backoff.
 */
export async function hygraphFetch<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  let delay = 1000;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(cdnEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      next: { tags: ["hygraph"], revalidate: 3600 },
    });

    if (res.status === 429 || res.status >= 500) {
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`Hygraph responded ${res.status} after ${MAX_ATTEMPTS} attempts`);
      }
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : delay);
      delay = Math.min(delay * 2, 20000);
      continue;
    }

    if (!res.ok) {
      throw new Error(`Hygraph responded ${res.status}: ${await res.text()}`);
    }

    const json = (await res.json()) as { data?: T; errors?: { message: string }[] };

    if (json.errors?.length) {
      throw new Error(`Hygraph query failed: ${json.errors.map((e) => e.message).join("; ")}`);
    }

    if (!json.data) throw new Error("Hygraph returned no data");
    return json.data;
  }

  throw new Error("unreachable");
}
