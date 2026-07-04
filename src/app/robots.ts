import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: "https://www.michi-biki.jp/sitemap.xml",
    host: "https://www.michi-biki.jp",
  };
}
