import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 月次レポートHTMLは route handler が fs で動的に読むため、
  // 自動トレーシングに検出されない。明示的にサーバーバンドルへ含める。
  outputFileTracingIncludes: {
    "/rank-tracker/reports": ["./src/data/reports/rasik/*.html"],
    "/rank-tracker/reports/rasik/[month]": ["./src/data/reports/rasik/*.html"],
  },
};

export default nextConfig;
