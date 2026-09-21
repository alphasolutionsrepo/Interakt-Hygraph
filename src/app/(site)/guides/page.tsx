import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader, formatDate, humanise } from "@/components/Prose";
import { getGuides } from "@/hygraph/queries";
import { pathFor } from "@/hygraph/routes";

export const metadata: Metadata = {
  title: "Guides",
  description: "Buying guides, sizing guides, gear reviews and how-tos from the Meridian team.",
};

export default async function GuidesPage() {
  const guides = await getGuides();

  return (
    <div>
      <PageHeader
        eyebrow="Reading"
        title="Guides"
        lede="Buying guides, sizing help, long-term reviews and the occasional trail story. A good guide should help you not buy something as often as it helps you buy something."
      />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {guides.map((guide) => (
          <Link
            key={guide.slug}
            href={pathFor("article", guide.slug)}
            className="group flex flex-col overflow-hidden rounded-lg border border-stone-200 transition hover:border-stone-400 dark:border-stone-800 dark:hover:border-stone-600"
          >
            <div className="relative aspect-16/9 bg-stone-100 dark:bg-stone-900">
              {guide.articleImage ? (
                <Image
                  src={guide.articleImage.url}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover transition duration-300 group-hover:scale-105"
                />
              ) : null}
            </div>
            <div className="flex flex-1 flex-col p-5">
              <p className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                {humanise(guide.articleType)}
                {guide.readingTime ? ` · ${guide.readingTime} min read` : ""}
              </p>
              <h2 className="mt-2 font-medium leading-snug text-stone-900 dark:text-stone-100">
                {guide.title}
              </h2>
              {guide.excerpt ? (
                <p className="mt-2 line-clamp-3 text-sm text-stone-600 dark:text-stone-400">
                  {guide.excerpt}
                </p>
              ) : null}
              <p className="mt-auto pt-4 text-xs text-stone-500">
                {guide.authors[0]?.name}
                {guide.postDate ? ` · ${formatDate(guide.postDate)}` : ""}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
