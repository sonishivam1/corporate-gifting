import type { NextConfig } from "next";

import { IMAGE_HOSTS } from "./lib/images";

const nextConfig: NextConfig = {
  // Workspace packages are TypeScript source (ADR 0003).
  transpilePackages: ["@gifting/domain", "@gifting/ui"],
  images: {
    // Product photos; any other host is shown unoptimized (see lib/images.ts).
    remotePatterns: IMAGE_HOSTS.map((hostname) => ({ protocol: "https", hostname })),
  },
};

export default nextConfig;
