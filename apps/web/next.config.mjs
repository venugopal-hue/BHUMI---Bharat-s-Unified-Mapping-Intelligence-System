/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },

  async rewrites() {
    // In production the frontend calls the Railway API directly via NEXT_PUBLIC_API_URL.
    // This rewrite is only active in local dev (localhost:3000 → localhost:8000).
    if (process.env.NODE_ENV === "production") return [];
    return [
      {
        source: "/api/v1/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
