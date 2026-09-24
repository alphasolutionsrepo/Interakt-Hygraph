/**
 * Seeds the Meridian demo content into Hygraph.
 *
 * Usage:
 *   npm run seed                 # dry run, nothing persists
 *   npm run seed -- --commit     # actually write
 *   npm run seed -- --commit --phase=2,3
 *
 * Design notes that are easy to get wrong:
 *
 * - Every alias in a batch must carry a DISTINCT unique-field value in its
 *   `create` branch, even for rows that take the `update` path. Hygraph
 *   validates all create inputs up front and a collision surfaces only as
 *   "Input value does not match the expected format."
 * - Relation syntax differs by branch: `connect` in create, `set` in update.
 *   `connect` is additive, so using it in update would append duplicate links
 *   on every reseed.
 * - Components use `create` in both branches; `upsert` needs a component
 *   instance id we do not have.
 * - Assets are the only entity with no unique key besides id, so they cannot be
 *   upserted. They are discovered by filename prefix and reused.
 */

import { gql, runBatched, setDryRun, type AliasedOp } from "./lib/client";
import { md } from "./lib/richtext";
import { categories, authors } from "./data/taxonomy";
import { products, legacyProductSlugRewrites } from "./data/products";
import { articles, blogPosts } from "./data/editorial";
import { faqs, policies } from "./data/support";
import {
  ASSET_PREFIX,
  allPools,
  fileNameFor,
  poolForCategory,
  poolForTags,
} from "./data/imagery";

const LOCALE = "es";

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const phaseArg = args.find((a) => a.startsWith("--phase="));
const phases = phaseArg
  ? new Set(phaseArg.slice("--phase=".length).split(",").map((p) => p.trim()))
  : null;

const shouldRun = (phase: string) => !phases || phases.has(phase);

setDryRun(!commit);

/** Builds the localizations payload for both upsert branches. */
function localized(data: Record<string, unknown>) {
  return {
    create: { localizations: { create: [{ locale: LOCALE, data }] } },
    update: { localizations: { upsert: [{ locale: LOCALE, create: data, update: data }] } },
  };
}

// ---------------------------------------------------------------- phase 0

type AssetRef = { id: string; fileName: string };

/** poolKey -> asset ids, in pool order. */
export type AssetIndex = Map<string, string[]>;

async function discoverAssets(): Promise<AssetRef[]> {
  const out: AssetRef[] = [];

  // Hygraph caps `first` at 100, so this has to page.
  for (let skip = 0; ; skip += 100) {
    const data = await gql<{ assets: AssetRef[] }>(
      `query SeedAssets($skip: Int!) {
         assets(first: 100, skip: $skip, stage: DRAFT, where: { fileName_starts_with: "${ASSET_PREFIX}" }, orderBy: fileName_ASC) {
           id fileName
         }
       }`,
      { skip },
    );
    out.push(...data.assets);
    if (data.assets.length < 100) return out;
  }
}

/** Groups discovered assets back into their pools by filename. */
function indexAssets(assets: AssetRef[]): AssetIndex {
  const byName = new Map(assets.map((a) => [a.fileName, a.id]));
  const index: AssetIndex = new Map();

  for (const pool of allPools) {
    const ids: string[] = [];
    for (let i = 1; i <= pool.count; i++) {
      const id = byName.get(fileNameFor(pool.key, i));
      if (id) ids.push(id);
    }
    if (ids.length > 0) index.set(pool.key, ids);
  }

  return index;
}

/** Picks from a pool, falling back to any available image so a missing pool never breaks a page. */
function pick(index: AssetIndex, poolKey: string, offset = 0): string | undefined {
  const ids = index.get(poolKey);
  if (ids && ids.length > 0) return ids[offset % ids.length];
  const any = [...index.values()].flat();
  return any.length > 0 ? any[offset % any.length] : undefined;
}

/**
 * Assets are imported separately by `npm run import-images`, which downloads
 * from Unsplash and verifies the bytes before uploading. This phase only
 * discovers what is already there and groups it into pools.
 */
async function phase0(): Promise<AssetIndex> {
  console.log("\nPhase 0 — assets");
  const existing = await discoverAssets();
  const index = indexAssets(existing);
  const wanted = allPools.reduce((n, pool) => n + pool.count, 0);

  console.log(`  ${existing.length} of ${wanted} topical assets present, in ${index.size} pools`);

  if (existing.length < wanted) {
    console.log("  run `npm run import-images -- --commit` to fetch the rest");
  }

  if (commit && existing.length > 0) {
    await waitForUploads(existing.slice(0, 100).map((a) => a.id));
  }

  return index;
}

async function waitForUploads(ids: string[]) {
  const deadline = Date.now() + 5 * 60 * 1000;
  process.stdout.write("  waiting for uploads to complete");

  while (Date.now() < deadline) {
    const data = await gql<{
      assets: { id: string; fileName: string; upload: { status: string } | null }[];
    }>(
      `query AssetStatus($ids: [ID!]) {
         assets(first: 100, stage: DRAFT, where: { id_in: $ids }) { id fileName upload { status } }
       }`,
      { ids },
    );

    const failed = data.assets.filter((a) => a.upload?.status === "ASSET_ERROR_UPLOAD");
    if (failed.length > 0) {
      throw new Error(`Asset upload failed for: ${failed.map((a) => a.fileName).join(", ")}`);
    }

    const pending = data.assets.filter(
      (a) => a.upload && a.upload.status !== "ASSET_UPLOAD_COMPLETE",
    );
    if (pending.length === 0) {
      process.stdout.write(" done\n");
      return;
    }

    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 3000));
  }

  throw new Error("Timed out waiting for asset uploads");
}

// ---------------------------------------------------------------- phase 1

async function phase1(assets: AssetIndex) {
  console.log("\nPhase 1 — categories, authors, policies, FAQs");

  // Categories
  await runBatched(
    "categories",
    categories.map((category, index) => {
      const es = category.es
        ? localized({ categoryName: category.es.name, excerpt: category.es.excerpt })
        : { create: {}, update: {} };
      // Category heroes come from that category's own pool.
      const heroId = pick(assets, poolForCategory(category.slug));
      const base = {
        categoryName: category.name,
        slug: category.slug,
        excerpt: category.excerpt,
        description: md(category.description),
      };
      return {
        declarations: [
          `$cc${index}: ProductCategoryCreateInput!`,
          `$cu${index}: ProductCategoryUpdateInput!`,
        ],
        selection: `c${index}: upsertProductCategory(where: { slug: "${category.slug}" }, upsert: { create: $cc${index}, update: $cu${index} }) { id }`,
        variables: {
          [`cc${index}`]: {
            ...base,
            ...es.create,
            ...(heroId ? { heroImage: { connect: { id: heroId } } } : {}),
          },
          [`cu${index}`]: {
            ...base,
            ...es.update,
            ...(heroId ? { heroImage: { connect: { id: heroId } } } : {}),
          },
        },
      };
    }),
  );

  // Authors
  await runBatched(
    "authors",
    authors.map((author, index) => {
      // No portrait pool — authors reuse the generic hiking imagery.
      const avatarId = pick(assets, "ed-mountain-hiking", index);
      const base = {
        name: author.name,
        slug: author.slug,
        title: author.title,
        description: author.description,
        bio: md(author.bio),
      };
      return {
        declarations: [`$ac${index}: AuthorCreateInput!`, `$au${index}: AuthorUpdateInput!`],
        selection: `a${index}: upsertAuthor(where: { slug: "${author.slug}" }, upsert: { create: $ac${index}, update: $au${index} }) { id }`,
        variables: {
          [`ac${index}`]: {
            ...base,
            ...(avatarId ? { avatar: { connect: { id: avatarId } } } : {}),
          },
          [`au${index}`]: {
            ...base,
            ...(avatarId ? { avatar: { connect: { id: avatarId } } } : {}),
          },
        },
      };
    }),
  );

  // Policy pages
  await runBatched(
    "policies",
    policies.map((policy, index) => {
      const es = policy.es
        ? localized({ title: policy.es.title, summary: policy.es.summary })
        : { create: {}, update: {} };
      const base = {
        title: policy.title,
        slug: policy.slug,
        summary: policy.summary,
        effectiveDate: policy.effectiveDate,
        body: md(policy.body),
        seo: { create: { title: `${policy.title} | Meridian`, description: policy.summary.slice(0, 155) } },
      };
      return {
        declarations: [`$pc${index}: PolicyPageCreateInput!`, `$pu${index}: PolicyPageUpdateInput!`],
        selection: `p${index}: upsertPolicyPage(where: { slug: "${policy.slug}" }, upsert: { create: $pc${index}, update: $pu${index} }) { id }`,
        variables: {
          [`pc${index}`]: { ...base, ...es.create },
          [`pu${index}`]: { ...base, ...es.update },
        },
      };
    }),
  );

  // FAQs
  await runBatched(
    "faqs",
    faqs.map((faq, index) => {
      const es = faq.es ? localized({ question: faq.es.question }) : { create: {}, update: {} };
      const base = {
        question: faq.question,
        slug: faq.slug,
        category: faq.category,
        sortOrder: faq.sortOrder,
        answer: md(faq.answer),
      };
      return {
        declarations: [`$fc${index}: FaqItemCreateInput!`, `$fu${index}: FaqItemUpdateInput!`],
        selection: `f${index}: upsertFaqItem(where: { slug: "${faq.slug}" }, upsert: { create: $fc${index}, update: $fu${index} }) { id }`,
        variables: {
          [`fc${index}`]: { ...base, ...es.create },
          [`fu${index}`]: { ...base, ...es.update },
        },
      };
    }),
  );
}

// --------------------------------------------------------------- phase 1b

async function phase1b() {
  console.log("\nPhase 1b — backfilling legacy entries");

  // The two original authors have no slug, which blocks the M7 migration that
  // makes slug required. Match them by id and derive a slug from the name.
  const legacyAuthors = await gql<{ authors: { id: string; name: string | null; slug: string | null }[] }>(
    `query LegacyAuthors { authors(first: 50, stage: DRAFT) { id name slug } }`,
  );
  const needSlug = legacyAuthors.authors.filter((a) => !a.slug);

  if (needSlug.length > 0) {
    await runBatched(
      "legacy-authors",
      needSlug.map((author, index) => {
        const slug =
          (author.name ?? `author-${index}`)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || `legacy-author-${index}`;
        return {
          declarations: [`$la${index}: AuthorUpdateInput!`],
          selection: `la${index}: updateAuthor(where: { id: "${author.id}" }, data: $la${index}) { id }`,
          variables: { [`la${index}`]: { slug: `${slug}-legacy` } },
        };
      }),
    );
  } else {
    console.log("  [legacy-authors] nothing to backfill");
  }

  // Same for articles with a null slug.
  const legacyArticles = await gql<{ articles: { id: string; title: string | null; slug: string | null }[] }>(
    `query LegacyArticles { articles(first: 100, stage: DRAFT) { id title slug } }`,
  );
  const articlesNeedSlug = legacyArticles.articles.filter((a) => !a.slug);

  if (articlesNeedSlug.length > 0) {
    await runBatched(
      "legacy-articles",
      articlesNeedSlug.map((article, index) => {
        const slug =
          (article.title ?? `article-${index}`)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || `legacy-article-${index}`;
        return {
          declarations: [`$lr${index}: ArticleUpdateInput!`],
          selection: `lr${index}: updateArticle(where: { id: "${article.id}" }, data: $lr${index}) { id }`,
          variables: { [`lr${index}`]: { slug } },
        };
      }),
    );
  } else {
    console.log("  [legacy-articles] nothing to backfill");
  }

  // Copy the one legacy BlogPost body into the new localized `content` field.
  const legacyPosts = await gql<{
    blogPosts: { id: string; slug: string | null; body: { raw: unknown } | null; content: { raw: unknown } | null }[];
  }>(`query LegacyPosts { blogPosts(first: 100, stage: DRAFT) { id slug body { raw } content { raw } } }`);
  const needContent = legacyPosts.blogPosts.filter((p) => p.body?.raw && !p.content?.raw);

  if (needContent.length > 0) {
    await runBatched(
      "legacy-posts",
      needContent.map((post, index) => ({
        declarations: [`$lp${index}: BlogPostUpdateInput!`],
        selection: `lp${index}: updateBlogPost(where: { id: "${post.id}" }, data: $lp${index}) { id }`,
        // The read shape is { raw: {children} }; the write shape is the bare AST.
        variables: { [`lp${index}`]: { content: (post.body!.raw as { children: unknown[] }) } },
      })),
    );
  } else {
    console.log("  [legacy-posts] nothing to backfill");
  }

  // Rewrite the nine numeric product slugs. upsertProduct matches on the OLD
  // slug and the update branch rewrites productSlug itself, so no orphans.
  const current = await gql<{ products: { id: string; productSlug: string }[] }>(
    `query LegacyProducts { products(first: 100, stage: DRAFT) { id productSlug } }`,
  );
  const present = new Set(current.products.map((p) => p.productSlug));
  const pending = legacyProductSlugRewrites.filter((r) => present.has(r.from));

  if (pending.length === 0) {
    console.log("  [legacy-products] slugs already rewritten");
    // The copy still needs checking — the slug rename and the localized copy
    // are applied by two different mutations.
    await relabelLegacyProducts();
    return;
  }

  await runBatched(
    "legacy-products",
    pending.map((rewrite, index) => ({
      declarations: [`$gc${index}: ProductCreateInput!`, `$gu${index}: ProductUpdateInput!`],
      selection: `g${index}: upsertProduct(where: { productSlug: "${rewrite.from}" }, upsert: { create: $gc${index}, update: $gu${index} }) { id productSlug }`,
      variables: {
        // Distinct create payload per alias — see the note at the top of the file.
        [`gc${index}`]: { productName: rewrite.name, productSlug: rewrite.to },
        [`gu${index}`]: {
          productSlug: rewrite.to,
          brand: "Meridian",
          inStock: true,
          tags: ["archive"],
        },
      },
    })),
  );

  await relabelLegacyProducts();
}

/**
 * Rewrites the localized copy on the archive products.
 *
 * Separate from the upsert above on purpose: in an upsert's `update` branch
 * Hygraph applies the non-localized fields (slug, brand, tags) and silently
 * ignores the localized ones, so these nine entries kept their original
 * scraped product names while everything else about them changed. A plain
 * updateProduct does set them.
 */
async function relabelLegacyProducts() {
  const current = await gql<{ products: { id: string; productSlug: string }[] }>(
    `query LegacyNames {
       products(first: 100, stage: DRAFT, where: { productSlug_in: ${JSON.stringify(
         legacyProductSlugRewrites.map((r) => r.to),
       )} }) { id productSlug }
     }`,
  );

  const byId = new Map(current.products.map((p) => [p.productSlug, p.id]));
  const ops = legacyProductSlugRewrites
    .filter((rewrite) => byId.has(rewrite.to))
    .map((rewrite, index) => ({
      declarations: [`$rl${index}: ProductUpdateInput!`],
      selection: `rl${index}: updateProduct(where: { id: "${byId.get(rewrite.to)}" }, data: $rl${index}) { id }`,
      variables: {
        [`rl${index}`]: {
          productName: rewrite.name,
          shortDescription: rewrite.shortDescription,
          productDescription: md(rewrite.description),
          seo: {
            create: {
              title: `${rewrite.name} | Meridian`,
              description: rewrite.shortDescription.slice(0, 155),
            },
          },
        },
      },
    }));

  if (ops.length === 0) {
    console.log("  [legacy-names] nothing to relabel");
    return;
  }

  await runBatched("legacy-names", ops);
}

// ---------------------------------------------------------------- phase 2

async function phase2(assets: AssetIndex) {
  console.log(`\nPhase 2 — ${products.length} products`);
  if (assets.size === 0) {
    console.log("  no assets available, products will be created without images");
  }

  await runBatched(
    "products",
    products.map((product, index) => {
      const es = localized({
        productName: product.es!.name,
        shortDescription: product.es!.shortDescription,
      });

      // Images come from the product family's own pool, so a down jacket shows a
      // down jacket. The offset varies by position so the five variants of a
      // family do not all lead with the same photograph.
      const imageIds = [
        pick(assets, product.imagePool, index),
        pick(assets, product.imagePool, index + 1),
      ].filter((id): id is string => Boolean(id));

      const variant = product.variant
        ? {
            productVariant: {
              create: {
                productType: {
                  create: {
                    [product.variant.kind]:
                      product.variant.kind === "Clothing" || product.variant.kind === "Shoe"
                        ? { size: (product.variant as { size: string }).size, color: (product.variant as { color: string }).color }
                        : { color: (product.variant as { color: string }).color },
                  },
                },
              },
            },
          }
        : {};

      const base = {
        productName: product.name,
        productSlug: product.slug,
        brand: product.brand,
        sku: product.sku,
        material: product.material,
        tags: product.tags,
        rating: product.rating,
        reviewCount: product.reviewCount,
        inStock: product.inStock,
        productPrice: product.price,
        shortDescription: product.shortDescription,
        productDescription: md(product.description),
        seo: { create: product.seo },
        ...variant,
      };

      return {
        declarations: [`$rc${index}: ProductCreateInput!`, `$ru${index}: ProductUpdateInput!`],
        selection: `r${index}: upsertProduct(where: { productSlug: "${product.slug}" }, upsert: { create: $rc${index}, update: $ru${index} }) { id }`,
        variables: {
          [`rc${index}`]: {
            ...base,
            ...es.create,
            productCategories: { connect: product.categories.map((slug) => ({ slug })) },
            ...(imageIds.length ? { productImage: { connect: imageIds.map((id) => ({ id })) } } : {}),
          },
          [`ru${index}`]: {
            ...base,
            ...es.update,
            // `set` rather than `connect`: connect is additive and would append
            // duplicate category links on every reseed.
            productCategories: { set: product.categories.map((slug) => ({ slug })) },
            ...(imageIds.length ? { productImage: { set: imageIds.map((id) => ({ id })) } } : {}),
          },
        },
      };
    }),
  );
}

// ---------------------------------------------------------------- phase 3

async function phase3(assets: AssetIndex) {
  console.log(`\nPhase 3 — ${articles.length} articles, ${blogPosts.length} blog posts`);
  const productSlugs = new Set(products.map((p) => p.slug));

  await runBatched(
    "articles",
    articles.map((article, index) => {
      const es = article.es
        ? localized({ title: article.es.title, excerpt: article.es.excerpt })
        : { create: {}, update: {} };
      // Editorial imagery is chosen from the article's own tags.
      const imageId = pick(assets, poolForTags(article.tags), index);
      // Only connect products that this seed actually creates.
      const featured = (article.featuredProducts ?? []).filter((s) => productSlugs.has(s));

      const base = {
        title: article.title,
        slug: article.slug,
        excerpt: article.excerpt,
        articleType: article.articleType,
        postDate: article.postDate,
        readingTime: article.readingTime,
        tags: article.tags,
        articleText: md(article.body),
        seo: {
          create: { title: `${article.title} | Meridian`, description: article.excerpt.slice(0, 155) },
        },
      };

      return {
        declarations: [`$tc${index}: ArticleCreateInput!`, `$tu${index}: ArticleUpdateInput!`],
        selection: `t${index}: upsertArticle(where: { slug: "${article.slug}" }, upsert: { create: $tc${index}, update: $tu${index} }) { id }`,
        variables: {
          [`tc${index}`]: {
            ...base,
            ...es.create,
            authors: { connect: [{ slug: article.author }] },
            ...(imageId ? { articleImage: { connect: { id: imageId } } } : {}),
            ...(featured.length
              ? { featuredProducts: { connect: featured.map((productSlug) => ({ productSlug })) } }
              : {}),
          },
          [`tu${index}`]: {
            ...base,
            ...es.update,
            authors: { set: [{ slug: article.author }] },
            ...(imageId ? { articleImage: { connect: { id: imageId } } } : {}),
            ...(featured.length
              ? { featuredProducts: { set: featured.map((productSlug) => ({ productSlug })) } }
              : {}),
          },
        },
      };
    }),
  );

  await runBatched(
    "blog-posts",
    blogPosts.map((post, index) => {
      const es = post.es
        ? localized({ title: post.es.title, excerpt: post.es.excerpt })
        : { create: {}, update: {} };
      const coverId = pick(assets, poolForTags(post.tags), index);
      const body = md(post.body);

      const base = {
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        postDate: post.postDate,
        readingTime: post.readingTime,
        tags: post.tags,
        // `content` is the localized field the site reads; `body` is the legacy
        // non-localized field, kept populated so existing queries still work.
        content: body,
        body,
        seo: {
          create: { title: `${post.title} | Meridian`, description: post.excerpt.slice(0, 155) },
        },
      };

      return {
        declarations: [`$bc${index}: BlogPostCreateInput!`, `$bu${index}: BlogPostUpdateInput!`],
        selection: `b${index}: upsertBlogPost(where: { slug: "${post.slug}" }, upsert: { create: $bc${index}, update: $bu${index} }) { id }`,
        variables: {
          [`bc${index}`]: {
            ...base,
            ...es.create,
            author: { connect: { slug: post.author } },
            ...(coverId ? { coverImage: { connect: { id: coverId } } } : {}),
          },
          [`bu${index}`]: {
            ...base,
            ...es.update,
            author: { connect: { slug: post.author } },
            ...(coverId ? { coverImage: { connect: { id: coverId } } } : {}),
          },
        },
      };
    }),
  );
}

// ---------------------------------------------------------------- phase 5

const PUBLISH_ORDER: { label: string; mutation: string }[] = [
  { label: "categories", mutation: "publishManyProductCategoriesConnection" },
  { label: "authors", mutation: "publishManyAuthorsConnection" },
  { label: "products", mutation: "publishManyProductsConnection" },
  { label: "articles", mutation: "publishManyArticlesConnection" },
  { label: "blog posts", mutation: "publishManyBlogPostsConnection" },
  { label: "faqs", mutation: "publishManyFaqItemsConnection" },
  { label: "policies", mutation: "publishManyPolicyPagesConnection" },
];

/**
 * Assets are published by explicit id rather than with a blanket filter.
 *
 * An asset stuck in ASSET_CREATE_PENDING (one created without ever uploading
 * bytes) is hidden from content queries but still picked up by an unfiltered
 * publishMany, which then fails the whole batch with "You tried to publish a
 * non complete asset". Listing ids first sidesteps it, because the query that
 * lists them cannot see the broken one either.
 */
async function publishAssets() {
  const ids: string[] = [];
  for (let skip = 0; ; skip += 100) {
    const data = await gql<{ assets: { id: string }[] }>(
      `query PublishableAssets($skip: Int!) {
         assets(first: 100, skip: $skip, stage: DRAFT, orderBy: createdAt_ASC) { id }
       }`,
      { skip },
    );
    ids.push(...data.assets.map((a) => a.id));
    if (data.assets.length < 100) break;
  }

  let published = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const data = await gql<{
      publishManyAssetsConnection: { pageInfo: { pageSize: number } };
    }>(
      `mutation PublishAssets($ids: [ID!]) {
         publishManyAssetsConnection(
           to: [PUBLISHED] from: DRAFT first: 100
           where: { id_in: $ids }
           locales: [en, es] publishBase: true withDefaultLocale: true
         ) { pageInfo { pageSize } }
       }`,
      { ids: batch },
    );
    published += data.publishManyAssetsConnection?.pageInfo?.pageSize ?? 0;
  }

  console.log(`  [assets] published ${published}`);
}

async function phase5() {
  console.log("\nPhase 5 — publishing");
  await publishAssets();
  // Dependency order matters: a published product pointing at a draft-only
  // asset or category renders a hole on the CDN.
  for (const { label, mutation } of PUBLISH_ORDER) {
    // The connection caps at 100 per call regardless of `first`, and every
    // document still matches `from: DRAFT` after publishing — so re-calling
    // without `skip` would republish the same first 100 forever.
    let skip = 0;
    let total = 0;

    for (;;) {
      // publishBase is not optional — without it every non-localized field
      // (price, slug, relations) stays unpublished and the CDN returns nulls.
      const query = `mutation Publish {
        ${mutation}(
          to: [PUBLISHED]
          from: DRAFT
          first: 100
          skip: ${skip}
          locales: [en, es]
          publishBase: true
          withDefaultLocale: true
        ) { pageInfo { hasNextPage pageSize } }
      }`;

      const data = await gql<Record<string, { pageInfo: { hasNextPage: boolean; pageSize: number } }>>(query);
      const info = data[mutation]?.pageInfo;
      const size = info?.pageSize ?? 0;
      total += size;

      if (!info?.hasNextPage || size === 0) break;
      skip += size;
    }

    console.log(`  [${label}] published ${total}`);
  }
}

// ------------------------------------------------------------------- main

async function main() {
  console.log(commit ? "Seeding Hygraph (COMMIT)" : "Seeding Hygraph (dry run — pass --commit to write)");

  let assets: AssetIndex = new Map();

  if (shouldRun("0")) {
    assets = await phase0();
  } else {
    assets = indexAssets(await discoverAssets());
    const total = [...assets.values()].flat().length;
    console.log(`\nPhase 0 skipped — reusing ${total} existing assets in ${assets.size} pools`);
  }

  if (shouldRun("1")) await phase1(assets);
  if (shouldRun("1b")) await phase1b();
  if (shouldRun("2")) await phase2(assets);
  if (shouldRun("3")) await phase3(assets);
  if (shouldRun("5")) {
    if (!commit) {
      console.log("\nPhase 5 skipped in dry run (publish mutations are not dry-runnable here)");
    } else {
      await phase5();
    }
  }

  console.log(commit ? "\nDone." : "\nDry run complete. Re-run with --commit to write.");
}

main().catch((error) => {
  console.error("\nSeed failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
