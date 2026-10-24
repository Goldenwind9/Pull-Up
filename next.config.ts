import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp has native code, so keep it out of the bundle.
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
