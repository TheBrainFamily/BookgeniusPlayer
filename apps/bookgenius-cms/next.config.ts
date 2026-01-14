import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow importing from ../convex
  transpilePackages: ["convex"],

  // Experimental features for better performance
  experimental: {
    // Enable React 19 features
    reactCompiler: false,
  },
};

export default nextConfig;
