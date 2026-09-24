/**
 * Imports topical photographs from Unsplash into Hygraph.
 *
 *   npm run import-images              # report the plan, no writes
 *   npm run import-images -- --commit
 *
 * Why this exists rather than `createAsset(uploadUrl: ...)`:
 * handing Hygraph a remote URL means Hygraph fetches it on its own schedule,
 * which we cannot throttle and cannot verify. A rate-limited source then quietly
 * stores a placeholder image and the asset still reports ASSET_UPLOAD_COMPLETE.
 * Here we download the bytes ourselves, check them, and only then push them to
 * Hygraph's presigned S3 target — so a bad image can never reach the CMS.
 *
 * API budget: one search per UNIQUE keyword (44), free tier allows 50/hour.
 * Image downloads come from images.unsplash.com and do not count against it.
 *
 * Idempotent: an asset whose fileName already exists is skipped, so a partial
 * run can simply be repeated.
 */

import { gql, setDryRun } from "./lib/client";
import { ASSET_PREFIX, allPools, fileNameFor, type ImagePool } from "./data/imagery";

const accessKey = process.env.UNSPLASH_ACCESS_KEY;
if (!accessKey) throw new Error("UNSPLASH_ACCESS_KEY is not set (see .env.local.example)");

const commit = process.argv.includes("--commit");
setDryRun(!commit);

/** Anything smaller than this is a placeholder or an error page, not a photo. */
const MIN_BYTES = 15_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type UnsplashPhoto = {
  id: string;
  alt_description: string | null;
  urls: { raw: string };
  user: { name: string; links: { html: string } };
};

type Need = { pool: ImagePool; index: number; fileName: string };

async function existingFileNames(): Promise<Set<string>> {
  const names = new Set<string>();
  for (let skip = 0; ; skip += 100) {
    const data = await gql<{ assets: { fileName: string }[] }>(
      `query Existing($skip: Int!) {
         assets(first: 100, skip: $skip, stage: DRAFT, orderBy: fileName_ASC,
                where: { fileName_starts_with: "${ASSET_PREFIX}" }) { fileName }
       }`,
      { skip },
    );
    for (const a of data.assets) names.add(a.fileName);
    if (data.assets.length < 100) return names;
  }
}

async function search(keyword: string, count: number): Promise<UnsplashPhoto[]> {
  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", keyword);
  url.searchParams.set("per_page", String(Math.min(Math.max(count + 2, 5), 30)));
  url.searchParams.set("orientation", "landscape");
  url.searchParams.set("content_filter", "high");

  const res = await fetch(url, { headers: { Authorization: `Client-ID ${accessKey}` } });
  const remaining = res.headers.get("x-ratelimit-remaining");

  if (!res.ok) {
    throw new Error(`Unsplash ${res.status} for "${keyword}" (remaining: ${remaining}): ${await res.text()}`);
  }

  const json = (await res.json()) as { results: UnsplashPhoto[] };
  console.log(`  "${keyword}" -> ${json.results.length} results (api calls left: ${remaining})`);
  return json.results;
}

/** Downloads at a size suited to the layout and verifies it is a real JPEG. */
async function download(photo: UnsplashPhoto): Promise<Buffer> {
  const url = `${photo.urls.raw}&w=1600&h=1200&fit=crop&fm=jpg&q=80`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status} for ${photo.id}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < MIN_BYTES) {
    throw new Error(`Suspiciously small image for ${photo.id}: ${buffer.length} bytes`);
  }
  // JPEG magic number — catches an HTML error page served with a 200.
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error(`Not a JPEG for ${photo.id}`);
  }
  return buffer;
}

type PostData = {
  url: string;
  key: string;
  date: string;
  algorithm: string;
  credential: string;
  signature: string;
  policy: string;
  securityToken: string;
};

async function uploadToHygraph(need: Need, photo: UnsplashPhoto, bytes: Buffer) {
  const attribution = `Photo by ${photo.user.name} on Unsplash`;

  const created = await gql<{
    createAsset: { id: string; upload: { requestPostData: PostData } };
  }>(
    `mutation Create($data: AssetCreateInput!) {
       createAsset(data: $data) {
         id
         upload { requestPostData { url key date algorithm credential signature policy securityToken } }
       }
     }`,
    {
      data: {
        fileName: need.fileName,
        altText: (photo.alt_description ?? need.pool.keyword).slice(0, 200),
        caption: attribution,
      },
    },
  );

  const post = created.createAsset.upload.requestPostData;

  // S3 presigned POST: the policy fields must precede the file part.
  const form = new FormData();
  form.append("X-Amz-Date", post.date);
  form.append("X-Amz-Algorithm", post.algorithm);
  form.append("X-Amz-Credential", post.credential);
  form.append("X-Amz-Security-Token", post.securityToken);
  form.append("X-Amz-Signature", post.signature);
  form.append("Policy", post.policy);
  form.append("key", post.key);
  form.append("file", new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }), need.fileName);

  const res = await fetch(post.url, { method: "POST", body: form });
  if (!res.ok) {
    throw new Error(`S3 upload failed ${res.status} for ${need.fileName}: ${await res.text()}`);
  }

  return created.createAsset.id;
}

async function main() {
  // One search per unique keyword; pools sharing a keyword take different photos.
  const byKeyword = new Map<string, Need[]>();
  for (const pool of allPools) {
    for (let i = 1; i <= pool.count; i++) {
      const need: Need = { pool, index: i, fileName: fileNameFor(pool.key, i) };
      const list = byKeyword.get(pool.keyword) ?? [];
      list.push(need);
      byKeyword.set(pool.keyword, list);
    }
  }

  const have = await existingFileNames();
  let outstanding = 0;
  for (const needs of byKeyword.values()) {
    outstanding += needs.filter((n) => !have.has(n.fileName)).length;
  }

  console.log(
    `${byKeyword.size} unique keywords, ${outstanding} images to import ` +
      `(${have.size} already present)`,
  );

  if (outstanding === 0) {
    console.log("Nothing to do.");
    return;
  }

  if (!commit) {
    console.log("\nDry run. Planned searches:");
    for (const [keyword, needs] of byKeyword) {
      const todo = needs.filter((n) => !have.has(n.fileName));
      if (todo.length) console.log(`  ${keyword.padEnd(24)} -> ${todo.length} image(s)`);
    }
    console.log("\nRe-run with --commit to import.");
    return;
  }

  let imported = 0;
  const failures: string[] = [];

  for (const [keyword, needs] of byKeyword) {
    const todo = needs.filter((n) => !have.has(n.fileName));
    if (todo.length === 0) continue;

    let photos: UnsplashPhoto[];
    try {
      photos = await search(keyword, todo.length);
    } catch (error) {
      failures.push(`search "${keyword}": ${error instanceof Error ? error.message : error}`);
      continue;
    }

    for (const [i, need] of todo.entries()) {
      const photo = photos[i % Math.max(photos.length, 1)];
      if (!photo) {
        failures.push(`${need.fileName}: no results for "${keyword}"`);
        continue;
      }

      try {
        const bytes = await download(photo);
        await uploadToHygraph(need, photo, bytes);
        imported++;
        console.log(`    ${need.fileName} <- ${photo.id} (${Math.round(bytes.length / 1024)}kb)`);
      } catch (error) {
        failures.push(`${need.fileName}: ${error instanceof Error ? error.message : error}`);
      }

      await sleep(150);
    }
  }

  console.log(`\nImported ${imported} images.`);
  if (failures.length) {
    console.log(`${failures.length} failed:`);
    for (const f of failures.slice(0, 20)) console.log(`  ${f}`);
    console.log("Re-run to retry only what is missing.");
  }
}

main().catch((error) => {
  console.error("Import failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
