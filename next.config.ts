import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Basic hardening headers for every response. (A Content-Security-Policy is not set: Next.js needs inline scripts.)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
  experimental: {
    // Photo uploads are posted to a server action. The default limit is 1 MB; the photo service itself enforces
    // 5 MB per photo and 8 photos per vehicle, so a request can never legitimately exceed this.
    serverActions: { bodySizeLimit: "42mb" },
  },
};

export default nextConfig;
