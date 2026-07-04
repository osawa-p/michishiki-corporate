import type { Metadata } from "next";
import Link from "next/link";
import { services, serviceFlow } from "@/lib/services";
import CtaSection from "@/components/CtaSection";

export const metadata: Metadata = {
  title: "サービス",
  description:
    "SEOコンサルティング、AXO・LLMO支援（AI検索最適化）、CVR改善、データ分析・マーケティングDX。株式会社ミチビキのサービス一覧。",
};

export default function ServicePage() {
  return (
    <>
      {/* Page Header */}
      <section className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">Services</p>
          <h1 className="font-serif text-4xl md:text-5xl font-semibold mb-6">サービス</h1>
          <p className="text-ink-soft text-sm md:text-base leading-relaxed max-w-2xl">
            「見つけられる」から「成果になる」まで。
            検索エンジンとAIの両方を見据えた集客戦略を、4つの領域で戦略から実装まで支援します。
          </p>
        </div>
      </section>

      {/* Service List */}
      <section className="py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-px">
          {services.map((service) => (
            <Link
              key={service.slug}
              href={`/service/${service.slug}`}
              className="group grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-10 py-10 md:py-12 border-b border-line first:border-t hover:bg-white/60 transition-colors md:px-4"
            >
              <div className="md:col-span-2 flex md:block items-baseline gap-4">
                <span className="font-serif text-4xl text-bronze">{service.num}</span>
                <p className="text-[10px] tracking-[0.25em] uppercase text-ink-faint md:mt-3">
                  {service.en}
                </p>
              </div>
              <div className="md:col-span-7">
                <h2 className="font-serif text-2xl font-semibold mb-3 group-hover:text-bronze-deep transition-colors">
                  {service.title}
                </h2>
                <p className="text-sm text-ink-soft leading-relaxed mb-4">{service.short}</p>
                <div className="flex flex-wrap gap-2">
                  {service.keywords.map((kw) => (
                    <span
                      key={kw}
                      className="text-xs text-ink-faint border border-line px-2.5 py-1"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
              <div className="md:col-span-3 flex md:items-center md:justify-end">
                <span className="text-sm font-semibold text-bronze-deep">詳しく見る →</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Flow */}
      <section className="bg-night text-paper py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">Flow</p>
          <h2 className="font-serif text-3xl md:text-4xl font-semibold mb-14">支援の進め方</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-8 md:gap-6">
            {serviceFlow.map((f) => (
              <div key={f.step} className="border-t border-stone-700 pt-5">
                <span className="font-serif text-xl text-bronze">{f.step}</span>
                <h3 className="font-semibold mt-3 mb-2">{f.title}</h3>
                <p className="text-xs text-stone-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Own service */}
      <section className="py-16 md:py-20 border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">Own Service</p>
          <h2 className="font-serif text-2xl font-semibold mb-4">自社事業</h2>
          <p className="text-sm text-ink-soft leading-relaxed max-w-2xl">
            犬のトリミングサロン情報を集約し、エリア・犬種・料金で比較検索できるDB型ポータルサイトを準備中です。
            支援で培ったDB型SEOの知見を、自らの事業でも実践しています。
          </p>
        </div>
      </section>

      <CtaSection />
    </>
  );
}
