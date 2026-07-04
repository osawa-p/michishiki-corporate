import type { MetadataRoute } from "next";
import { getAllNews } from "@/lib/news";
import { getAllBlogPosts } from "@/lib/blog";
import { services } from "@/lib/services";

const baseUrl = "https://www.michi-biki.jp";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/service`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/news`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/recruit`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.5,
    },
  ];

  const serviceRoutes: MetadataRoute.Sitemap = services.map((service) => ({
    url: `${baseUrl}/service/${service.slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  const newsRoutes: MetadataRoute.Sitemap = getAllNews().map((post) => ({
    url: `${baseUrl}/news/${post.slug}`,
    lastModified: post.date ? new Date(post.date) : now,
    changeFrequency: "yearly",
    priority: 0.6,
  }));

  const blogRoutes: MetadataRoute.Sitemap = getAllBlogPosts().map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: post.date ? new Date(post.date) : now,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...serviceRoutes, ...newsRoutes, ...blogRoutes];
}
