/**
 * Deletes unreferenced seed assets left behind by a failed image import.
 *
 * Context: an attempt to source topical photos from loremflickr hit its rate
 * limit, and `updateAsset(reUpload: true)` renamed each asset to the remote
 * URL's last path segment — leaving assets literally named `rain-jacket?lock=10358`
 * holding a placeholder image. This removes them.
 *
 * Guard rails, because deletes are irreversible:
 *  - Only matches assets whose fileName contains the marker (default "?lock="),
 *    which no legitimate asset in this project uses.
 *  - Re-checks every relation field per asset and refuses to delete anything
 *    still referenced by a product, article, post, category or author.
 *  - Dry run by default.
 *
 *   npm run cleanup-assets                        # report only
 *   npm run cleanup-assets -- --commit
 *   npm run cleanup-assets -- --match=foo --commit
 */

import { gql, setDryRun } from "./lib/client";

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const matchArg = args.find((a) => a.startsWith("--match="));
const marker = matchArg ? matchArg.slice("--match=".length) : "?lock=";

setDryRun(!commit);

type Candidate = {
  id: string;
  fileName: string;
  productImageProduct: unknown[];
  articleImageArticle: unknown[];
  coverImageBlogPost: unknown[];
  heroImageProductCategory: unknown[];
  avatarAuthor: unknown[];
  businessLogoSellerInformation: unknown[];
  imagesCustomProductPart: unknown[];
};

const REFERENCE_FIELDS = [
  "productImageProduct",
  "articleImageArticle",
  "coverImageBlogPost",
  "heroImageProductCategory",
  "avatarAuthor",
  "businessLogoSellerInformation",
  "imagesCustomProductPart",
] as const;

async function findCandidates(): Promise<Candidate[]> {
  const out: Candidate[] = [];

  for (let skip = 0; ; skip += 50) {
    const data = await gql<{ assets: Candidate[] }>(
      `query Candidates($skip: Int!, $marker: String!) {
         assets(first: 50, skip: $skip, stage: DRAFT, orderBy: fileName_ASC,
                where: { fileName_contains: $marker }) {
           id fileName
           productImageProduct(first: 1) { id }
           articleImageArticle(first: 1) { id }
           coverImageBlogPost(first: 1) { id }
           heroImageProductCategory(first: 1) { id }
           avatarAuthor(first: 1) { id }
           businessLogoSellerInformation(first: 1) { id }
           imagesCustomProductPart(first: 1) { id }
         }
       }`,
      { skip, marker },
    );
    out.push(...data.assets);
    if (data.assets.length < 50) return out;
  }
}

function isReferenced(asset: Candidate): boolean {
  return REFERENCE_FIELDS.some((field) => (asset[field] ?? []).length > 0);
}

async function main() {
  const candidates = await findCandidates();
  const referenced = candidates.filter(isReferenced);
  const orphans = candidates.filter((a) => !isReferenced(a));

  console.log(`Assets matching ${JSON.stringify(marker)}: ${candidates.length}`);
  console.log(`  unreferenced (deletable): ${orphans.length}`);
  console.log(`  still referenced (kept):  ${referenced.length}`);

  for (const asset of referenced) console.log(`    KEEP ${asset.fileName}`);

  if (orphans.length === 0) return;

  if (!commit) {
    console.log("\nDry run. Sample of what would be deleted:");
    for (const asset of orphans.slice(0, 5)) console.log(`    ${asset.fileName}`);
    console.log("Re-run with --commit to delete.");
    return;
  }

  let deleted = 0;
  for (const asset of orphans) {
    await gql(`mutation Del($id: ID!) { deleteAsset(where: { id: $id }) { id } }`, {
      id: asset.id,
    });
    deleted++;
    if (deleted % 20 === 0) console.log(`  deleted ${deleted}/${orphans.length}`);
  }

  console.log(`Deleted ${deleted} unreferenced assets.`);
}

main().catch((error) => {
  console.error("Cleanup failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
