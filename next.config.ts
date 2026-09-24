import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` refuses cross-origin requests for its internal assets unless the
  // origin is listed here, which breaks the tunnel Hygraph Studio loads the app
  // through. Production (`next start`) ignores this.
  allowedDevOrigins: ["moose-chief-hippo.ngrok.app"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "us-east-1-shared-usea1-02.graphassets.com",
      },
    ],
  },
  async headers() {
    return [
      {
        // The Hygraph app renders inside an iframe in Studio. Next sends no
        // X-Frame-Options by default, but being explicit documents the intent
        // and keeps every other route un-frameable.
        source: "/hygraph-app/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors https://*.hygraph.com https://*.graphcms.com",
          },
        ],
      },
    ];
  },
  experimental: {
    // ~180 static pages, each hitting the Hygraph CDN. The default worker count
    // saturates the project's read limit; two keeps the build inside it.
    cpus: 2,
  },
};

export default nextConfig;
