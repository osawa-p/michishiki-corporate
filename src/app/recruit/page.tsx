import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "採用情報",
  description: "株式会社ミチビキの採用情報",
};

export default function RecruitPage() {
  return (
    <>
      {/* Page Header */}
      <section className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">Recruit</p>
          <h1 className="font-serif text-4xl md:text-5xl font-semibold">採用情報</h1>
        </div>
      </section>

      <section className="py-20 md:py-28">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="font-serif text-xl md:text-2xl font-semibold mb-6">
            現在、募集中のポジションはありません
          </p>
          <p className="text-sm text-ink-soft leading-loose mb-10 max-w-lg mx-auto">
            現時点では採用募集を行っておりませんが、SEO・AXO/LLMOやWebマーケティングの領域に
            ご興味をお持ちの方とのつながりは歓迎しています。
            将来的な募集はこのページとお知らせでご案内します。
          </p>
          <Link
            href="/contact"
            className="inline-block px-8 py-3.5 border border-ink/30 text-ink text-sm font-semibold hover:border-bronze-deep hover:text-bronze-deep transition-colors"
          >
            お問い合わせはこちら
          </Link>
        </div>
      </section>
    </>
  );
}
