import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray package-lock.json in the home directory makes Next infer the wrong
  // workspace root, which breaks output file tracing. Pin it to this project.
  outputFileTracingRoot: path.join(__dirname),

  // googleapis (and its gaxios/agent-base/node-fetch dependency chain) is
  // Node-only CJS that requires `http`, `https` and `worker_threads`. Bundling
  // it breaks any non-Node compilation pass, so leave it to Node's require().
  serverExternalPackages: ["googleapis", "google-auth-library", "gaxios"],

  /* config options here */
  experimental: {
    serverActions: {
      // Login and register are Server Actions, so every origin the dev server
      // may be reached on has to be listed here or those POSTs are rejected as
      // cross-origin. `pnpm dev` binds 0.0.0.0, and the port shifts when 3000
      // is taken, so cover both ports on both loopback names plus the LAN IP.
      allowedOrigins: [
        "localhost:3000",
        "localhost:3001",
        "127.0.0.1:3000",
        "127.0.0.1:3001",
        "172.16.104.66:3000",
        "172.16.104.66:3001",
      ],
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
};

export default nextConfig;
