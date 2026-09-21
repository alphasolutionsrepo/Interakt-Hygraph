import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/Prose";
import { getCategories } from "@/hygraph/queries";
import { pathFor } from "@/hygraph/routes";

export const metadata: Metadata = {
  title: "Categories",
  description: "Browse the Meridian range by category.",
};

export default async function CategoriesPage() {
  const categories = await getCategories();

  return (
    <div>
      <PageHeader eyebrow="Shop" title="Categories" lede="Every part of the range, grouped by what it does." />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => (
          <Link
            key={category.slug}
            href={pathFor("category", category.slug)}
            className="group overflow-hidden rounded-lg border border-stone-200 transition hover:border-stone-400 dark:border-stone-800 dark:hover:border-stone-600"
          >
            <div className="relative aspect-16/9 bg-stone-100 dark:bg-stone-900">
              {category.heroImage ? (
                <Image
                  src={category.heroImage.url}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover transition duration-300 group-hover:scale-105"
                />
              ) : null}
            </div>
            <div className="p-5">
              <h2 className="font-medium text-stone-900 dark:text-stone-100">{category.categoryName}</h2>
              {category.excerpt ? (
                <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{category.excerpt}</p>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
