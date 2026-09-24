import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/Prose";
import { SearchExperience } from "@/components/search/SearchExperience";

export const metadata: Metadata = {
  title: "Search",
  description: "Search the Meridian catalogue, buying guides and help content.",
};

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";

  return (
    <div>
      <PageHeader
        eyebrow="Search"
        title="Search"
        lede="One search across the catalogue, the buying guides and the help centre."
      />
      {/* keyed on q so arriving from the header box starts a fresh search */}
      <Suspense fallback={null}>
        <SearchExperience key={q} initialQuery={q} />
      </Suspense>
    </div>
  );
}
