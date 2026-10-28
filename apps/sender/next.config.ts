import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages are TypeScript source (ADR 0003).
  transpilePackages: ["@gifting/domain", "@gifting/ui"],
};

export default nextConfig;
