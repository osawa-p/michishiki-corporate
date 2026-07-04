import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { services } from "@/lib/services";
import { getAllNews } from "@/lib/news";
import CtaSection from "@/components/CtaSection";

export const metadata: Metadata = {
  title: "株式会社ミチビキ | SEO・AXO/LLMOコンサルティング",
  description:
    "検索にも、AIにも、選ばれる会社へ。SEO・AXO/LLMO（AI検索最適化）・CVR改善・データ分析を軸に、戦略から実装まで一貫して支援します。",
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
      <section className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 md:pt-24 pb-16 md:pb-24">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-12 items-center">
            <div className="md:col-span-7">
              <p className="text-xs tracking-[0.35em] uppercase text-bronze mb-6">
                SEO / AXO / LLMO Consulting
              </p>
              <h1 className="font-serif text-4xl md:text-6xl font-semibold leading-[1.25] tracking-tight mb-8">
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
            <div className="md:col-span-5">
              <div className="relative max-w-xs sm:max-w-sm mx-auto md:ml-auto">
                <div className="absolute -bottom-4 -right-4 w-full h-full border border-bronze/50" aria-hidden />
                <Image
                  src="/images/ceo-upper.jpg"
                  alt="株式会社ミチビキ 代表取締役 大沢翔己"
                  width={900}
                  height={1125}
                  priority
                  className="relative w-full h-auto object-cover"
                />
                <p className="mt-4 text-xs text-ink-faint tracking-wider">
                  代表取締役　大沢 翔己
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Domain strip */}
      <div className="border-y border-line bg-white/40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-wrap gap-x-8 gap-y-2 justify-center text-xs tracking-[0.25em] uppercase text-ink-faint">
          <span>SEO</span>
          <span className="text-line">/</span>
          <span>AXO</span>
          <span className="text-line">/</span>
          <span>LLMO</span>
          <span className="text-line">/</span>
          <span>CVR Optimization</span>
          <span className="text-line">/</span>
          <span>Data Analytics</span>
        </div>
      </div>

      {/* Services */}
      <section className="py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="md:flex md:items-end md:justify-between mb-14">
            <div>
              <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">Services</p>
              <h2 className="font-serif text-3xl md:text-4xl font-semibold">事業内容</h2>
            </div>
            <p className="mt-4 md:mt-0 text-sm text-ink-soft max-w-md leading-relaxed">
              「見つけられる」から「成果になる」まで。集客の全工程を、4つの領域で支援します。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-line border border-line">
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

          <p className="mt-6 text-xs text-ink-faint leading-relaxed">
            自社事業として、犬のトリミングサロンを比較できるDB型ポータルサイトを準備中です。
          </p>
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
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-14 items-center">
            <div className="md:col-span-4">
              <div className="max-w-[260px] mx-auto md:mx-0">
                <Image
                  src="/images/ceo-upper.jpg"
                  alt="代表取締役 大沢翔己"
                  width={520}
                  height={650}
                  className="w-full h-auto object-cover"
                />
              </div>
            </div>
            <div className="md:col-span-8">
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
