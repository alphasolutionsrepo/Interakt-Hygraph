/**
 * Backfills both Interakt indexes from live Hygraph content.
 *
 *   npm run interakt:ingest                  # dry run — builds and reports, sends nothing
 *   npm run interakt:ingest -- --commit
 *   npm run interakt:ingest -- --commit --only=products
 *
 * Shares src/interakt/reindex.ts with the API route behind the Hygraph app's
 * button, so a Studio-triggered re-feed and this command cannot drift apart.
 */

import { buildAllDocuments } from "../src/interakt/build";
import { reindexAll } from "../src/interakt/reindex";

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const allowEmpty = args.includes("--allow-empty");
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg ? (onlyArg.slice("--only=".length) as "products" | "content") : undefined;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002";

async function main() {
  console.log(commit ? "Ingesting into Interakt (COMMIT)" : "Ingesting into Interakt (dry run)");
  console.log(`  site ${siteUrl}`);
  console.log(`  interakt ${process.env.INTERAKT_BASE_URL ?? "(INTERAKT_BASE_URL not set)"}\n`);

  if (!commit) {
    const built = await buildAllDocuments(siteUrl);
    console.log(`  products: ${built.products.length} documents`);
    console.log(`  content:  ${built.content.length} documents`);
    if (built.skipped.length) console.log(`  skipping ${built.skipped.length} with no usable text`);
    console.log("\nDry run complete. Re-run with --commit.");
    return;
  }

  const result = await reindexAll({
    siteUrl,
    only,
    allowEmpty,
    log: (line) => console.log(`  ${line}`),
  });

  console.log("");
  for (const index of result.indexes) {
    console.log(
      `  ${index.index}: ${index.indexed}/${index.documents} indexed, ` +
        `${index.failed} failed, ${index.deleted} removed`,
    );
    if (index.warning) console.warn(`    ${index.warning}`);
    for (const err of index.errors.slice(0, 5)) console.error(`    ${err}`);
  }
  console.log(`\nDone in ${Math.round(result.durationMs / 100) / 10}s.`);
}

main().catch((error) => {
  console.error("\nIngest failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
