import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ProductGrid } from "@/components/ProductCard";
import { RichTextBody } from "@/components/RichTextBody";
import { Section, formatDate, humanise } from "@/components/Prose";
import { getGuide, getGuideSlugs } from "@/hygraph/queries";

export async function generateStaticParams() {
  const guides = await getGuideSlugs();
  return guides.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: PageProps<"/guides/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const guide = await getGuide(slug);
  if (!guide) return {};

  return {
    title: guide.seo?.title ? { absolute: guide.seo.title } : guide.title,
    description: guide.seo?.description ?? guide.excerpt ?? undefined,
  };
}

export default async function GuidePage({ params }: PageProps<"/guides/[slug]">) {
  const { slug } = await params;
  const guide = await getGuide(slug);
  if (!guide) notFound();

  return (
    <article>
      <header className="mx-auto max-w-3xl">
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
          {humanise(guide.articleType)}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl dark:text-stone-100">
          {guide.title}
        </h1>
        {guide.excerpt ? (
          <p className="mt-4 text-lg leading-8 text-stone-600 dark:text-stone-400">{guide.excerpt}</p>
        ) : null}
        <p className="mt-5 text-sm text-stone-500">
          {[
            guide.authors[0]?.name,
            formatDate(guide.postDate),
            guide.readingTime ? `${guide.readingTime} min read` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      {guide.articleImage ? (
        <div className="relative mx-auto mt-10 aspect-16/9 max-w-4xl overflow-hidden rounded-lg bg-stone-100 dark:bg-stone-900">
          <Image
            src={guide.articleImage.url}
            alt=""
            fill
            sizes="(max-width: 1024px) 100vw, 900px"
            className="object-cover"
            priority
          />
        </div>
      ) : null}

      <div className="mx-auto mt-12 max-w-3xl">
        <RichTextBody content={guide.articleText} />
      </div>

      {guide.tags.length > 0 ? (
        <div className="mx-auto mt-10 flex max-w-3xl flex-wrap gap-2">
          {guide.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-600 dark:bg-stone-900 dark:text-stone-400"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {guide.featuredProducts.length > 0 ? (
        <Section title="Mentioned in this guide">
          <ProductGrid products={guide.featuredProducts} />
        </Section>
      ) : null}
    </article>
  );
}
