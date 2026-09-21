import Image from "next/image";
import Link from "next/link";
import { ProductGrid } from "@/components/ProductCard";
import { Section, formatDate, humanise } from "@/components/Prose";
import { getHomeData } from "@/hygraph/queries";
import { pathFor } from "@/hygraph/routes";

export default async function HomePage() {
  const { featured, latest, categories, guides, posts } = await getHomeData();

  return (
    <div>
      <section className="max-w-3xl">
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
          Apparel and outdoor supply
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl dark:text-stone-100">
          Equipment chosen for weather that has already turned.
        </h1>
        <p className="mt-5 text-lg leading-8 text-stone-600 dark:text-stone-400">
          We publish the numbers that matter — hydrostatic head, fill weight, R-value, torso
          length — because they predict comfort far better than a marketing tier name does.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/products"
            className="rounded-md bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
          >
            Browse the range
          </Link>
          <Link
            href="/guides"
            className="rounded-md border border-stone-300 px-5 py-2.5 text-sm font-medium text-stone-800 transition hover:border-stone-500 dark:border-stone-700 dark:text-stone-200"
          >
            Read the buying guides
          </Link>
        </div>
      </section>

      <Section title="Highest rated" href="/products" linkLabel="All products">
        <ProductGrid products={featured} />
      </Section>

      <Section title="Shop by category" href="/categories" linkLabel="All categories">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {categories.map((category) => (
            <Link
              key={category.slug}
              href={pathFor("category", category.slug)}
              className="group relative flex aspect-3/2 flex-col justify-end overflow-hidden rounded-lg border border-stone-200 p-4 dark:border-stone-800"
            >
              {category.heroImage ? (
                <Image
                  src={category.heroImage.url}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className="object-cover transition duration-300 group-hover:scale-105"
                />
              ) : null}
              <div className="absolute inset-0 bg-linear-to-t from-stone-950/80 to-stone-950/10" />
              <span className="relative font-medium text-white">{category.categoryName}</span>
              {category.excerpt ? (
                <span className="relative mt-1 line-clamp-2 text-xs text-stone-200">
                  {category.excerpt}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      </Section>

      <Section title="Buying guides" href="/guides" linkLabel="All guides">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {guides.map((guide) => (
            <Link
              key={guide.slug}
              href={pathFor("article", guide.slug)}
              className="rounded-lg border border-stone-200 p-5 transition hover:border-stone-400 dark:border-stone-800 dark:hover:border-stone-600"
            >
              <p className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                {humanise(guide.articleType)}
                {guide.readingTime ? ` · ${guide.readingTime} min` : ""}
              </p>
              <h3 className="mt-2 font-medium text-stone-900 dark:text-stone-100">{guide.title}</h3>
              {guide.excerpt ? (
                <p className="mt-2 line-clamp-3 text-sm text-stone-600 dark:text-stone-400">
                  {guide.excerpt}
                </p>
              ) : null}
            </Link>
          ))}
        </div>
      </Section>

      <Section title="New in" href="/products" linkLabel="All products">
        <ProductGrid products={latest.slice(0, 4)} />
      </Section>

      <Section title="From the journal" href="/blog" linkLabel="All posts">
        <div className="grid gap-4 sm:grid-cols-3">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={pathFor("post", post.slug)}
              className="group overflow-hidden rounded-lg border border-stone-200 dark:border-stone-800"
            >
              <div className="relative aspect-16/9 bg-stone-100 dark:bg-stone-900">
                {post.coverImage ? (
                  <Image
                    src={post.coverImage.url}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover transition duration-300 group-hover:scale-105"
                  />
                ) : null}
              </div>
              <div className="p-4">
                <p className="text-xs text-stone-500">{formatDate(post.postDate)}</p>
                <h3 className="mt-1 font-medium text-stone-900 dark:text-stone-100">{post.title}</h3>
                {post.excerpt ? (
                  <p className="mt-2 line-clamp-2 text-sm text-stone-600 dark:text-stone-400">
                    {post.excerpt}
                  </p>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      </Section>
    </div>
  );
}
