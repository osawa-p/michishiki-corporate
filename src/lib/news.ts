import fs from "fs";
import path from "path";
import matter from "gray-matter";

const newsDir = path.join(process.cwd(), "src/content/news");

export type NewsPost = {
  slug: string;
  title: string;
  date: string;
  category: string;
  excerpt: string;
  content: string;
};

export function getAllNews(): Omit<NewsPost, "content">[] {
  if (!fs.existsSync(newsDir)) return [];
  const files = fs.readdirSync(newsDir).filter((f) => f.endsWith(".md"));
  return files
    .map((filename) => {
      const slug = filename.replace(/\.md$/, "");
      const filePath = path.join(newsDir, filename);
      const { data } = matter(fs.readFileSync(filePath, "utf8"));
      return {
        slug,
        title: data.title ?? "",
        date: data.date ?? "",
        category: data.category ?? "お知らせ",
        excerpt: data.excerpt ?? "",
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getNewsBySlug(slug: string): NewsPost | null {
  const filePath = path.join(newsDir, `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);
  return {
    slug,
    title: data.title ?? "",
    date: data.date ?? "",
    category: data.category ?? "お知らせ",
    excerpt: data.excerpt ?? "",
    content,
  };
}
