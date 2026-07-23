import type { NextConfig } from "next";

const securityHeaders = [
  // SAMEORIGIN (not DENY) so first-party previews, such as the generated
  // handover/clearance PDFs, can be embedded; other origins still cannot frame us.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      // Same-origin framing enables the in-app PDF preview; cross-origin is still blocked.
      "frame-ancestors 'self'",
      "form-action 'self'",
      "base-uri 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2", "pdfkit", "bullmq", "ioredis", "exceljs", "nodemailer"],
  experimental: {
    serverActions: {
      // Public request forms support file uploads (SDS Doc 22); limit enforced
      // again in application code via configurable setting.
      bodySizeLimit: "25mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
