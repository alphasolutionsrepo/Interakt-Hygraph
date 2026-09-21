# Meridian — Hygraph demo site

A demonstration storefront and editorial site (apparel and outdoor supply) backed by
**Hygraph**, built as a reference integration. Phase 2 will add **Interakt** as the search
and chat layer.

This is the Hygraph counterpart to `../Interakt-Sanity`.

## Stack

- Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · npm
- Hygraph Content API, read unauthenticated from the CDN endpoint
- No Hygraph client library — plain `fetch` through one wrapper

Runs on **port 3002** (Interakt's backend uses 3000, its demo-site 3001).

## Getting started

```bash
cp .env.local.example .env.local   # then fill in HYGRAPH_TOKEN
npm install
npm run dev
```

`HYGRAPH_TOKEN` is only needed for seeding. The site itself reads published content from
the CDN endpoint with no auth.

## Content

| Model | Count | Notes |
|---|---|---|
| Product | 159 | 150 seeded from 30 hand-written families × 5 variants, plus 9 pre-existing entries renamed |
| ProductCategory | 14 | The 8 original playground categories plus 6 new |
| Article (guides) | 32 | Buying guides, how-tos, reviews, sizing, trail stories |
| BlogPost (journal) | 20 | Long-form process and sourcing pieces |
| FaqItem | 42 | Across 8 topics |
| PolicyPage | 6 | Shipping, returns, warranty, privacy, terms, sustainability |
| Asset | 73 | 40 seeded placeholders plus 33 pre-existing |

Locales: `en` (default) and `es`. Spanish covers short fields (names, excerpts, questions);
long-form bodies are English only.

Content is deliberately hand-authored rather than generated with faker — search and chat
are only convincing if the prose actually answers the questions people type.

## Seeding

```bash
npm run seed                          # dry run (default) — nothing persists
npm run seed -- --commit              # write everything
npm run seed -- --commit --phase=2    # one phase only
```

Phases: `0` assets · `1` categories/authors/policies/FAQs · `1b` legacy backfill ·
`2` products · `3` articles and posts · `5` publish.

The seed is **idempotent** — everything upserts on a stable slug, so re-running updates in
place. Verified: a second full run leaves all counts unchanged and does not duplicate
relations.

### Things that will bite you

These are all load-bearing and were each discovered the hard way:

- **Rich text read and write formats differ.** Writes take the bare Slate AST
  (`{ children: [...] }`); reads come back as `{ raw, html, markdown, text }`. Feeding a
  read value straight back into a mutation is the most common Hygraph error.
- **Hygraph caps `first` at 100** whatever you ask for. Anything that must return the whole
  set has to page with `skip` — otherwise a third of the catalogue silently disappears, and
  in `generateStaticParams` those pages silently stop being built.
- **Relation syntax differs by branch**: `connect` in a `create` branch, `set` in an
  `update` branch. `connect` is additive, so using it in update appends duplicate links on
  every reseed.
- **Every alias in a batch needs a distinct unique-field value in its `create` branch**,
  even for rows that take the `update` path. Hygraph validates all create inputs up front
  and a collision surfaces only as `Input value does not match the expected format.`
- **`publishBase: true` is not optional.** Without it every non-localized field (price,
  slug, relations) stays unpublished and the CDN returns an entry full of nulls.
- **Publishing is capped at 100 per call** and every document still matches `from: DRAFT`
  afterwards, so the publish loop has to paginate with `skip` or it republishes the same
  first 100 forever.
- **Assets are async.** `createAsset(uploadUrl:)` returns a URL immediately but the bytes
  are not there yet; poll to `ASSET_UPLOAD_COMPLETE` before connecting them or published
  pages render broken images.
- **Never select `Product.reviews` or `Product.productStock`.** They are remote REST fields
  pointing at a dead host and each retries five times before failing the *entire* request.
- **Union members need aliased fields.** `size`/`color` resolve to different enum types per
  member (`ClothesSize` vs `ShoesSize`), which GraphQL rejects as a field conflict.

## Schema migrations

Applied through the Hygraph MCP server in seven batches. Of note:

- `publishedAt` is a **reserved** field apiId — the post date field is `postDate`.
- `isUnique` cannot be combined with `initialValue`/`migrationValue`. To add a
  required-unique slug to a model that already has rows: create it unique-but-nullable,
  backfill every row, then flip `isRequired`. That backfill has to cover the **PUBLISHED**
  stage too, so publish before tightening the constraint.
- Localization cannot be toggled on an existing field — `updateSimpleField` has no
  `isLocalized` parameter. `BlogPost.content` was added as a new localized field alongside
  the legacy non-localized `body`, which the site falls back to for older entries.
- Migration dry runs validate **parameter shape only**. Data-dependent checks (`isRequired`
  against existing rows, uniqueness) only run on real submission.

## Layout

```
scripts/
  seed.ts            orchestrator (phases, --commit, --phase=)
  lib/client.ts      batched GraphQL client, backoff, dry-run header
  lib/richtext.ts    markdown subset -> Hygraph Slate AST
  data/              the corpus: taxonomy, products, editorial, support
src/
  hygraph/           env, fetch wrapper, all queries, route map
  components/        cards, rich text renderer, chrome
  app/(site)/        routes
```

`src/hygraph/routes.ts` is the single source of truth for content URLs. It is shared by the
site's own links and — in phase 2 — by the canonical URL written into each Interakt search
document, so a route change cannot leave the index pointing at 404s.

## Phase 2 — Interakt (not yet started)

`/search` is a placeholder, and `#interakt-search` / `#interakt-chat` containers are already
in the header and layout.

Four files from `../Interakt-Sanity` are CMS-agnostic and copy over nearly verbatim:
`src/interakt/ingest.ts`, `search-client.ts`, `coverage.ts` and
`components/interakt/DropinWidget.tsx`. Only the rich-text flattening and the webhook intent
resolution need rewriting for Hygraph.

The published Interakt docs are wrong in four places — use the code, not the docs:

| | Docs say | Reality |
|---|---|---|
| Ingest path | `/api/v1/search-indexes/{id}/documents` | `/api/search-indexes/{id}/documents` |
| Ingest auth | `X-Api-Key` | `Authorization: Bearer ik_…` (server-to-server only, no CORS) |
| Search | `/api/v1/search-experiences/{slug}/search` | `POST /api/v1/search`, auth `X-Access-Token` |
| Widgets | `<script data-token data-container>` | `window.SearchDropinUI.init({ containerId, accessToken })` |
