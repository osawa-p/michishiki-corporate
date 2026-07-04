import fs from "fs";
import path from "path";
import matter from "gray-matter";

const blogDir = path.join(process.cwd(), "src/content/blog");

export type BlogPost = {
  slug: string;
  title: string;
  date: string;
  category: string;
  excerpt: string;
  content: string;
};

export function getAllBlogPosts(): Omit<BlogPost, "content">[] {
  if (!fs.existsSync(blogDir)) return [];
  const files = fs.readdirSync(blogDir).filter((f) => f.endsWith(".md"));
  return files
    .map((filename) => {
      const slug = filename.replace(/\.md$/, "");
      const filePath = path.join(blogDir, filename);
      const { data } = matter(fs.readFileSync(filePath, "utf8"));
      return {
        slug,
        title: data.title ?? "",
        date: data.date ?? "",
        category: data.category ?? "コラム",
        excerpt: data.excerpt ?? "",
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getBlogPostBySlug(slug: string): BlogPost | null {
  const filePath = path.join(blogDir, `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);
  return {
    slug,
    title: data.title ?? "",
    date: data.date ?? "",
    category: data.category ?? "コラム",
    excerpt: data.excerpt ?? "",
    content,
  };
}
