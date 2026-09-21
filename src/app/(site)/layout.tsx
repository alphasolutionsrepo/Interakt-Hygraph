import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { getNavPolicies } from "@/hygraph/queries";

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const policies = await getNavPolicies();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12">{children}</main>
      <SiteFooter policies={policies} />
      {/* Phase 2 mounts the Interakt floating chat widget here. */}
      <div id="interakt-chat" />
    </>
  );
}
