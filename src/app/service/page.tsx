import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "サービス",
  description: "SEO・LLMO支援、DB型SEO設計・実装、コンテンツディレクション。株式会社ミチビキのサービス一覧。",
};

const services = [
  {
    icon: "🔍",
    title: "SEO・LLMO支援",
    subtitle: "SEO / LLMO / AXO / DB型SEO",
    description:
      "Googleなどの検索エンジン最適化（SEO）に加え、ChatGPT・Gemini・Claudeなど AIアシスタントが回答に引用するコンテンツへの最適化（LLMO）を一気通貫で支援します。DB型SEOの設計・実装とコンテンツディレクションを特に得意としています。",
    features: [
      "DB型SEO設計・実装（大量ページ自動生成・構造化データ対応）",
      "LLMO（AIへの引用最適化）コンテンツ戦略",
      "SEOディレクション・内製化支援",
      "AXO（Answer Engine Optimization）対応",
      "DX化・業務効率化の提案",
    ],
  },
  {
    icon: "🐕",
    title: "犬のトリミングポータルサイト運営",
    subtitle: "ペットサービスDB（運営準備中）",
    description:
      "犬のトリミングサロン情報を集約したDBポータルサイトを運営予定。エリア・犬種・料金・サービス内容で比較検索できるプラットフォームを構築し、ペットオーナーとサロンをつなぎます。",
    features: [
      "エリア・犬種での絞り込み検索",
      "サービス・料金の比較",
      "ユーザーレビュー・評価機能",
      "サロンオーナー向け掲載管理",
    ],
  },
];

export default function ServicePage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="mb-14 text-center">
        <p className="text-blue-600 text-sm font-semibold tracking-widest mb-2">SERVICES</p>
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900">サービス一覧</h1>
      </div>

      <div className="space-y-10">
        {services.map((service) => (
          <div key={service.title} className="bg-white rounded-2xl shadow-sm p-8 md:p-10 flex flex-col md:flex-row gap-8">
            <div className="text-6xl md:pt-1">{service.icon}</div>
            <div className="flex-1">
              <p className="text-blue-600 text-xs font-semibold tracking-widest mb-1">{service.subtitle}</p>
              <h2 className="text-xl font-bold text-gray-900 mb-3">{service.title}</h2>
              <p className="text-gray-600 text-sm leading-relaxed mb-5">{service.description}</p>
              <ul className="space-y-2">
                {service.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-gray-700">
                    <span className="text-blue-500 font-bold">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-14 text-center">
        <p className="text-gray-600 mb-6">サービスに関するご質問・お見積りはお気軽にご相談ください。</p>
        <Link
          href="/contact"
          className="inline-block px-10 py-3 bg-blue-600 text-white font-semibold rounded-full hover:bg-blue-700 transition-colors"
        >
          無料相談する
        </Link>
      </div>
    </div>
  );
}
