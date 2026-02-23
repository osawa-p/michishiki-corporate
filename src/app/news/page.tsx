import type { Metadata } from "next";
import Link from "next/link";
import { getAllNews } from "@/lib/news";

export const metadata: Metadata = {
  title: "お知らせ",
  description: "株式会社ミチビキからのお知らせ一覧",
};

export default function NewsPage() {
  const posts = getAllNews();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="mb-14 text-center">
        <p className="text-blue-600 text-sm font-semibold tracking-widest mb-2">NEWS</p>
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900">お知らせ</h1>
      </div>

      {posts.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-4">📭</p>
          <p>現在お知らせはありません。</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/news/${post.slug}`}
              className="block bg-white rounded-2xl shadow-sm p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <span className="text-xs text-gray-400">{post.date}</span>
                <span className="px-3 py-0.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full">
                  {post.category}
                </span>
              </div>
              <h2 className="text-base font-bold text-gray-900 hover:text-blue-600 transition-colors">
                {post.title}
              </h2>
              {post.excerpt && (
                <p className="mt-2 text-sm text-gray-500 line-clamp-2">{post.excerpt}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
