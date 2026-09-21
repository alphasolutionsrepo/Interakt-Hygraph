import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { RichTextBody } from "@/components/RichTextBody";
import { PageHeader, formatDate } from "@/components/Prose";
import { getPolicy, getPolicySlugs } from "@/hygraph/queries";

/**
 * Catch-all for standing pages (shipping, returns, privacy...).
 *
 * This sits at the root of the (site) group, so generateStaticParams must list
 * exactly the policy slugs — anything else falls through to notFound().
 */
export async function generateStaticParams() {
  const policies = await getPolicySlugs();
  return policies.map((policy) => ({ policy: policy.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps<"/[policy]">): Promise<Metadata> {
  const { policy: slug } = await params;
  const policy = await getPolicy(slug);
  if (!policy) return {};

  return {
    title: policy.seo?.title ? { absolute: policy.seo.title } : policy.title,
    description: policy.seo?.description ?? policy.summary ?? undefined,
  };
}

export default async function PolicyPage({ params }: PageProps<"/[policy]">) {
  const { policy: slug } = await params;
  const policy = await getPolicy(slug);
  if (!policy) notFound();

  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Policy" title={policy.title} lede={policy.summary} />
      {policy.effectiveDate ? (
        <p className="-mt-6 mb-10 text-sm text-stone-500">
          Effective {formatDate(policy.effectiveDate)}
        </p>
      ) : null}
      <RichTextBody content={policy.body} />
    </div>
  );
}
