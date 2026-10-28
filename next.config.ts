import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets verification builds write elsewhere so they never clobber a running `next dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
