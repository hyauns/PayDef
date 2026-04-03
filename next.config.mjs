/** @type {import('next').NextConfig} */
const nextConfig = {
  // Cache invalidation timestamp: 2026-04-04T12:00:00Z
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
}

export default nextConfig
