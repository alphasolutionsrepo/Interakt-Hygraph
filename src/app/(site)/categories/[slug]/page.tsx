import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ProductGrid } from "@/components/ProductCard";
import { RichTextBody } from "@/components/RichTextBody";
import { PageHeader } from "@/components/Prose";
import { getCategories, getCategory } from "@/hygraph/queries";

export async function generateStaticParams() {
  const categories = await getCategories();
  return categories.map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/categories/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategory(slug);
  if (!category) return {};

  return {
    title: category.categoryName,
    description: category.excerpt ?? undefined,
  };
}

export default async function CategoryPage({ params }: PageProps<"/categories/[slug]">) {
  const { slug } = await params;
  const category = await getCategory(slug);
  if (!category) notFound();

  return (
    <div>
      <PageHeader eyebrow="Category" title={category.categoryName} lede={category.excerpt} />

      {category.description ? (
        <div className="mb-12 max-w-3xl">
          <RichTextBody content={category.description} />
        </div>
      ) : null}

      {category.products.length > 0 ? (
        <ProductGrid products={category.products} />
      ) : (
        <p className="text-stone-600 dark:text-stone-400">Nothing in this category yet.</p>
      )}
    </div>
  );
}
