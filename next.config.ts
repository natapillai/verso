import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // The Neon driver opens a real WebSocket from the server. Bundling it, or the
  // ws package it uses, breaks the connection at runtime. Both stay external.
  serverExternalPackages: ["ws", "@neondatabase/serverless"],
};

export default nextConfig;
