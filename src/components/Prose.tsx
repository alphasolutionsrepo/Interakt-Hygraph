import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  lede,
}: {
  eyebrow?: string;
  title: string;
  lede?: string | null;
}) {
  return (
    <header className="mb-10 max-w-3xl">
      {eyebrow ? (
        <p className="mb-2 text-xs font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl dark:text-stone-100">
        {title}
      </h1>
      {lede ? <p className="mt-4 text-lg leading-8 text-stone-600 dark:text-stone-400">{lede}</p> : null}
    </header>
  );
}

export function Section({
  title,
  href,
  linkLabel,
  children,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-16">
      <div className="mb-5 flex items-baseline justify-between">
        <h2 className="text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
          {title}
        </h2>
        {href ? (
          <a href={href} className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">
            {linkLabel ?? "See all"}
          </a>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function formatDate(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** BUYING_GUIDE -> Buying guide */
export function humanise(value: string | null) {
  if (!value) return "";
  const lower = value.toLowerCase().replace(/_/g, " ");
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
