import { hygraphFetch } from "./fetch";

/**
 * All GraphQL for the site lives here.
 *
 * IMPORTANT: never select Product.reviews or Product.productStock. They are
 * remote REST fields pointing at a dead host (federatethis.com) and each one
 * retries five times before failing the ENTIRE request — on a 150-product
 * listing that is 750 DNS timeouts.
 */

export type RichText = { raw: unknown; text: string } | null;

export type ImageRef = { url: string; width: number | null; height: number | null; altText: string | null } | null;

export type ProductCard = {
  id: string;
  productName: string;
  productSlug: string;
  brand: string | null;
  productPrice: number | null;
  rating: number | null;
  reviewCount: number | null;
  inStock: boolean | null;
  shortDescription: string | null;
  productImage: { url: string }[];
  productCategories: { slug: string; categoryName: string }[];
};

export type ProductVariantType = {
  __typename: string;
  clothingSize?: string;
  clothingColor?: string;
  shoeSize?: string;
  shoeColor?: string;
  accessoryColor?: string;
  decorColor?: string;
};

export type ProductDetail = ProductCard & {
  sku: string | null;
  material: string | null;
  tags: string[];
  /** Aliased: productImage is already selected with first:1 in PRODUCT_CARD. */
  gallery: { url: string }[];
  productDescription: RichText;
  seo: { title: string; description: string } | null;
  productVariant: { productType: ProductVariantType | null } | null;
  articles: { slug: string; title: string; excerpt: string | null }[];
};

const PRODUCT_CARD = `
  id
  productName
  productSlug
  brand
  productPrice
  rating
  reviewCount
  inStock
  shortDescription
  productImage(first: 1) { url }
  productCategories { slug categoryName }
`;

const IMAGE = `url width height altText`;

export async function getHomeData() {
  return hygraphFetch<{
    featured: ProductCard[];
    latest: ProductCard[];
    categories: { slug: string; categoryName: string; excerpt: string | null; heroImage: ImageRef }[];
    guides: { slug: string; title: string; excerpt: string | null; articleType: string | null; readingTime: number | null }[];
    posts: { slug: string; title: string; excerpt: string | null; postDate: string | null; coverImage: ImageRef }[];
  }>(`query Home {
    featured: products(first: 6, orderBy: rating_DESC, where: { inStock: true }) { ${PRODUCT_CARD} }
    latest: products(first: 8, orderBy: createdAt_DESC) { ${PRODUCT_CARD} }
    categories: productCategories(first: 8, orderBy: categoryName_ASC) {
      slug categoryName excerpt heroImage { ${IMAGE} }
    }
    guides: articles(first: 6, orderBy: postDate_DESC) {
      slug title excerpt articleType readingTime
    }
    posts: blogPosts(first: 3, orderBy: postDate_DESC) {
      slug title excerpt postDate coverImage { ${IMAGE} }
    }
  }`);
}

/**
 * Hygraph caps `first` at 100 regardless of what you ask for, so anything that
 * must return the whole set has to page with `skip`. With 159 products, a single
 * unpaginated query silently drops a third of the catalogue — and, in
 * generateStaticParams, silently stops building those pages.
 */
async function fetchAllPaged<T>(
  build: (first: number, skip: number) => { query: string; variables?: Record<string, unknown> },
  pick: (data: Record<string, unknown>) => T[],
): Promise<T[]> {
  const pageSize = 100;
  const out: T[] = [];

  for (let skip = 0; ; skip += pageSize) {
    const { query, variables } = build(pageSize, skip);
    const data = await hygraphFetch<Record<string, unknown>>(query, variables ?? {});
    const page = pick(data);
    out.push(...page);
    if (page.length < pageSize) return out;
  }
}

export async function getProducts(categorySlug?: string) {
  return fetchAllPaged<ProductCard>(
    (first, skip) => ({
      query: `query Products($where: ProductWhereInput, $first: Int!, $skip: Int!) {
         products(first: $first, skip: $skip, orderBy: productName_ASC, where: $where) { ${PRODUCT_CARD} }
       }`,
      variables: {
        where: categorySlug ? { productCategories_some: { slug: categorySlug } } : {},
        first,
        skip,
      },
    }),
    (data) => data.products as ProductCard[],
  );
}

export async function getProductSlugs() {
  return fetchAllPaged<{ productSlug: string }>(
    (first, skip) => ({
      query: `query ProductSlugs($first: Int!, $skip: Int!) {
         products(first: $first, skip: $skip, orderBy: productName_ASC) { productSlug }
       }`,
      variables: { first, skip },
    }),
    (data) => data.products as { productSlug: string }[],
  );
}

export async function getProduct(slug: string) {
  const data = await hygraphFetch<{ product: ProductDetail | null }>(
    `query Product($slug: String!) {
       product(where: { productSlug: $slug }) {
         ${PRODUCT_CARD}
         sku
         material
         tags
         gallery: productImage { url }
         productDescription { raw text }
         seo { title description }
         productVariant {
           productType {
             __typename
             # Aliased because size/color resolve to different enum types per
             # member, which GraphQL rejects as a field conflict.
             ... on Clothing { clothingSize: size clothingColor: color }
             ... on Shoe { shoeSize: size shoeColor: color }
             ... on Accessory { accessoryColor: color }
             ... on Decor { decorColor: color }
           }
         }
         articles(first: 4) { slug title excerpt }
       }
     }`,
    { slug },
  );
  return data.product;
}

export async function getRelatedProducts(categorySlugs: string[], excludeSlug: string) {
  if (categorySlugs.length === 0) return [];
  const data = await hygraphFetch<{ products: ProductCard[] }>(
    `query Related($cats: [String!], $exclude: String!) {
       products(first: 4, where: {
         productCategories_some: { slug_in: $cats }
         productSlug_not: $exclude
       }) { ${PRODUCT_CARD} }
     }`,
    { cats: categorySlugs, exclude: excludeSlug },
  );
  return data.products;
}

export async function getCategories() {
  const data = await hygraphFetch<{
    productCategories: {
      slug: string;
      categoryName: string;
      excerpt: string | null;
      heroImage: ImageRef;
    }[];
  }>(`query Categories {
    productCategories(first: 50, orderBy: categoryName_ASC) {
      slug categoryName excerpt heroImage { ${IMAGE} }
    }
  }`);
  return data.productCategories;
}

export async function getCategory(slug: string) {
  const data = await hygraphFetch<{
    productCategory: {
      slug: string;
      categoryName: string;
      excerpt: string | null;
      description: RichText;
      heroImage: ImageRef;
      products: ProductCard[];
    } | null;
  }>(
    `query Category($slug: String!) {
       productCategory(where: { slug: $slug }) {
         slug categoryName excerpt
         description { raw text }
         heroImage { ${IMAGE} }
         products(first: 100, orderBy: productName_ASC) { ${PRODUCT_CARD} }
       }
     }`,
    { slug },
  );
  return data.productCategory;
}

export type GuideCard = {
  slug: string;
  title: string;
  excerpt: string | null;
  articleType: string | null;
  readingTime: number | null;
  postDate: string | null;
  tags: string[];
  articleImage: ImageRef;
  authors: { name: string | null; slug: string }[];
};

const GUIDE_CARD = `
  slug title excerpt articleType readingTime postDate tags
  articleImage { ${IMAGE} }
  authors { name slug }
`;

export async function getGuides() {
  return fetchAllPaged<GuideCard>(
    (first, skip) => ({
      query: `query Guides($first: Int!, $skip: Int!) {
         articles(first: $first, skip: $skip, orderBy: postDate_DESC) { ${GUIDE_CARD} }
       }`,
      variables: { first, skip },
    }),
    (data) => data.articles as GuideCard[],
  );
}

export async function getGuideSlugs() {
  return fetchAllPaged<{ slug: string }>(
    (first, skip) => ({
      query: `query GuideSlugs($first: Int!, $skip: Int!) {
         articles(first: $first, skip: $skip, orderBy: postDate_DESC) { slug }
       }`,
      variables: { first, skip },
    }),
    (data) => data.articles as { slug: string }[],
  );
}

export async function getGuide(slug: string) {
  const data = await hygraphFetch<{
    article:
      | (GuideCard & {
          articleText: RichText;
          seo: { title: string; description: string } | null;
          featuredProducts: ProductCard[];
        })
      | null;
  }>(
    `query Guide($slug: String!) {
       article(where: { slug: $slug }) {
         ${GUIDE_CARD}
         articleText { raw text }
         seo { title description }
         featuredProducts(first: 4) { ${PRODUCT_CARD} }
       }
     }`,
    { slug },
  );
  return data.article;
}

export type PostCard = {
  slug: string;
  title: string;
  excerpt: string | null;
  postDate: string | null;
  readingTime: number | null;
  tags: string[];
  coverImage: ImageRef;
  author: { name: string | null; slug: string; title: string | null } | null;
};

const POST_CARD = `
  slug title excerpt postDate readingTime tags
  coverImage { ${IMAGE} }
  author { name slug title }
`;

export async function getPosts() {
  return fetchAllPaged<PostCard>(
    (first, skip) => ({
      query: `query Posts($first: Int!, $skip: Int!) {
         blogPosts(first: $first, skip: $skip, orderBy: postDate_DESC) { ${POST_CARD} }
       }`,
      variables: { first, skip },
    }),
    (data) => data.blogPosts as PostCard[],
  );
}

export async function getPostSlugs() {
  return fetchAllPaged<{ slug: string }>(
    (first, skip) => ({
      query: `query PostSlugs($first: Int!, $skip: Int!) {
         blogPosts(first: $first, skip: $skip, orderBy: postDate_DESC) { slug }
       }`,
      variables: { first, skip },
    }),
    (data) => data.blogPosts as { slug: string }[],
  );
}

export async function getPost(slug: string) {
  const data = await hygraphFetch<{
    blogPost:
      | (PostCard & {
          content: RichText;
          body: RichText;
          seo: { title: string; description: string } | null;
        })
      | null;
  }>(
    `query Post($slug: String!) {
       blogPost(where: { slug: $slug }) {
         ${POST_CARD}
         content { raw text }
         body { raw text }
         seo { title description }
       }
     }`,
    { slug },
  );
  return data.blogPost;
}

export async function getFaqs() {
  const data = await hygraphFetch<{
    faqItems: {
      slug: string;
      question: string;
      category: string;
      sortOrder: number | null;
      answer: RichText;
    }[];
  }>(`query Faqs {
    faqItems(first: 100, orderBy: sortOrder_ASC) {
      slug question category sortOrder answer { raw text }
    }
  }`);
  return data.faqItems;
}

export async function getPolicySlugs() {
  const data = await hygraphFetch<{ policyPages: { slug: string }[] }>(
    `query PolicySlugs { policyPages(first: 50) { slug } }`,
  );
  return data.policyPages;
}

export async function getPolicy(slug: string) {
  const data = await hygraphFetch<{
    policyPage: {
      slug: string;
      title: string;
      summary: string | null;
      effectiveDate: string | null;
      body: RichText;
      seo: { title: string; description: string } | null;
    } | null;
  }>(
    `query Policy($slug: String!) {
       policyPage(where: { slug: $slug }) {
         slug title summary effectiveDate
         body { raw text }
         seo { title description }
       }
     }`,
    { slug },
  );
  return data.policyPage;
}

export async function getNavPolicies() {
  const data = await hygraphFetch<{ policyPages: { slug: string; title: string }[] }>(
    `query NavPolicies { policyPages(first: 20, orderBy: title_ASC) { slug title } }`,
  );
  return data.policyPages;
}
