import type { Metadata } from "next";
import Image from "next/image";
import CtaSection from "@/components/CtaSection";

export const metadata: Metadata = {
  title: "会社概要",
  description:
    "株式会社ミチビキの会社概要・代表メッセージ・ミッション。SEO・AXO/LLMOを軸としたWebマーケティング支援会社です。",
};

const companyInfo = [
  ["会社名", "株式会社ミチビキ"],
  ["英語表記", "michibiki inc."],
  ["設立", "2025年6月"],
  ["代表者", "代表取締役 大沢 翔己"],
  ["所在地", "神奈川県横浜市港北区大曽根台32-2-2"],
  [
    "事業内容",
    "Webマーケティング支援事業（SEO・AXO/LLMO・CVR改善・データ分析）、犬のトリミングサロン検索サイト「うちの犬スタイル」の運営",
  ],
];

export default function AboutPage() {
  return (
    <>
      {/* Page Header */}
      <section className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">About Us</p>
          <h1 className="font-serif text-4xl md:text-5xl font-semibold">会社概要</h1>
        </div>
      </section>

      {/* Mission / Vision */}
      <section className="py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16">
            <div className="border-t-2 border-ink pt-8">
              <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-5">Mission</p>
              <h2 className="font-serif text-2xl md:text-3xl font-semibold leading-snug mb-5">
                検索とAIの進化とともに、
                <br />
                ビジネスの正しい道を拓く
              </h2>
              <p className="text-sm text-ink-soft leading-relaxed">
                SEO・AXO/LLMOを軸に、企業が「検索されるだけでなくAIにも選ばれる」存在になれるよう、
                戦略から実装まで伴走します。
              </p>
            </div>
            <div className="border-t-2 border-bronze pt-8">
              <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-5">Vision</p>
              <h2 className="font-serif text-2xl md:text-3xl font-semibold leading-snug mb-5">
                ウェブ集客の新常識をつくる
              </h2>
              <p className="text-sm text-ink-soft leading-relaxed">
                DB型SEOやAI検索への最適化を日本のスタンダードにし、
                規模を問わずすべての企業が正しく集客できる世界を目指します。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CEO Message */}
      <section className="bg-white/60 border-y border-line py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">Message</p>
          <h2 className="font-serif text-2xl md:text-3xl font-semibold mb-12">代表メッセージ</h2>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-14">
            <div className="md:col-span-4">
              <div className="relative max-w-[300px] mx-auto md:mx-0">
                <div className="absolute -bottom-3 -right-3 w-full h-full border border-bronze/50" aria-hidden />
                <Image
                  src="/images/ceo-upper.jpg"
                  alt="代表取締役 大沢 翔己"
                  width={600}
                  height={750}
                  className="relative w-full h-auto object-cover"
                />
              </div>
              <div className="mt-6 text-center md:text-left">
                <p className="text-xs text-ink-faint tracking-wider mb-1">代表取締役</p>
                <p className="font-serif text-lg font-semibold">大沢 翔己</p>
              </div>
            </div>
            <div className="md:col-span-8">
              <h3 className="font-serif text-xl md:text-2xl font-semibold leading-relaxed mb-8">
                「検索される」だけでは、
                <br />
                もう十分ではなくなりました。
              </h3>
              <div className="space-y-5 text-sm md:text-[15px] text-ink-soft leading-loose max-w-2xl">
                <p>
                  人が情報と出会う場所は、検索結果の一覧から、ChatGPTやGeminiが返す「答え」へと広がりつつあります。
                  検索エンジンに評価されることに加えて、AIに正しく認識され、回答の出典として引用されること。
                  その両方を押さえて初めて、これからのWeb集客は成立します。
                </p>
                <p>
                  私はこれまで、事業会社のメディアグロース責任者やSEOコンサルタントとして、
                  AI・人材・ECなど複数の業界で集客支援に携わってきました。
                  キーワード戦略からテクニカルSEO、CVR改善、データ基盤の構築まで、
                  戦略と実装の両輪を実務で回し続けてきた経験が、ミチビキの支援の土台です。
                </p>
                <p>
                  社名の「ミチビキ」には、変化の激しいWebの世界で、
                  お客様が道に迷わないための羅針盤でありたいという想いを込めています。
                  データと実装力で、貴社のビジネスの正しい道を照らします。
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Company Info */}
      <section className="py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">Company</p>
          <h2 className="font-serif text-2xl md:text-3xl font-semibold mb-12">会社情報</h2>
          <dl className="border-t border-line max-w-3xl">
            {companyInfo.map(([label, value]) => (
              <div
                key={label}
                className="grid grid-cols-1 sm:grid-cols-4 gap-1 sm:gap-6 py-5 border-b border-line"
              >
                <dt className="text-sm font-semibold text-ink-faint">{label}</dt>
                <dd className="sm:col-span-3 text-sm leading-relaxed">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <CtaSection />
    </>
  );
}
