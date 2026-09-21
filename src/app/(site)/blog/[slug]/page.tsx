import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { RichTextBody } from "@/components/RichTextBody";
import { formatDate } from "@/components/Prose";
import { getPost, getPostSlugs } from "@/hygraph/queries";

export async function generateStaticParams() {
  const posts = await getPostSlugs();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return {};

  return {
    title: post.seo?.title ? { absolute: post.seo.title } : post.title,
    description: post.seo?.description ?? post.excerpt ?? undefined,
  };
}

export default async function PostPage({ params }: PageProps<"/blog/[slug]">) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  // `content` is the localized field; `body` is the legacy non-localized one
  // kept for the entries that predate the migration.
  const richText = post.content?.raw ? post.content : post.body;

  return (
    <article>
      <header className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl dark:text-stone-100">
          {post.title}
        </h1>
        {post.excerpt ? (
          <p className="mt-4 text-lg leading-8 text-stone-600 dark:text-stone-400">{post.excerpt}</p>
        ) : null}
        <p className="mt-5 text-sm text-stone-500">
          {[
            post.author?.name,
            post.author?.title,
            formatDate(post.postDate),
            post.readingTime ? `${post.readingTime} min read` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      {post.coverImage ? (
        <div className="relative mx-auto mt-10 aspect-16/9 max-w-4xl overflow-hidden rounded-lg bg-stone-100 dark:bg-stone-900">
          <Image
            src={post.coverImage.url}
            alt=""
            fill
            sizes="(max-width: 1024px) 100vw, 900px"
            className="object-cover"
            priority
          />
        </div>
      ) : null}

      <div className="mx-auto mt-12 max-w-3xl">
        <RichTextBody content={richText} />
      </div>

      {post.tags.length > 0 ? (
        <div className="mx-auto mt-10 flex max-w-3xl flex-wrap gap-2">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-600 dark:bg-stone-900 dark:text-stone-400"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
