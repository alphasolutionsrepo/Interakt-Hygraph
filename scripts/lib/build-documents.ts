/**
 * Recovers each product's family from the seed corpus.
 *
 * Document assembly itself lives in src/interakt/build.ts so the reindex API
 * route can use it; only this part needs the seed data, and its output is baked
 * to src/interakt/product-lines.json by `npm run interakt:sample`.
 */

import { products as seedProducts } from "../data/products";

/**
 * slug -> product family name.
 *
 * Hygraph has no `productLine` field, so the family is recovered from the seed
 * corpus: a family's variants share a name prefix. Productionising this means
 * adding a real `productLine` field to the Hygraph model instead.
 */
export function buildProductLines(): Map<string, string> {
  const byFamily = new Map<string, typeof seedProducts>();
  for (const p of seedProducts) {
    const group = byFamily.get(p.imagePool) ?? [];
    group.push(p);
    byFamily.set(p.imagePool, group);
  }

  const lines = new Map<string, string>();
  for (const [, group] of byFamily) {
    const familyName = group
      .map((p) => p.name)
      .reduce((acc, name) => {
        let i = 0;
        while (i < acc.length && i < name.length && acc[i] === name[i]) i++;
        return acc.slice(0, i);
      })
      .trim()
      .replace(/[\s-]+$/, "");

    for (const p of group) lines.set(p.slug, familyName);
  }
  return lines;
}


export { buildAllDocuments } from "../../src/interakt/build";
