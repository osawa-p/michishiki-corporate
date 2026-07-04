import type { Metadata } from "next";
import Link from "next/link";
import { getAllBlogPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "ブログ",
  description:
    "SEO・AXO/LLMOをはじめとするWebマーケティングの知見やノウハウを発信する、株式会社ミチビキのブログです。",
};

export default function BlogPage() {
  const posts = getAllBlogPosts();

  return (
    <>
      {/* Page Header */}
      <section className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">Blog</p>
          <h1 className="font-serif text-4xl md:text-5xl font-semibold">ブログ</h1>
          <p className="mt-5 text-sm text-ink-soft leading-relaxed">
            SEO・AXO/LLMOをはじめとするWebマーケティングの知見やノウハウを発信します。
          </p>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {posts.length === 0 ? (
            <p className="text-center py-20 text-ink-faint">現在記事はありません。</p>
          ) : (
            <div className="border-t border-line">
              {posts.map((post) => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="group block py-7 border-b border-line hover:bg-white/60 transition-colors px-2"
                >
                  <div className="flex flex-wrap items-center gap-4 mb-3">
                    <time className="text-xs text-ink-faint tracking-wider">{post.date}</time>
                    <span className="text-[10px] tracking-[0.2em] uppercase text-bronze-deep border border-bronze/40 px-2.5 py-0.5">
                      {post.category}
                    </span>
                  </div>
                  <h2 className="font-serif text-lg font-semibold group-hover:text-bronze-deep transition-colors">
                    {post.title}
                  </h2>
                  {post.excerpt && (
                    <p className="mt-2 text-sm text-ink-soft leading-relaxed line-clamp-2">
                      {post.excerpt}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
