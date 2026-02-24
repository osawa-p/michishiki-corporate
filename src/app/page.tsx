import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "株式会社ミチビキ | SEO・LLMO支援",
  description: "SEO・LLMOを軸に、検索エンジンからAIアシスタントまで。あなたのビジネスが正しく見つかる仕組みを、戦略から実装まで一貫して支援します。",
};

export default function HomePage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10"
          style={{backgroundImage: "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)", backgroundSize: "40px 40px"}} />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-36">
          <p className="text-blue-400 text-xs font-semibold tracking-[0.3em] mb-5 uppercase">
            michibiki inc. — Web Marketing
          </p>
          <h1 className="text-4xl md:text-6xl font-bold leading-tight mb-6 tracking-tight">
            検索される、<br />
            <span className="text-blue-400">AIに選ばれる。</span>
          </h1>
          <p className="text-slate-300 text-lg md:text-xl leading-relaxed mb-4 max-w-2xl">
            SEO・LLMOを軸に、Googleだけでなく ChatGPT・Gemini などの
            AIアシスタントにも選ばれるコンテンツ戦略を提供します。
          </p>
          <p className="text-slate-400 text-base leading-relaxed mb-10 max-w-xl">
            DB型SEOの設計・実装からディレクション、DX化まで。
            ウェブ集客の新常識を、一緒につくりましょう。
          </p>
          <div className="flex flex-wrap gap-4">
            <Link href="/service" className="px-8 py-3 bg-blue-500 text-white font-semibold rounded-full hover:bg-blue-400 transition-colors">
              サービスを見る
            </Link>
            <Link href="/contact" className="px-8 py-3 border border-slate-500 text-slate-200 font-semibold rounded-full hover:border-white hover:text-white transition-colors">
              無料相談する
            </Link>
          </div>
          <div className="flex flex-wrap gap-2 mt-12">
            {["SEO", "LLMO", "DB型SEO", "AXO", "コンテンツ戦略", "ディレクション"].map((tag) => (
              <span key={tag} className="px-3 py-1 bg-white/10 text-slate-300 text-xs rounded-full border border-white/10">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Services Overview */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-blue-600 text-sm font-semibold tracking-widest mb-2">SERVICES</p>
            <h2 className="text-3xl font-bold text-gray-900">私たちのサービス</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {[
              {
                icon: "🔍",
                title: "SEO・LLMO支援",
                desc: "検索エンジン最適化（SEO）に加え、AIが回答に引用するコンテンツへの最適化（LLMO）を一気通貫で支援。DB型SEOの設計・実装を得意とします。",
              },
              {
                icon: "🐕",
                title: "犬のトリミングDB（運営予定）",
                desc: "犬のトリミングサロン情報を集約したDBポータルサイト。エリア・犬種・料金で比較できる新しいプラットフォームを構築中です。",
              },
            ].map((item) => (
              <div key={item.title} className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow">
                <div className="text-4xl mb-5">{item.icon}</div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">{item.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link href="/service" className="text-blue-600 font-medium hover:underline">
              サービス詳細を見る →
            </Link>
          </div>
        </div>
      </section>

      {/* About CTA */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-slate-900 rounded-3xl p-10 md:p-16 text-white text-center">
            <p className="text-blue-400 text-xs font-semibold tracking-widest mb-3">ABOUT</p>
            <h2 className="text-2xl md:text-3xl font-bold mb-4">ミチビキについて</h2>
            <p className="text-slate-300 mb-8 text-base md:text-lg max-w-xl mx-auto leading-relaxed">
              神奈川県横浜市を拠点に、SEO・LLMOを中心としたWebマーケティング支援を行っています。
            </p>
            <Link href="/about" className="inline-block px-8 py-3 bg-blue-500 text-white font-semibold rounded-full hover:bg-blue-400 transition-colors">
              会社概要へ
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
