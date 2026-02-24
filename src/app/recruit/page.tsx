import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "採用情報",
  description: "株式会社ミチビキの採用情報",
};

export default function RecruitPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="mb-14 text-center">
        <p className="text-blue-600 text-sm font-semibold tracking-widest mb-2">RECRUIT</p>
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900">採用情報</h1>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-10 md:p-16 text-center">
        <div className="text-5xl mb-6">🙏</div>
        <h2 className="text-xl font-bold text-gray-900 mb-4">現在、募集中のポジションはありません</h2>
        <p className="text-gray-500 text-sm leading-relaxed mb-8 max-w-md mx-auto">
          現時点では採用募集を行っておりませんが、
          ご興味をお持ちいただける方はお気軽にお問い合わせください。
          将来的な採用情報はこちらのページで随時お知らせします。
        </p>
        <Link
          href="/contact"
          className="inline-block px-8 py-3 border border-gray-300 text-gray-600 text-sm font-semibold rounded-full hover:border-blue-500 hover:text-blue-600 transition-colors"
        >
          お問い合わせはこちら
        </Link>
      </div>
    </div>
  );
}
