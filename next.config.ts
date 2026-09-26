import type { NextConfig } from "next";

// Accept the variable names the Vercel ↔ Supabase integration creates, too.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  "";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseKey,
    // Which deploy this build is — lets open apps notice a newer one (see UpdateBanner).
    NEXT_PUBLIC_BUILD: process.env.VERCEL_GIT_COMMIT_SHA || "dev",
  },
  images: {
    // YouTube thumbnails. Also lets the browser read thumbnail pixels
    // same-origin (via /_next/image) to build the background gradient.
    remotePatterns: [{ protocol: "https", hostname: "i.ytimg.com" }],
  },
};

export default nextConfig;
