import Link from "next/link";
import { siteName, siteTagline } from "@/hygraph/env";

const NAV = [
  { href: "/products", label: "Shop" },
  { href: "/categories", label: "Categories" },
  { href: "/guides", label: "Guides" },
  { href: "/blog", label: "Journal" },
  { href: "/faq", label: "Help" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/90 backdrop-blur dark:border-stone-800 dark:bg-stone-950/90">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4">
        <Link href="/" className="flex flex-col leading-none">
          <span className="text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-100">
            {siteName}
          </span>
          <span className="text-xs text-stone-500">{siteTagline}</span>
        </Link>

        <nav className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-stone-600 transition hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Phase 2 mounts the Interakt search widget here. */}
        <div className="ml-auto" id="interakt-search" />
      </div>
    </header>
  );
}

export function SiteFooter({ policies }: { policies: { slug: string; title: string }[] }) {
  return (
    <footer className="mt-20 border-t border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-stone-600 dark:text-stone-400">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {policies.map((policy) => (
            <Link key={policy.slug} href={`/${policy.slug}`} className="hover:text-stone-900 dark:hover:text-stone-100">
              {policy.title}
            </Link>
          ))}
        </div>
        <p className="text-xs text-stone-500">
          {siteName} is a demonstration site. Content is fictional and generated for testing search and chat.
        </p>
      </div>
    </footer>
  );
}
