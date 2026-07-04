import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getAllBlogPosts, getBlogPostBySlug } from "@/lib/blog";
import { remark } from "remark";
import remarkHtml from "remark-html";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) return {};
  return { title: post.title, description: post.excerpt || undefined };
}

export async function generateStaticParams() {
  return getAllBlogPosts().map((p) => ({ slug: p.slug }));
}

export default async function BlogDetailPage({ params }: Props) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) notFound();

  const htmlContent = (await remark().use(remarkHtml).process(post.content)).toString();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
      <Link
        href="/blog"
        className="inline-flex items-center text-sm text-bronze-deep hover:text-ink transition-colors mb-10"
      >
        ← ブログ一覧へ戻る
      </Link>

      <article>
        <header className="mb-10 pb-8 border-b border-line">
          <div className="flex flex-wrap items-center gap-4 mb-5">
            <time className="text-xs text-ink-faint tracking-wider">{post.date}</time>
            <span className="text-[10px] tracking-[0.2em] uppercase text-bronze-deep border border-bronze/40 px-2.5 py-0.5">
              {post.category}
            </span>
          </div>
          <h1 className="font-serif text-2xl md:text-3xl font-semibold leading-relaxed">
            {post.title}
          </h1>
        </header>
        <div
          className="article-body text-sm md:text-[15px] text-ink-soft"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      </article>
    </div>
  );
}
