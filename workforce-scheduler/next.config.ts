import type { NextConfig } from "next";
import path from "node:path";

// `npm run build:ios` sets NEXT_OUTPUT=export to build the iPhone app: a
// self-contained copy of the whole app (in out/) that runs on the phone.
const isAppBuild = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(process.cwd()),
  },
  ...(isAppBuild
    ? {
        output: "export" as const,
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {
        // The iPhone app calls the AI assistant on the website; allow that.
        async headers() {
          return [
            {
              source: "/api/:path*",
              headers: [
                { key: "Access-Control-Allow-Origin", value: "*" },
                { key: "Access-Control-Allow-Methods", value: "POST, OPTIONS" },
                { key: "Access-Control-Allow-Headers", value: "Authorization, Content-Type" },
              ],
            },
          ];
        },
      }),
};

export default nextConfig;
