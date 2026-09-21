import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { siteName, siteTagline, siteUrl } from "@/hygraph/env";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: `${siteName} — ${siteTagline}`, template: `%s | ${siteName}` },
  description:
    "Meridian is a demonstration storefront: apparel and outdoor equipment, buying guides and support content served from Hygraph.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
