import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { DropinWidget } from "@/components/interakt/DropinWidget";
import { getNavPolicies } from "@/hygraph/queries";

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const policies = await getNavPolicies();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12">{children}</main>
      <SiteFooter policies={policies} />

      {/* Interakt assistant, floating on every page. */}
      <DropinWidget
        kind="chat"
        containerId="interakt-chat"
        baseUrl={process.env.NEXT_PUBLIC_INTERAKT_BASE_URL}
        accessToken={process.env.NEXT_PUBLIC_INTERAKT_CHAT_TOKEN}
        config={{ launcher: "floating", placement: "bottom-right", theme: "auto" }}
      />
    </>
  );
}
