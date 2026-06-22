import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "r2.thesportsdb.com", pathname: "/images/media/**" },
      { protocol: "https", hostname: "www.thesportsdb.com", pathname: "/images/media/**" },
    ],
  },
};

export default nextConfig;
