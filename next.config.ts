import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // The auth pages moved under /auth/* — these keep old bookmarks and any
  // already-sent verification/reset emails (which embed the old path) working.
  async redirects() {
    return [
      { source: "/login", destination: "/auth/login", permanent: true },
      { source: "/signup", destination: "/auth/signup", permanent: true },
      { source: "/verify-email", destination: "/auth/verify-email", permanent: true },
      { source: "/forgot-password", destination: "/auth/forgot-password", permanent: true },
      { source: "/reset-password", destination: "/auth/reset-password", permanent: true },
    ];
  },
};

export default nextConfig;
