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

## Phase 2, step 1 — Interakt index documents

```bash
npm run interakt:sample
```

Regenerates four files in `interakt/` from live Hygraph content:

| File | Use |
|---|---|
| `products.mapping.json` | **Import** on the index Fields screen — authoritative |
| `content.mapping.json` | Same, for the content index |
| `products.sample.json` | Paste into Configure Mappings to preview inference |
| `content.sample.json` | Same |

Two indexes: `meridian-products` (159 product variants) and `meridian-content` (105 guides,
journal posts, FAQs, policies and authors).

### Setting the indexes up

1. Configure an AI provider **first** — the embedding model is locked at index creation.
2. Create both indexes as **hybrid**.
3. Import the two `*.mapping.json` files on each index's Fields screen.
4. Optionally paste the matching `*.sample.json` into Configure Mappings to see the preview.
5. Attach both indexes to one Search Experience, and create one data source + tool per index for chat.

### Why the documents look the way they do

Every constraint below was read from the Interakt backend, and several contradict its docs:

- **Mapping inference reads `sample[0]` and nothing else.** A field that first appears in a later
  record is never created. So each sample leads with an **exemplar** carrying every field, built
  from the richest real value per field. It is for mapping only and is never ingested.
- **Both indexes share a field spine** (`title`, `description`, `body`, `url`, `imageUrl`). A Search
  Experience has one `displayConfig`, and `resolveField()` takes the first field matching a display
  role for the whole experience — so two indexes does *not* let you render two card shapes.
- **`uniqueId` is namespaced** (`product:…`, `guide:…`). Multi-index results are fused with RRF,
  which dedupes on document id. It is also mapped by `reference` rather than left on its default
  `generator: uuid`, which would mint fresh ids and duplicate the whole corpus on every re-ingest.
- **Payloads are completely flat.** Nested objects are walked into dotted field names, and
  Elasticsearch rejects a mapping property containing a dot. Arrays hold primitives only — an array
  of objects is typed `json` and never descended.
- **Numbers are integers.** The app type `number` maps to ES `integer`, so ratings are rounded
  rather than silently truncated from 4.2 to 4.
- **`title`/`description` need the mapping import.** Inference types a string under 100 characters
  as `keyword`, which would leave them unanalysed. The generator prints exactly where inference and
  the mapping disagree.
- **Hygraph rich text `.text` emits literal `\n`**, not newlines. The mapper normalises it; a guard
  fails the run if any slips through.

`npm run interakt:sample` enforces all of the above and exits non-zero rather than writing files
that would produce a broken index. It also skips documents with no usable text — currently three
leftovers from the original Hygraph playground.

## Phase 2, step 2 — ingestion

```bash
npm run interakt:ingest                 # dry run — builds and reports, sends nothing
npm run interakt:ingest -- --commit
npm run interakt:ingest -- --commit --only=products
```

Uploads every document in batches of 500, then reconciles: anything the index holds that
Hygraph no longer has is bulk-deleted. **Idempotent** — verified by running it twice, with
counts unchanged and no duplicates, because `uniqueId` is mapped by `reference` rather than
left on its default UUID generator.

Currently indexes **159 products** and **105 content documents**.

Config lives in `.env.local` (all server-side, never in the browser bundle):

```
INTERAKT_BASE_URL=http://localhost:3000
INTERAKT_PRODUCTS_INDEX_ID=
INTERAKT_CONTENT_INDEX_ID=
INTERAKT_PRODUCTS_INGESTION_KEY=ik_…
INTERAKT_CONTENT_INGESTION_KEY=ik_…
```

### Order matters

Import the field mappings **before** the first upload. Field definitions live separately
from the Elasticsearch index, and uploading into an unconfigured index leaves you with only
the three system fields and a reindex to undo it.

### Notes from getting this working

- **An ingestion key cannot reveal its own index.** The admin listing routes reject it
  outright, so the index UUIDs have to come from the admin URL.
- **A valid key against the wrong index and a key lacking an operation return the same 403**
  — the middleware handles `index-forbidden` and `operation-forbidden` in one branch. Useful
  to know when a key looks broken but is merely misrouted.
- **Scopes are `write` / `delete` / `drop-index`** — there is no read scope. A write-only key
  uploads fine and then 403s on reconciliation, so that case is downgraded to a warning: the
  upload already succeeded and re-running with delete finishes the job.
- **The document list endpoint returns a truncated projection**, not the stored document.
  `GET /documents/{id}` returns the full record plus an `embeddingPreview` showing exactly
  which fields feed the vector — that is the one to check when verifying an ingest.

## Phase 2, step 3 — the search page

`/search`, plus a search box in the site header that hands off to it.

Built against the **combined** Search Experience, which has both indexes attached, so one
query returns products, guides, journal posts and FAQs blended together — searching
"waterproof jacket for Scottish winter" returns an FAQ, a buying guide and two rain coats.

```
NEXT_PUBLIC_INTERAKT_BASE_URL=http://localhost:3000
NEXT_PUBLIC_INTERAKT_SEARCH_TOKEN=      # public and read-only, but origin-bound
NEXT_PUBLIC_INTERAKT_PRODUCTS_INDEX_ID= # so the tabs can scope with indexId
NEXT_PUBLIC_INTERAKT_CONTENT_INDEX_ID=
```

| File | Purpose |
|---|---|
| `src/interakt/search-client.ts` | search, autocomplete, SSE summary |
| `src/hooks/useInteraktSearch.ts` | debounced search, stale-response guard, facet cache |
| `src/components/search/SearchExperience.tsx` | the UI |
| `src/components/HeaderSearch.tsx` | header box, routes to `/search?q=` |

Features: debounced querying with autocomplete, tabs (Everything / Products / Guides & help)
that scope with `indexId`, a facet sidebar, streamed AI summary, and pagination.

### Things worth knowing

- **`POST /api/v1/search`, header `X-Access-Token`.** Not the documented
  `/api/v1/search-experiences/{slug}/search` — the experience is resolved from the token.
- **Results arrive as `results[].source`** on the token endpoint (the slug endpoint uses
  `fields` instead), and facet buckets use `count`, not `doc_count`.
- **The API rejects an empty query**, so browsing everything uses `*`.
- **`total.relation` is `gte`** whenever more than one index is searched — counts are summed
  across indexes, so the UI says "about N results".
- **Facets are recomputed with active filters applied**, which collapses a facet to the value
  you just picked and strands you there. `useStableFacets` caches the widest bucket set seen
  for the current query so every option stays clickable.
- **The facet list is the union of both indexes' facetable fields**, including numeric ones
  bucketed a single value at a time (`reviewCount`, `price`). `FACET_LABELS` is an allow-list;
  anything not in it is dropped.
- **Pagination past page 1 is approximate on the Everything tab** — each index is asked for
  the same page number and the merged slice is taken, so it is not strictly "results 13–24 of
  the blend". Picking a tab sends `indexId`, which makes paging exact.
- **`displayConfig` gives one field per role for the whole experience**, so result cards are
  rendered from the roles the experience defines, with our field names as the fallback.

## Phase 2, step 4 — the assistant

The Interakt chat widget floats on every page, mounted from the site layout.

```
NEXT_PUBLIC_INTERAKT_CHAT_TOKEN=    # the AI Experience access token
```

`src/components/interakt/DropinWidget.tsx` loads the widget bundle and calls `init()`. It is
CMS-agnostic and handles both widgets, so the search drop-in can reuse it.

### Notes

- **The bundle is a vanilla IIFE served from the Interakt instance** at
  `/embed/v1/widgets.js`. There is no npm package and no web component. It registers
  `window.SearchDropinUI` and `window.ChatDropinUI`.
- **The documented `<script data-token data-container>` API does not exist.** The canonical
  snippet — confirmed via `GET /api/v1/embed-snippet` — is a script tag plus `init()`.
- **Only `containerId` and `accessToken` are required**; `apiBaseUrl` defaults to the origin
  of the script tag.
- **A load listener attached after the script already loaded never fires**, which hangs the
  widget forever. The loader checks for the global first, and shares one promise between
  widgets so the bundle is never evaluated twice.
- **Images are indexed pre-resized.** The widget lives in a shadow root the site cannot
  style, so an oversized image cannot be fixed with CSS from here. Hygraph transforms assets
  via a URL segment between the environment token and the asset handle, so `to-document.ts`
  indexes `…/resize=width:300/<handle>` — 300x225 at ~12KB rather than 1600x1200 at ~320KB.
  `INDEX_IMAGE_WIDTH` is the single place to change it, followed by a re-ingest.
- Chat streams SSE from `POST /api/v1/ai-experiences/chat` with `{ message, sessionId? }`.
  Re-send the `sessionId` from the `done` event to continue a conversation.

### The assistant can only answer product questions

Its tool list currently holds one entry, `Hygraph Product Data Source Search`, so there is no
retrieval over `hygraph-content`. Product questions work end to end — "show me waterproof
jackets under $300" runs `tool_call` → `tool_result` → a real answer. But "how long do I have
to return something" produces no tool call at all and the assistant replies asking which
company you mean, because the returns policy is in the content index it cannot reach.

To fix, in the Interakt admin: add a **data source** over `hygraph-content`, generate its
tools, and attach them to the AI Experience. Chat routes between tools by letting the model
pick, so both will coexist.

Also worth setting, since `widget-config` returns only a name: a welcome message and a few
suggested questions.

## Phase 2, step 5 — re-feed button in Hygraph Studio

A Hygraph App whose **page element** adds "Re-feed Interakt" under *App views* in the Content
editor. Pressing it rebuilds both indexes from the current published content.

| Route | Purpose |
|---|---|
| `/hygraph-app/setup` | Setup URL — collects the shared secret on install |
| `/hygraph-app/reindex` | The page element itself |
| `/api/interakt/reindex` | Does the work, server-side |

`src/interakt/reindex.ts` is shared with `npm run interakt:ingest`, so the button and the CLI
cannot drift apart.

### Why it needs a tunnel

Hygraph apps cannot run locally — *"our SDK only runs inside our platform"* — so the page must
be served from a public URL, and Hygraph's cloud has to reach it. While the site and Interakt
are both on localhost, that means a tunnel:

```bash
ngrok http 3002        # or cloudflared
```

The ingestion keys never leave the server: the button calls our own API route, which then talks
to Interakt. That is also why a public URL is unavoidable — the browser cannot be trusted with
the keys, so the work has to happen on the machine that has them.

### Registering the app

In Hygraph → **User settings → Your apps → + Add new app**. Some fields cannot be changed after
the first save, so complete every tab before clicking Register.

- **General** — name `Interakt`, API ID `interakt`, Setup URL `<tunnel>/hygraph-app/setup`
- **Elements** — add a **page** element, URL `<tunnel>/hygraph-app/reindex`
- Install it into the project, and on the setup screen paste the value of `INTERAKT_REINDEX_SECRET` from `.env.local`

### Notes

- `useApp()` gives `installation`, `updateInstallation`, `showToast`. The setup page writes
  `{ reindexSecret, endpoint }` into `installation.config` and sets status `COMPLETED`; the
  page element reads it back.
- `next.config.ts` sets `frame-ancestors` for `/hygraph-app/*` only, so Studio can iframe those
  routes and nothing else on the site becomes frameable.
- The endpoint answers `GET` with a config check, so the app can tell you the server is missing
  an environment variable before you press anything.
- Verified end to end through the tunnel: 159 products and 105 content documents re-fed in
  about 6 seconds.

## Phase 2, remaining — the incremental webhook

`/search` is a placeholder, and `#interakt-search` / `#interakt-chat` containers are already
in the header and layout. Index documents are done (above); ingestion and UI are not.

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
