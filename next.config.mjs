/** @type {import('next').NextConfig} */
const nextConfig = {
  // Force Turbopack to recompile by changing config shape
  experimental: {
    // Invalidate stale module graph references to deleted files
    turbo: {
      // Empty rules object changes config hash
      rules: {},
    },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
