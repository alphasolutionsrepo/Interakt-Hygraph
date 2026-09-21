import type { Metadata } from "next";
import { RichTextBody } from "@/components/RichTextBody";
import { PageHeader, humanise } from "@/components/Prose";
import { getFaqs } from "@/hygraph/queries";

export const metadata: Metadata = {
  title: "Help",
  description: "Shipping, returns, sizing, payments, product care, warranty and sustainability questions.",
};

export default async function FaqPage() {
  const faqs = await getFaqs();

  const grouped = faqs.reduce<Record<string, typeof faqs>>((acc, faq) => {
    (acc[faq.category] ??= []).push(faq);
    return acc;
  }, {});

  const categories = Object.keys(grouped).sort();

  return (
    <div>
      <PageHeader
        eyebrow="Support"
        title="Help"
        lede={`${faqs.length} answers covering delivery, returns, sizing, care and warranty.`}
      />

      <nav className="mb-12 flex flex-wrap gap-2">
        {categories.map((category) => (
          <a
            key={category}
            href={`#${category.toLowerCase()}`}
            className="rounded-full border border-stone-300 px-3 py-1 text-sm text-stone-600 transition hover:border-stone-500 dark:border-stone-700 dark:text-stone-400"
          >
            {humanise(category)}
          </a>
        ))}
      </nav>

      <div className="max-w-3xl space-y-14">
        {categories.map((category) => (
          <section key={category} id={category.toLowerCase()} className="scroll-mt-24">
            <h2 className="mb-6 text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
              {humanise(category)}
            </h2>
            <div className="divide-y divide-stone-200 border-y border-stone-200 dark:divide-stone-800 dark:border-stone-800">
              {grouped[category].map((faq) => (
                <details key={faq.slug} id={faq.slug} className="group scroll-mt-24 py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-stone-900 dark:text-stone-100">
                    {faq.question}
                    <span className="text-stone-400 transition group-open:rotate-45">+</span>
                  </summary>
                  <div className="mt-4">
                    <RichTextBody content={faq.answer} />
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
