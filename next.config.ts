import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app now has a database and API routes, so it runs as a server app
  // rather than a static export. Deploy target: Lambda/Amplify (see DEPLOYMENT.md).
  serverExternalPackages: ["postgres"],
  images: { unoptimized: true },
};

export default nextConfig;
