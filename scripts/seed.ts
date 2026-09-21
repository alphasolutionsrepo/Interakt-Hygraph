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

const ASSET_PREFIX = "seed-meridian-";
const ASSET_COUNT = 40;
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

async function discoverAssets(): Promise<AssetRef[]> {
  const data = await gql<{ assets: { id: string; fileName: string }[] }>(
    `query SeedAssets {
       assets(first: 100, stage: DRAFT, where: { fileName_starts_with: "${ASSET_PREFIX}" }, orderBy: fileName_ASC) {
         id fileName
       }
     }`,
  );
  return data.assets;
}

async function phase0(): Promise<AssetRef[]> {
  console.log("\nPhase 0 — assets");
  const existing = await discoverAssets();
  const have = new Set(existing.map((a) => a.fileName));
  console.log(`  found ${existing.length} existing seed assets`);

  const missing: number[] = [];
  for (let i = 1; i <= ASSET_COUNT; i++) {
    const fileName = `${ASSET_PREFIX}${String(i).padStart(3, "0")}.jpg`;
    if (!have.has(fileName)) missing.push(i);
  }

  if (missing.length === 0) {
    console.log("  all assets present, skipping upload");
    return existing;
  }

  console.log(`  uploading ${missing.length} placeholder images from picsum.photos`);

  const ops: AliasedOp[] = missing.map((i, index) => {
    const fileName = `${ASSET_PREFIX}${String(i).padStart(3, "0")}.jpg`;
    return {
      declarations: [`$a${index}: AssetCreateInput!`],
      selection: `a${index}: createAsset(data: $a${index}) { id fileName }`,
      variables: {
        [`a${index}`]: {
          uploadUrl: `https://picsum.photos/seed/meridian${i}/1600/1200`,
          fileName,
          altText: `Meridian outdoor apparel photograph ${i}`,
        },
      },
    };
  });

  await runBatched("assets", ops);

  if (!commit) {
    console.log("  dry run — skipping upload polling");
    return existing;
  }

  // Asset creation is async: the url comes back immediately but the bytes are
  // not there yet, so published pages would render broken images if we
  // continued straight to products.
  const created = await discoverAssets();
  await waitForUploads(created.map((a) => a.id));
  return created;
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

async function phase1(assets: AssetRef[]) {
  console.log("\nPhase 1 — categories, authors, policies, FAQs");
  const asset = (i: number) => assets[i % Math.max(assets.length, 1)]?.id;

  // Categories
  await runBatched(
    "categories",
    categories.map((category, index) => {
      const es = category.es
        ? localized({ categoryName: category.es.name, excerpt: category.es.excerpt })
        : { create: {}, update: {} };
      const heroId = asset(index + 3);
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
      const avatarId = asset(index + 11);
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
          productName: rewrite.name,
          productSlug: rewrite.to,
          brand: "Meridian",
          inStock: true,
          tags: ["archive"],
        },
      },
    })),
  );
}

// ---------------------------------------------------------------- phase 2

async function phase2(assets: AssetRef[]) {
  console.log(`\nPhase 2 — ${products.length} products`);
  if (assets.length === 0) {
    console.log("  no assets available, products will be created without images");
  }

  await runBatched(
    "products",
    products.map((product, index) => {
      const es = localized({
        productName: product.es!.name,
        shortDescription: product.es!.shortDescription,
      });

      // Round-robin the images with a per-product offset so adjacent cards in a
      // category grid do not repeat the same photograph.
      const imageIds =
        assets.length > 0
          ? [assets[index % assets.length].id, assets[(index * 7 + 3) % assets.length].id]
          : [];

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

async function phase3(assets: AssetRef[]) {
  console.log(`\nPhase 3 — ${articles.length} articles, ${blogPosts.length} blog posts`);
  const productSlugs = new Set(products.map((p) => p.slug));

  await runBatched(
    "articles",
    articles.map((article, index) => {
      const es = article.es
        ? localized({ title: article.es.title, excerpt: article.es.excerpt })
        : { create: {}, update: {} };
      const imageId = assets.length ? assets[(index * 3 + 1) % assets.length].id : undefined;
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
      const coverId = assets.length ? assets[(index * 5 + 2) % assets.length].id : undefined;
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
  { label: "assets", mutation: "publishManyAssetsConnection" },
  { label: "categories", mutation: "publishManyProductCategoriesConnection" },
  { label: "authors", mutation: "publishManyAuthorsConnection" },
  { label: "products", mutation: "publishManyProductsConnection" },
  { label: "articles", mutation: "publishManyArticlesConnection" },
  { label: "blog posts", mutation: "publishManyBlogPostsConnection" },
  { label: "faqs", mutation: "publishManyFaqItemsConnection" },
  { label: "policies", mutation: "publishManyPolicyPagesConnection" },
];

async function phase5() {
  console.log("\nPhase 5 — publishing");
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

  let assets: AssetRef[] = [];

  if (shouldRun("0")) {
    assets = await phase0();
  } else {
    assets = await discoverAssets();
    console.log(`\nPhase 0 skipped — reusing ${assets.length} existing assets`);
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
