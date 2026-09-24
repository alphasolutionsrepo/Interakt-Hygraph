/**
 * Replaces specific imported images whose subject came out wrong.
 *
 * Keyword search gets most photos right but not all — "rain jacket" returned a
 * glass of brown liquid, "map compass" an analog watch. This re-runs those few
 * with a more specific query and swaps the bytes IN PLACE, so the filename (and
 * therefore every content reference to it) is preserved.
 *
 * `updateAsset(reUpload: true)` returns a fresh presigned target. It blanks the
 * fileName unless you set it in the same mutation — which is why fileName is
 * always passed here. An asset left in ASSET_UPDATE_PENDING is invisible to
 * content queries but still breaks publishing, so a failure must be re-run.
 *
 *   npm run refine-images              # show the plan
 *   npm run refine-images -- --commit
 */

import { gql, setDryRun } from "./lib/client";

const accessKey = process.env.UNSPLASH_ACCESS_KEY;
if (!accessKey) throw new Error("UNSPLASH_ACCESS_KEY is not set");

const commit = process.argv.includes("--commit");
setDryRun(!commit);

/**
 * fileName -> query, optionally with which result to take.
 *
 * The index matters: two slots given the same query take the same top photo,
 * which is very visible when both appear in one product gallery.
 */
const REFINEMENTS: Record<string, { query: string; pick?: number }> = {
  "img-loft-sleeping-mat-01.jpg": { query: "camping sleeping pad mat", pick: 1 },
  "img-loft-sleeping-mat-03.jpg": { query: "tent interior sleeping", pick: 2 },
  "img-ed-navigation-01.jpg": { query: "orienteering compass forest", pick: 1 },
  "img-ember-down-bootie-03.jpg": { query: "wool slippers feet", pick: 1 },
};

type Photo = {
  alt_description: string | null;
  urls: { raw: string };
  user: { name: string };
};

async function search(query: string): Promise<Photo[]> {
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape&content_filter=high`;
  const res = await fetch(url, { headers: { Authorization: `Client-ID ${accessKey}` } });
  if (!res.ok) throw new Error(`Unsplash ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { results: Photo[] };
  console.log(`  "${query}" (calls left: ${res.headers.get("x-ratelimit-remaining")})`);
  return body.results;
}

async function replace(fileName: string, photo: Photo) {
  const bytes = Buffer.from(
    await (await fetch(`${photo.urls.raw}&w=1600&h=1200&fit=crop&fm=jpg&q=80`)).arrayBuffer(),
  );
  if (bytes.length < 15_000 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error(`bad image bytes for ${fileName}`);
  }

  const found = await gql<{ assets: { id: string }[] }>(
    `query Find($f: String!) { assets(first: 1, stage: DRAFT, where: { fileName: $f }) { id } }`,
    { f: fileName },
  );
  if (found.assets.length === 0) throw new Error(`no asset named ${fileName}`);

  const alt = String(photo.alt_description ?? "").replace(/"/g, "").slice(0, 180);
  const upd = await gql<any>(
    `mutation Re($id: ID!, $f: String!, $alt: String!, $cap: String!) {
       updateAsset(where: { id: $id }, data: { reUpload: true, fileName: $f, altText: $alt, caption: $cap }) {
         id upload { requestPostData { url key date algorithm credential signature policy securityToken } }
       }
     }`,
    { id: found.assets[0].id, f: fileName, alt, cap: `Photo by ${photo.user.name} on Unsplash` },
  );

  const pd = upd.updateAsset.upload.requestPostData;
  const form = new FormData();
  form.append("X-Amz-Date", pd.date);
  form.append("X-Amz-Algorithm", pd.algorithm);
  form.append("X-Amz-Credential", pd.credential);
  form.append("X-Amz-Security-Token", pd.securityToken);
  form.append("X-Amz-Signature", pd.signature);
  form.append("Policy", pd.policy);
  form.append("key", pd.key.replace("${filename}", fileName));
  form.append("file", new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }), fileName);

  const up = await fetch(pd.url, { method: "POST", body: form });
  if (!up.ok) throw new Error(`S3 ${up.status} for ${fileName}: ${await up.text()}`);
  console.log(`    ${fileName} <- ${alt.slice(0, 50)}`);
}

async function main() {
  const entries = Object.entries(REFINEMENTS);
  console.log(`${entries.length} images to refine`);

  if (!commit) {
    for (const [file, r] of entries) console.log(`  ${file.padEnd(34)} -> "${r.query}" [${r.pick ?? 0}]`);
    console.log("\nRe-run with --commit.");
    return;
  }

  const failures: string[] = [];
  for (const [fileName, { query, pick = 0 }] of entries) {
    try {
      const results = await search(query);
      const photo = results[pick] ?? results[0];
      if (!photo) throw new Error(`no results for "${query}"`);
      await replace(fileName, photo);
    } catch (error) {
      failures.push(`${fileName}: ${error instanceof Error ? error.message : error}`);
    }
  }

  if (failures.length) {
    console.log(`\n${failures.length} failed — RE-RUN, a half-updated asset blocks publishing:`);
    for (const f of failures) console.log(`  ${f}`);
  } else {
    console.log("\nAll refined.");
  }
}

main().catch((e) => {
  console.error("Refine failed:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
