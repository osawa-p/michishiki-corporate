import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "株式会社ミチビキ | トップ",
};

export default function HomePage() {
  return (
    <>
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-600 to-blue-800 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-36">
          <p className="text-blue-200 text-sm font-medium tracking-widest mb-4">MICHISHIKI CO., LTD.</p>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-6">
            人とペットの<br />豊かな未来を、ともに。
          </h1>
          <p className="text-blue-100 text-lg md:text-xl leading-relaxed mb-10 max-w-xl">
            株式会社ミチビキは、人とペットが安心して暮らせる社会の実現に向けて、
            テクノロジーとサービスで新しい価値を提供します。
          </p>
          <div className="flex flex-wrap gap-4">
            <Link
              href="/service"
              className="px-8 py-3 bg-white text-blue-700 font-semibold rounded-full hover:bg-blue-50 transition-colors"
            >
              サービスを見る
            </Link>
            <Link
              href="/contact"
              className="px-8 py-3 border border-white text-white font-semibold rounded-full hover:bg-white hover:text-blue-700 transition-colors"
            >
              お問い合わせ
            </Link>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: "🏢",
                title: "企業向けソリューション",
                desc: "ペット関連企業のDX推進を支援するシステム開発・コンサルティングサービスを提供します。",
              },
              {
                icon: "🐕",
                title: "ペットサービスプラットフォーム",
                desc: "トリミングサロン・動物病院・ペットショップの情報を集約したDBプラットフォームを運営します。",
              },
              {
                icon: "💡",
                title: "Webシステム開発",
                desc: "予約管理・顧客管理・会員サイトなど、ビジネスに必要なWebシステムをオーダーメイドで開発します。",
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
          <div className="bg-blue-600 rounded-3xl p-10 md:p-16 text-white text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">ミチビキについて</h2>
            <p className="text-blue-100 mb-8 text-base md:text-lg max-w-xl mx-auto leading-relaxed">
              私たちのミッション・ビジョン・会社概要をご覧ください。
            </p>
            <Link
              href="/about"
              className="inline-block px-8 py-3 bg-white text-blue-700 font-semibold rounded-full hover:bg-blue-50 transition-colors"
            >
              会社概要へ
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
