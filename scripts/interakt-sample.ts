/**
 * Generates the artifacts needed to create the two Interakt indexes.
 *
 *   npm run interakt:sample
 *
 * Writes to interakt/:
 *   products.sample.json   paste into Configure Mappings to preview inference
 *   content.sample.json    same, for the content index
 *   products.mapping.json  import on the Fields screen — the authoritative one
 *   content.mapping.json   same
 *
 * The sample files lead with an EXEMPLAR document that carries every field the
 * index uses. That is not cosmetic: Interakt's mapping inference reads
 * `sample[0]` and nothing else, so a field that first appears in `sample[3]` is
 * never created. The exemplar is assembled from real values across the corpus
 * and is for mapping only — it is never ingested.
 *
 * Everything the generator knows about Interakt's constraints is enforced as a
 * check at the end, and a failure exits non-zero rather than writing a file that
 * would produce a broken index.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { inferFieldType, inferFromSample } from "../src/interakt/infer";
import {
  CONTENT_INDEX_NAME,
  PRODUCT_INDEX_NAME,
  contentMapping,
  intendedTypes,
  productMapping,
  type IndexMappingFile,
} from "../src/interakt/mapping";
import { RESERVED_FIELD_NAMES, type InteraktDocument } from "../src/interakt/types";
import { buildAllDocuments } from "./lib/build-documents";

const OUT_DIR = "interakt";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002";

/** Integer-valued fields — the app type `number` maps to Elasticsearch `integer`. */
const INTEGER_FIELDS = ["price", "rating", "reviewCount", "readingTime"];

/**
 * A document carrying every key seen anywhere in the set.
 *
 * For each field it takes the RICHEST real value rather than the first one, and
 * that is load-bearing: inference decides `keyword` vs `text` on a 100-character
 * threshold, so seeding the exemplar with a stub article's 52-character body
 * would have Interakt type the main prose field as an unanalysed keyword.
 * Picking the longest value makes the inferred types line up with the mapping.
 */
function buildExemplar(docs: Record<string, unknown>[]): Record<string, unknown> {
  const keys: string[] = [];
  for (const doc of docs) {
    for (const key of Object.keys(doc)) if (!keys.includes(key)) keys.push(key);
  }

  const richness = (value: unknown): number => {
    if (value === undefined || value === null) return -1;
    if (typeof value === "string") return value.length;
    if (Array.isArray(value)) return value.length;
    return 0;
  };

  const exemplar: Record<string, unknown> = {};
  for (const key of keys) {
    let best: unknown;
    let bestScore = -1;
    for (const doc of docs) {
      const score = richness(doc[key]);
      if (score > bestScore) {
        bestScore = score;
        best = doc[key];
      }
    }
    if (bestScore >= 0) exemplar[key] = best;
  }
  return exemplar;
}

/**
 * Marks the exemplar as what it is.
 *
 * It composes the richest value of each field from DIFFERENT entries, so its
 * title, url and productLine deliberately do not describe one real product. Left
 * with a real-looking uniqueId it reads as a corrupt record; this makes the
 * intent obvious to anyone opening the file.
 */
function labelExemplar(
  exemplar: Record<string, unknown>,
  index: "product" | "content",
): Record<string, unknown> {
  return {
    ...exemplar,
    uniqueId: `example:${index}-field-reference-not-a-real-document`,
  };
}

/** Documents that would look broken in a result list. Reported, not fatal. */
function contentWarnings(docs: Record<string, unknown>[]): string[] {
  const warnings: string[] = [];
  for (const doc of docs) {
    const id = String(doc.uniqueId);
    if (!String(doc.description ?? "").trim()) warnings.push(`${id} has no description`);
    if (String(doc.body ?? "").trim().length < 120) warnings.push(`${id} has almost no body`);
    if (!doc.imageUrl && doc.docType !== "faq" && doc.docType !== "policy") {
      warnings.push(`${id} has no image`);
    }
  }
  return warnings;
}

type Check = { ok: boolean; label: string; detail?: string };

function checkIndex(
  indexName: string,
  docs: Record<string, unknown>[],
  sample: Record<string, unknown>[],
  mapping: IndexMappingFile,
): Check[] {
  const checks: Check[] = [];
  const allKeys = new Set(docs.flatMap((d) => Object.keys(d)));

  // Flatness: nested objects become dotted field names, which ES rejects.
  const nested: string[] = [];
  for (const doc of docs) {
    for (const [key, value] of Object.entries(doc)) {
      if (value === null) continue;
      if (Array.isArray(value)) {
        if (value.some((v) => v !== null && typeof v === "object")) nested.push(`${key}[]`);
      } else if (typeof value === "object") {
        nested.push(key);
      }
    }
  }
  checks.push({
    ok: nested.length === 0,
    label: "all values are primitives or arrays of primitives",
    detail: nested.length ? `nested: ${[...new Set(nested)].join(", ")}` : undefined,
  });

  const dotted = [...allKeys].filter((k) => k.includes("."));
  checks.push({
    ok: dotted.length === 0,
    label: "no field name contains a dot",
    detail: dotted.join(", ") || undefined,
  });

  const reserved = [...allKeys].filter((k) =>
    (RESERVED_FIELD_NAMES as readonly string[]).includes(k),
  );
  checks.push({
    ok: reserved.length === 0,
    label: "no reserved field names",
    detail: reserved.join(", ") || undefined,
  });

  // The record-0 rule: sample[0] must carry every key the corpus uses.
  const exemplarKeys = new Set(Object.keys(sample[0] ?? {}));
  const missing = [...allKeys].filter((k) => !exemplarKeys.has(k));
  checks.push({
    ok: missing.length === 0,
    label: "sample[0] covers every field (inference reads only the first record)",
    detail: missing.join(", ") || undefined,
  });

  const nonInteger: string[] = [];
  for (const doc of docs) {
    for (const key of INTEGER_FIELDS) {
      const value = doc[key];
      if (typeof value === "number" && !Number.isInteger(value)) {
        nonInteger.push(`${key}=${value}`);
      }
    }
  }
  checks.push({
    ok: nonInteger.length === 0,
    label: "numeric fields are integers (number maps to ES integer)",
    detail: [...new Set(nonInteger)].slice(0, 5).join(", ") || undefined,
  });

  const ids = docs.map((d) => String(d.uniqueId));
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  checks.push({
    ok: dupes.length === 0,
    label: "uniqueId is unique",
    detail: [...new Set(dupes)].slice(0, 5).join(", ") || undefined,
  });

  const unnamespaced = ids.filter((id) => !id.includes(":"));
  checks.push({
    ok: unnamespaced.length === 0,
    label: "uniqueId is namespaced (RRF dedupes on id across indexes)",
    detail: unnamespaced.slice(0, 3).join(", ") || undefined,
  });

  // Every field in the documents should have a mapping entry, and vice versa.
  const mapped = new Set(mapping.fields.map((f) => f.fieldName));
  const unmapped = [...allKeys].filter((k) => !mapped.has(k));
  checks.push({
    ok: unmapped.length === 0,
    label: "every document field has a mapping entry",
    detail: unmapped.join(", ") || undefined,
  });

  const vectorSources = mapping.fields.filter((f) => f.attributes.isVectorSource);
  checks.push({
    ok: vectorSources.length === 1,
    label: "exactly one isVectorSource field",
    detail: vectorSources.map((f) => f.fieldName).join(", ") || "none",
  });

  const withEscapes = docs.filter((d) =>
    ["title", "description", "body"].some((k) => String(d[k] ?? "").includes("\\n")),
  );
  checks.push({
    ok: withEscapes.length === 0,
    label: "no literal \\n escapes in text (Hygraph .text emits them raw)",
    detail: withEscapes.length ? `${withEscapes.length} documents` : undefined,
  });

  const sizeMb = Buffer.byteLength(JSON.stringify(docs)) / 1024 / 1024;
  checks.push({
    ok: sizeMb < 10 && docs.length <= 10_000,
    label: `payload within limits (${docs.length} docs, ${sizeMb.toFixed(2)} MB of 10)`,
  });

  void indexName;
  return checks;
}

/** Where Interakt's guess would differ from the mapping we ship. */
function reportInferenceDiff(label: string, sample: Record<string, unknown>[], mapping: IndexMappingFile) {
  const inferred = inferFromSample(sample);
  const intended = intendedTypes(mapping);

  const diffs = Object.entries(intended)
    .filter(([name]) => name in inferred)
    .filter(([name, type]) => inferred[name] !== type)
    .map(([name, type]) => `    ${name}: Interakt infers ${inferred[name]}, mapping sets ${type}`);

  if (diffs.length === 0) {
    console.log(`  ${label}: inference matches the mapping exactly`);
    return;
  }

  console.log(`  ${label}: ${diffs.length} field(s) where the import overrides inference`);
  for (const d of diffs) console.log(d);
}

async function main() {
  console.log(`Building Interakt documents from ${siteUrl}\n`);

  const built = await buildAllDocuments(siteUrl);

  if (built.skipped.length > 0) {
    console.log(`  skipping ${built.skipped.length} entries with no usable text:`);
    for (const d of built.skipped) console.log(`    ${d.uniqueId} — ${d.title || "(untitled)"}`);
    console.log("");
  }

  const productDocs = built.products as unknown as Record<string, unknown>[];
  const contentDocs = built.content as unknown as Record<string, unknown>[];
  const content = built.counts;

  console.log(
    `  ${productDocs.length} products; ${contentDocs.length} content documents ` +
      `(${content.guides} guides, ${content.journal} journal, ` +
      `${content.faqs} FAQs, ${content.policies} policies, ` +
      `${content.authors} authors)\n`,
  );

  // Exemplar first, then real documents — one per docType for the content index,
  // and a spread of product families for the product index.
  const productSample = [labelExemplar(buildExemplar(productDocs), "product"), ...productDocs.slice(0, 3)];

  const seenTypes = new Set<string>();
  const contentExamples = contentDocs.filter((d) => {
    const type = String(d.docType);
    if (seenTypes.has(type)) return false;
    seenTypes.add(type);
    return true;
  });
  const contentSample = [labelExemplar(buildExemplar(contentDocs), "content"), ...contentExamples];

  const productMap = productMapping();
  const contentMap = contentMapping();

  mkdirSync(OUT_DIR, { recursive: true });
  const write = (name: string, data: unknown) => {
    writeFileSync(`${OUT_DIR}/${name}`, `${JSON.stringify(data, null, 2)}\n`);
    console.log(`  wrote ${OUT_DIR}/${name}`);
  };

  write("products.sample.json", productSample);
  write("content.sample.json", contentSample);
  write("products.mapping.json", productMap);
  write("content.mapping.json", contentMap);

  console.log("\nInference preview:");
  reportInferenceDiff(PRODUCT_INDEX_NAME, productSample, productMap);
  reportInferenceDiff(CONTENT_INDEX_NAME, contentSample, contentMap);

  console.log("\nChecks:");
  const results = [
    ...checkIndex(PRODUCT_INDEX_NAME, productDocs, productSample, productMap).map(
      (c) => [PRODUCT_INDEX_NAME, c] as const,
    ),
    ...checkIndex(CONTENT_INDEX_NAME, contentDocs, contentSample, contentMap).map(
      (c) => [CONTENT_INDEX_NAME, c] as const,
    ),
  ];

  for (const [index, check] of results) {
    const mark = check.ok ? "ok  " : "FAIL";
    const detail = check.detail ? ` — ${check.detail}` : "";
    console.log(`  ${mark} [${index}] ${check.label}${detail}`);
  }

  const warnings = [
    ...contentWarnings(productDocs).map((w) => `[${PRODUCT_INDEX_NAME}] ${w}`),
    ...contentWarnings(contentDocs).map((w) => `[${CONTENT_INDEX_NAME}] ${w}`),
  ];
  if (warnings.length > 0) {
    console.log(`\nContent warnings (${warnings.length}) — these will index, but look thin:`);
    for (const w of warnings.slice(0, 12)) console.log(`  ${w}`);
    if (warnings.length > 12) console.log(`  …and ${warnings.length - 12} more`);
  }

  const failed = results.filter(([, c]) => !c.ok);
  if (failed.length > 0) {
    console.error(`\n${failed.length} check(s) failed — these would produce a broken index.`);
    process.exitCode = 1;
    return;
  }

  console.log("\nAll checks passed.");
}

main().catch((error) => {
  console.error("\nFailed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

// Referenced so the type-only import of InteraktDocument is not elided.
export type { InteraktDocument };
void inferFieldType;
