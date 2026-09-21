import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "us-east-1-shared-usea1-02.graphassets.com",
      },
    ],
  },
  experimental: {
    // ~180 static pages, each hitting the Hygraph CDN. The default worker count
    // saturates the project's read limit; two keeps the build inside it.
    cpus: 2,
  },
};

export default nextConfig;
