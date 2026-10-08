import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Type errors must fail the build — the type gate stays closed.
  // (ignoreBuildErrors intentionally NOT set, see issue #7)
  reactStrictMode: true,
};

export default nextConfig;
