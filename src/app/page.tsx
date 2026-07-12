import Link from "next/link";
import type { Metadata } from "next";
import { services } from "@/lib/services";
import { getAllNews } from "@/lib/news";
import CtaSection from "@/components/CtaSection";

export const metadata: Metadata = {
  title: "株式会社ミチビキ | SEO・AXO/LLMOコンサルティング",
  description:
    "検索にも、AIにも、選ばれる会社へ。SEO・AXO/LLMO（AI検索最適化）・CVR改善・データ分析に加え、店舗向けのWeb制作・サイト運用まで、戦略から実装まで一貫して支援します。",
};

const strengths = [
  {
    num: "01",
    title: "戦略から実装まで、ひとつなぎ",
    desc: "調査レポートや戦略提案で終わらせません。キーワード設計からコンテンツ制作、テクニカル対応、計測基盤の構築まで、成果が出るところまで自ら手を動かします。",
  },
  {
    num: "02",
    title: "SEO × AI の二刀流",
    desc: "従来型SEOの積み上げと、AXO/LLMOという最前線の知見を掛け合わせ、検索体験の地殻変動に強い集客構造をつくります。AI・人材・ECなど複数業界での実務経験にもとづく支援です。",
  },
  {
    num: "03",
    title: "データで意思決定する",
    desc: "GA4×BigQueryの分析基盤とレポート自動化で、施策の効果を数字で検証。感覚ではなくデータにもとづいて、次の一手を判断し続けます。",
  },
];

export default function HomePage() {
  const latestNews = getAllNews().slice(0, 3);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        {/* 羅針盤モチーフ（装飾） */}
        <svg
          className="pointer-events-none absolute top-1/2 -translate-y-[58%] -right-40 md:-right-16 lg:right-8 w-[560px] h-[560px] md:w-[640px] md:h-[640px] text-bronze opacity-35 md:opacity-100"
          viewBox="0 0 640 640"
          fill="none"
          aria-hidden
        >
          <circle cx="320" cy="320" r="300" stroke="currentColor" strokeOpacity="0.25" strokeDasharray="2 10" />
          <circle cx="320" cy="320" r="236" stroke="currentColor" strokeOpacity="0.35" />
          <circle cx="320" cy="320" r="150" stroke="currentColor" strokeOpacity="0.25" />
          <circle cx="320" cy="320" r="64" stroke="currentColor" strokeOpacity="0.35" strokeDasharray="1 7" />
          <line x1="320" y1="20" x2="320" y2="84" stroke="currentColor" strokeOpacity="0.4" />
          <line x1="320" y1="556" x2="320" y2="620" stroke="currentColor" strokeOpacity="0.4" />
          <line x1="20" y1="320" x2="84" y2="320" stroke="currentColor" strokeOpacity="0.4" />
          <line x1="556" y1="320" x2="620" y2="320" stroke="currentColor" strokeOpacity="0.4" />
          {/* 針 */}
          <path d="M446 194 L342 342 L298 298 Z" fill="currentColor" fillOpacity="0.16" />
          <line x1="446" y1="194" x2="212" y2="428" stroke="currentColor" strokeOpacity="0.55" />
          <circle cx="320" cy="320" r="5" fill="currentColor" fillOpacity="0.6" />
        </svg>

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 md:pt-32 pb-14 md:pb-20">
          <div className="max-w-3xl">
            <p className="text-xs tracking-[0.35em] uppercase text-bronze mb-6">
              SEO / AXO / LLMO Consulting
            </p>
            <h1 className="font-serif text-4xl md:text-7xl font-semibold leading-[1.25] md:leading-[1.2] tracking-tight mb-8">
              検索にも、
              <br />
              AIにも、選ばれる。
            </h1>
            <p className="text-ink-soft text-base md:text-lg leading-relaxed mb-4 max-w-xl">
              Googleの検索結果から、ChatGPT・Geminiの回答まで。
              見つけられる場所は変わっても、「正しく見つけられること」の価値は変わりません。
            </p>
            <p className="text-ink-soft text-sm md:text-base leading-relaxed mb-10 max-w-xl">
              株式会社ミチビキは、SEOとAXO/LLMO（AI検索最適化）を軸に、
              集客の仕組みを戦略から実装まで伴走してつくります。
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/contact"
                className="px-8 py-3.5 bg-ink text-paper text-sm font-semibold hover:bg-bronze-deep transition-colors"
              >
                無料相談する
              </Link>
              <Link
                href="/service"
                className="px-8 py-3.5 border border-ink/30 text-ink text-sm font-semibold hover:border-bronze-deep hover:text-bronze-deep transition-colors"
              >
                サービスを見る
              </Link>
            </div>
          </div>

          {/* サービスインデックス */}
          <div className="mt-16 md:mt-24 grid grid-cols-2 md:grid-cols-5 gap-px bg-line border-t border-line">
            {services.map((service) => (
              <Link
                key={service.slug}
                href={`/service/${service.slug}`}
                className="group bg-paper py-5 pr-4 md:px-5 md:first:pl-0 hover:bg-white/70 transition-colors"
              >
                <span className="block font-serif text-lg text-bronze mb-1.5">{service.num}</span>
                <span className="block text-[13px] font-semibold leading-snug group-hover:text-bronze-deep transition-colors">
                  {service.title}
                </span>
                <span className="mt-2 block text-[10px] tracking-[0.2em] uppercase text-ink-faint">
                  {service.en}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="md:flex md:items-end md:justify-between mb-14">
            <div>
              <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">Services</p>
              <h2 className="font-serif text-3xl md:text-4xl font-semibold">事業内容</h2>
            </div>
            <p className="mt-4 md:mt-0 text-sm text-ink-soft max-w-md leading-relaxed">
              「見つけられる」から「成果になる」まで。集客の全工程を、5つの領域で支援します。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-line border border-line md:[&>*:last-child]:col-span-2">
            {services.map((service) => (
              <Link
                key={service.slug}
                href={`/service/${service.slug}`}
                className="group bg-paper p-8 md:p-10 hover:bg-white transition-colors"
              >
                <div className="flex items-baseline justify-between mb-6">
                  <span className="font-serif text-3xl text-bronze">{service.num}</span>
                  <span className="text-[10px] tracking-[0.25em] uppercase text-ink-faint">
                    {service.en}
                  </span>
                </div>
                <h3 className="font-serif text-xl font-semibold mb-3 group-hover:text-bronze-deep transition-colors">
                  {service.title}
                </h3>
                <p className="text-sm text-ink-soft leading-relaxed mb-6">{service.short}</p>
                <span className="text-xs font-semibold text-bronze-deep">
                  詳しく見る →
                </span>
              </Link>
            ))}
          </div>

          {/* 自社サービス */}
          <div className="mt-14 border border-bronze/40 bg-white/60 p-8 md:p-10">
            <div className="md:flex md:items-center md:justify-between gap-8">
              <div>
                <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-3">Our Service</p>
                <h3 className="font-serif text-xl md:text-2xl font-semibold mb-3">
                  うちの犬スタイル
                  <span className="ml-3 text-xs font-sans font-medium text-bronze-deep border border-bronze/40 px-2 py-0.5 align-middle">
                    自社運営
                  </span>
                </h3>
                <p className="text-sm text-ink-soft leading-relaxed max-w-2xl">
                  地域・犬種・口コミ・料金から、愛犬に合うトリミングサロン探しをサポートする全国対応の検索サイト。
                  当社のDB型SEOのノウハウを活かした自社サービスです。サロン情報の掲載申請は無料で受け付けています（審査制）。
                </p>
              </div>
              <div className="mt-6 md:mt-0 shrink-0">
                <a
                  href="https://trimming.michi-biki.jp"
                  target="_blank"
                  rel="noopener"
                  className="inline-block px-8 py-3.5 bg-ink text-paper text-sm font-semibold hover:bg-bronze-deep transition-colors"
                >
                  サイトを見る →
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Strengths */}
      <section className="bg-night text-paper py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">Why Michibiki</p>
          <h2 className="font-serif text-3xl md:text-4xl font-semibold mb-14">
            ミチビキが選ばれる理由
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8">
            {strengths.map((s) => (
              <div key={s.num} className="border-t border-stone-700 pt-6">
                <span className="font-serif text-2xl text-bronze">{s.num}</span>
                <h3 className="font-serif text-lg font-semibold mt-4 mb-3">{s.title}</h3>
                <p className="text-sm text-stone-400 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CEO */}
      <section className="py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">Message</p>
              <h2 className="font-serif text-2xl md:text-3xl font-semibold leading-snug mb-6">
                Webの世界で「道に迷わない」ための
                <br className="hidden md:block" />
                羅針盤でありたい。
              </h2>
              <p className="text-sm md:text-base text-ink-soft leading-relaxed mb-4 max-w-2xl">
                検索エンジンの最適化に加えて、AIに正しく認識され引用されることの重要性が急速に高まっています。
                ミチビキは、この変化の最前線で得た実務知見をもとに、企業の集客とブランディングを支援します。
              </p>
              <Link
                href="/about"
                className="inline-block text-sm font-semibold text-bronze-deep hover:text-ink transition-colors"
              >
                会社概要・代表メッセージ →
              </Link>
          </div>
        </div>
      </section>

      {/* News */}
      {latestNews.length > 0 && (
        <section className="border-t border-line py-20 md:py-24">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="md:flex md:items-end md:justify-between mb-10">
              <div>
                <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">News</p>
                <h2 className="font-serif text-3xl font-semibold">お知らせ</h2>
              </div>
              <Link
                href="/news"
                className="hidden md:inline-block text-sm font-semibold text-bronze-deep hover:text-ink transition-colors"
              >
                一覧を見る →
              </Link>
            </div>
            <div className="border-t border-line">
              {latestNews.map((post) => (
                <Link
                  key={post.slug}
                  href={`/news/${post.slug}`}
                  className="group flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-8 py-5 border-b border-line hover:bg-white/60 transition-colors px-2"
                >
                  <time className="text-xs text-ink-faint tracking-wider shrink-0">{post.date}</time>
                  <span className="text-[10px] tracking-[0.2em] uppercase text-bronze-deep border border-bronze/40 px-2.5 py-0.5 shrink-0 w-fit">
                    {post.category}
                  </span>
                  <span className="text-sm font-medium group-hover:text-bronze-deep transition-colors">
                    {post.title}
                  </span>
                </Link>
              ))}
            </div>
            <Link
              href="/news"
              className="md:hidden inline-block mt-6 text-sm font-semibold text-bronze-deep"
            >
              一覧を見る →
            </Link>
          </div>
        </section>
      )}

      <CtaSection />
    </>
  );
}
