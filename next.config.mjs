/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Firebase App Hosting sets FIREBASE_WEBAPP_CONFIG at build; expose for client-side Firebase init.
  env: {
    NEXT_PUBLIC_FIREBASE_WEBAPP_CONFIG:
      process.env.FIREBASE_WEBAPP_CONFIG ||
      process.env.NEXT_PUBLIC_FIREBASE_WEBAPP_CONFIG ||
      "",
  },
}

export default nextConfig
