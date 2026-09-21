import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ProductGrid, formatPrice } from "@/components/ProductCard";
import { RichTextBody } from "@/components/RichTextBody";
import { Section } from "@/components/Prose";
import { getProduct, getProductSlugs, getRelatedProducts } from "@/hygraph/queries";
import { pathFor } from "@/hygraph/routes";

export async function generateStaticParams() {
  const products = await getProductSlugs();
  return products.map((product) => ({ slug: product.productSlug }));
}

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return {};

  return {
    // absolute: the Hygraph SEO title already ends in "| Meridian", so letting
    // the layout template append it again would double the suffix.
    title: product.seo?.title ? { absolute: product.seo.title } : product.productName,
    description: product.seo?.description ?? product.shortDescription ?? undefined,
  };
}

export default async function ProductPage({ params }: PageProps<"/products/[slug]">) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  const related = await getRelatedProducts(
    product.productCategories.map((c) => c.slug),
    product.productSlug,
  );

  const variant = product.productVariant?.productType;
  // The union members expose size/colour under aliased names, because the
  // underlying enums differ per member (ClothesSize vs ShoesSize, etc).
  const size = variant?.clothingSize ?? variant?.shoeSize ?? null;
  const colour =
    variant?.clothingColor ?? variant?.shoeColor ?? variant?.accessoryColor ?? variant?.decorColor ?? null;

  return (
    <div>
      <div className="grid gap-10 lg:grid-cols-2">
        <div className="space-y-3">
          {product.gallery.map((image, index) => (
            <div
              key={image.url}
              className="relative aspect-4/3 overflow-hidden rounded-lg bg-stone-100 dark:bg-stone-900"
            >
              <Image
                src={image.url}
                alt={`${product.productName} — view ${index + 1}`}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
                priority={index === 0}
              />
            </div>
          ))}
        </div>

        <div>
          <div className="flex flex-wrap gap-2">
            {product.productCategories.map((category) => (
              <Link
                key={category.slug}
                href={pathFor("category", category.slug)}
                className="rounded-full border border-stone-300 px-3 py-1 text-xs text-stone-600 hover:border-stone-500 dark:border-stone-700 dark:text-stone-400"
              >
                {category.categoryName}
              </Link>
            ))}
          </div>

          {product.brand ? (
            <p className="mt-5 text-sm uppercase tracking-wide text-stone-500">{product.brand}</p>
          ) : null}
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
            {product.productName}
          </h1>

          {product.shortDescription ? (
            <p className="mt-4 text-lg leading-8 text-stone-600 dark:text-stone-400">
              {product.shortDescription}
            </p>
          ) : null}

          <div className="mt-6 flex items-center gap-4">
            <span className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
              {formatPrice(product.productPrice)}
            </span>
            <span
              className={
                product.inStock
                  ? "text-sm text-emerald-700 dark:text-emerald-400"
                  : "text-sm text-stone-500"
              }
            >
              {product.inStock ? "In stock" : "Out of stock"}
            </span>
            {product.rating ? (
              <span className="text-sm text-stone-500">
                {product.rating.toFixed(1)} from {product.reviewCount ?? 0} reviews
              </span>
            ) : null}
          </div>

          <button
            type="button"
            disabled={!product.inStock}
            className="mt-6 w-full rounded-md bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-300 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300 dark:disabled:bg-stone-800 dark:disabled:text-stone-500"
          >
            {product.inStock ? "Add to basket" : "Notify me when back in stock"}
          </button>

          <dl className="mt-8 divide-y divide-stone-200 border-t border-stone-200 text-sm dark:divide-stone-800 dark:border-stone-800">
            {product.sku ? <SpecRow label="SKU" value={product.sku} /> : null}
            {product.material ? <SpecRow label="Material" value={product.material} /> : null}
            {size ? <SpecRow label="Size" value={size.replace("Size_", "EU ")} /> : null}
            {colour ? <SpecRow label="Colour" value={colour} /> : null}
            {product.tags.length ? <SpecRow label="Tags" value={product.tags.join(", ")} /> : null}
          </dl>
        </div>
      </div>

      {product.productDescription ? (
        <div className="mt-16 max-w-3xl">
          <h2 className="mb-6 text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
            Details
          </h2>
          <RichTextBody content={product.productDescription} />
        </div>
      ) : null}

      {product.articles.length > 0 ? (
        <Section title="Guides featuring this product">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {product.articles.map((article) => (
              <Link
                key={article.slug}
                href={pathFor("article", article.slug)}
                className="rounded-lg border border-stone-200 p-4 transition hover:border-stone-400 dark:border-stone-800 dark:hover:border-stone-600"
              >
                <h3 className="font-medium text-stone-900 dark:text-stone-100">{article.title}</h3>
                {article.excerpt ? (
                  <p className="mt-2 line-clamp-3 text-sm text-stone-600 dark:text-stone-400">
                    {article.excerpt}
                  </p>
                ) : null}
              </Link>
            ))}
          </div>
        </Section>
      ) : null}

      {related.length > 0 ? (
        <Section title="You might also like">
          <ProductGrid products={related} />
        </Section>
      ) : null}
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-3">
      <dt className="text-stone-500">{label}</dt>
      <dd className="text-right text-stone-800 dark:text-stone-200">{value}</dd>
    </div>
  );
}
