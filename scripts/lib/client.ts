/**
 * Minimal Hygraph Content API client for seeding.
 *
 * Deliberately not the MCP tools: those create one entry per call, which is far
 * too slow for ~250 entries. This batches mutations with GraphQL aliases.
 *
 * Measured limits on this project:
 *   10 aliases/document -> OK for reads and dry runs
 *   20 aliases/document -> HTTP 429 "concurrent operations limit exceeded"
 * It is an operation-count limit, not a byte limit (the failing 20-alias
 * document was smaller than the passing 10-alias one).
 *
 * Committed writes are much heavier than dry runs: 8 aliases x 2 concurrent
 * requests still tripped the limiter, so the defaults here are deliberately
 * conservative. Override with HYGRAPH_BATCH_SIZE / HYGRAPH_CONCURRENCY.
 */

export const ALIASES_PER_REQUEST = Number(process.env.HYGRAPH_BATCH_SIZE ?? 4);
const MAX_CONCURRENCY = Number(process.env.HYGRAPH_CONCURRENCY ?? 1);
const MAX_ATTEMPTS = 8;
/** Pause between batches. Real writes are far heavier than dry runs and the
 *  concurrent-operations limiter is unforgiving without a little spacing. */
const BATCH_DELAY_MS = Number(process.env.HYGRAPH_BATCH_DELAY ?? 250);

const endpoint = process.env.HYGRAPH_CONTENT_API;
const token = process.env.HYGRAPH_TOKEN;

if (!endpoint) throw new Error("HYGRAPH_CONTENT_API is not set (see .env.local.example)");
if (!token) throw new Error("HYGRAPH_TOKEN is not set (see .env.local.example)");

/** When true every mutation carries Hyg-Dry-Run, so nothing persists. */
export let dryRun = true;
export function setDryRun(value: boolean) {
  dryRun = value;
}

let loggedExtensions = false;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class GraphQLError extends Error {
  constructor(
    message: string,
    readonly errors: unknown,
  ) {
    super(message);
    this.name = "GraphQLError";
  }
}

export async function gql<T = Record<string, unknown>>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  let delay = 500;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
    if (dryRun) headers["Hyg-Dry-Run"] = "true";

    const res = await fetch(endpoint!, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
    });

    if (res.status === 429 || res.status >= 500) {
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`Hygraph ${res.status} after ${MAX_ATTEMPTS} attempts: ${await res.text()}`);
      }
      await sleep(delay);
      delay = Math.min(delay * 2, 30000);
      continue;
    }

    const json = (await res.json()) as {
      data?: T;
      errors?: unknown;
      extensions?: Record<string, unknown>;
    };

    // Log the real complexity budget once so batch sizes can be tuned from
    // the actual number rather than the empirical 8.
    if (!loggedExtensions && json.extensions) {
      loggedExtensions = true;
      console.log("  [hygraph] extensions:", JSON.stringify(json.extensions));
    }

    if (json.errors) {
      throw new GraphQLError(
        `Hygraph GraphQL error: ${JSON.stringify(json.errors)}`,
        json.errors,
      );
    }

    if (!json.data) throw new Error("Hygraph returned no data");
    return json.data;
  }

  throw new Error("unreachable");
}

/** Runs tasks with a small concurrency cap, preserving result order. */
async function pooled<T>(tasks: (() => Promise<T>)[]): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;

  const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, tasks.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= tasks.length) return;
      results[index] = await tasks[index]();
    }
  });

  await Promise.all(workers);
  return results;
}

export function chunk<T>(items: T[], size = ALIASES_PER_REQUEST): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type AliasedOp = {
  /** Variable declarations for this op, e.g. `$c0: ProductCreateInput!`. */
  declarations: string[];
  /** The aliased selection, e.g. `p0: upsertProduct(...) { id }`. */
  selection: string;
  variables: Record<string, unknown>;
};

/**
 * Executes aliased mutations in batches.
 *
 * Note: every alias in one document must carry a DISTINCT value for the unique
 * field in its `create` branch, even for rows that will take the `update` path.
 * Hygraph validates all create inputs up front regardless of which branch runs,
 * and a collision surfaces only as "Input value does not match the expected
 * format." — so the create payload is always built per row, never hoisted.
 */
export async function runBatched(
  label: string,
  ops: AliasedOp[],
): Promise<Record<string, { id: string }>> {
  const batches = chunk(ops);
  const merged: Record<string, { id: string }> = {};

  const results = await pooled(
    batches.map((batch, batchIndex) => async () => {
      const declarations = batch.flatMap((op) => op.declarations).join(", ");
      const selections = batch.map((op) => op.selection).join("\n  ");
      const variables = Object.assign({}, ...batch.map((op) => op.variables));
      const query = `mutation Seed${declarations ? `(${declarations})` : ""} {\n  ${selections}\n}`;

      try {
        if (BATCH_DELAY_MS > 0) await sleep(BATCH_DELAY_MS);
        return await gql<Record<string, { id: string }>>(query, variables);
      } catch (error) {
        // With 8 aliases the offending row is easy to identify — name it.
        console.error(
          `  [${label}] batch ${batchIndex + 1}/${batches.length} failed. Aliases: ${batch
            .map((op) => op.selection.split(":")[0])
            .join(", ")}`,
        );
        throw error;
      }
    }),
  );

  for (const result of results) Object.assign(merged, result);
  process.stdout.write(`  [${label}] ${ops.length} ops in ${batches.length} batches\n`);
  return merged;
}
