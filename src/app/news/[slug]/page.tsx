import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getAllNews, getNewsBySlug } from "@/lib/news";
import { remark } from "remark";
import remarkHtml from "remark-html";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getNewsBySlug(slug);
  if (!post) return {};
  return { title: post.title };
}

export async function generateStaticParams() {
  return getAllNews().map((p) => ({ slug: p.slug }));
}

export default async function NewsDetailPage({ params }: Props) {
  const { slug } = await params;
  const post = getNewsBySlug(slug);
  if (!post) notFound();

  const htmlContent = (await remark().use(remarkHtml).process(post.content)).toString();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <Link href="/news" className="inline-flex items-center text-sm text-blue-600 hover:underline mb-8">
        ← お知らせ一覧へ戻る
      </Link>

      <article className="bg-white rounded-2xl shadow-sm p-8 md:p-12">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="text-xs text-gray-400">{post.date}</span>
          <span className="px-3 py-0.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full">
            {post.category}
          </span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">{post.title}</h1>
        <div
          className="prose prose-sm max-w-none text-gray-700 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      </article>
    </div>
  );
}
