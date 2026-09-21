import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader, formatDate } from "@/components/Prose";
import { getPosts } from "@/hygraph/queries";
import { pathFor } from "@/hygraph/routes";

export const metadata: Metadata = {
  title: "Journal",
  description: "Long-form writing from the Meridian team: testing, sourcing, process and trail stories.",
};

export default async function BlogPage() {
  const posts = await getPosts();

  return (
    <div>
      <PageHeader
        eyebrow="Reading"
        title="Journal"
        lede="How we test things, where materials come from, what we got wrong, and the occasional long walk."
      />

      <div className="space-y-5">
        {posts.map((post) => (
          <Link
            key={post.slug}
            href={pathFor("post", post.slug)}
            className="group grid gap-5 overflow-hidden rounded-lg border border-stone-200 transition hover:border-stone-400 sm:grid-cols-[220px_1fr] dark:border-stone-800 dark:hover:border-stone-600"
          >
            <div className="relative aspect-16/9 bg-stone-100 sm:aspect-auto dark:bg-stone-900">
              {post.coverImage ? (
                <Image
                  src={post.coverImage.url}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 100vw, 220px"
                  className="object-cover transition duration-300 group-hover:scale-105"
                />
              ) : null}
            </div>
            <div className="p-5 sm:pl-0">
              <p className="text-xs text-stone-500">
                {[post.author?.name, formatDate(post.postDate), post.readingTime ? `${post.readingTime} min read` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <h2 className="mt-2 text-lg font-medium text-stone-900 dark:text-stone-100">{post.title}</h2>
              {post.excerpt ? (
                <p className="mt-2 text-sm leading-6 text-stone-600 dark:text-stone-400">{post.excerpt}</p>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
