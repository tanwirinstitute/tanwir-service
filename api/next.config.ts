import type { NextConfig } from "next";

// No turbopack.root: Next.js finds the workspace root from the root
// package-lock.json, which also lets it resolve @tanwir/shared.
const nextConfig: NextConfig = {};

export default nextConfig;
