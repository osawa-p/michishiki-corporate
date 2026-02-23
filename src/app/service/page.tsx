import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "サービス",
  description: "株式会社ミチビキが提供するサービス一覧",
};

const services = [
  {
    icon: "🏢",
    title: "企業向けソリューション",
    subtitle: "DX推進・システム開発",
    description:
      "ペット関連企業のDX推進を支援します。業務効率化のためのシステム構築から、デジタル戦略の立案・実行支援まで幅広く対応します。",
    features: ["業務フロー分析・改善提案", "カスタムシステム開発", "クラウド移行支援", "保守・運用サポート"],
  },
  {
    icon: "🐕",
    title: "ペットサービスプラットフォーム",
    subtitle: "サービス情報DB・マッチング",
    description:
      "犬のトリミングサロンを中心に、ペット関連サービスの情報を集約したDBサイトを運営します。オーナーとサービス事業者をつなぐマッチングプラットフォームです。",
    features: ["サロン情報検索・比較", "ユーザーレビュー機能", "サービス事業者向け掲載管理", "エリア・犬種での絞り込み"],
  },
  {
    icon: "💡",
    title: "Webシステム開発",
    subtitle: "フルスクラッチ・受託開発",
    description:
      "予約管理システム・顧客管理システム・会員サイトなど、ビジネス課題に合わせたWebシステムをオーダーメイドで開発します。",
    features: ["要件定義・設計", "フロントエンド/バックエンド開発", "API連携・外部サービス統合", "テスト・デプロイ・保守"],
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
          お問い合わせ
        </Link>
      </div>
    </div>
  );
}
