import type { Metadata } from "next";
import { PageHeader } from "@/components/Prose";

export const metadata: Metadata = {
  title: "Search",
  description: "Search the Meridian catalogue and guides.",
};

/**
 * Placeholder. Phase 2 replaces this with the Interakt search experience —
 * query box with autocomplete, facet sidebar, streamed AI summary and
 * displayConfig-driven result cards.
 */
export default function SearchPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Search"
        title="Search"
        lede="Search is not wired up yet. This page becomes the Interakt search experience in the next phase."
      />
      <div className="rounded-lg border border-dashed border-stone-300 p-10 text-center text-stone-500 dark:border-stone-700">
        Interakt search experience mounts here.
      </div>
    </div>
  );
}
