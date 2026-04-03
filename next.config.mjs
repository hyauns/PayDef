/** @type {import('next').NextConfig} */
// Cache bust: middleware.ts (not proxy.ts) is the active middleware file
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
