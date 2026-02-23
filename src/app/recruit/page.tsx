import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "採用情報",
  description: "株式会社ミチビキの採用情報",
};

const positions = [
  {
    title: "Webエンジニア（フルスタック）",
    type: "正社員",
    description: "Next.js / TypeScript / Supabase を使ったWebアプリケーションの設計・開発をお任せします。",
    requirements: ["TypeScript / React の実務経験2年以上", "REST API / データベース設計の経験", "Git を使ったチーム開発経験"],
  },
  {
    title: "Webデザイナー / UIデザイナー",
    type: "正社員・業務委託",
    description: "企業サイト・サービスサイトのUI設計からコーディングまで担当していただきます。",
    requirements: ["Figma を使ったUIデザインの経験", "HTML / CSS / Tailwind CSS の知識", "ユーザー体験への強い関心"],
  },
];

export default function RecruitPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="mb-14 text-center">
        <p className="text-blue-600 text-sm font-semibold tracking-widest mb-2">RECRUIT</p>
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900">採用情報</h1>
      </div>

      {/* Recruitment Message */}
      <div className="bg-blue-600 text-white rounded-2xl p-10 text-center mb-14">
        <h2 className="text-xl md:text-2xl font-bold mb-4">一緒に、新しい道をつくりませんか?</h2>
        <p className="text-blue-100 max-w-xl mx-auto text-sm leading-relaxed">
          ミチビキでは、ペットと人の未来に向けてテクノロジーで価値を提供したいという仲間を募集しています。
          小さなチームだからこそ、一人ひとりの力が会社の方向を決めます。
        </p>
      </div>

      {/* Job Listings */}
      <div className="space-y-8 mb-14">
        {positions.map((pos) => (
          <div key={pos.title} className="bg-white rounded-2xl shadow-sm p-8">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-1">{pos.title}</h2>
                <span className="inline-block px-3 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full">
                  {pos.type}
                </span>
              </div>
            </div>
            <p className="text-gray-600 text-sm leading-relaxed mb-5">{pos.description}</p>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">求める経験・スキル</p>
              <ul className="space-y-1">
                {pos.requirements.map((req) => (
                  <li key={req} className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="text-blue-500 font-bold">✓</span>
                    {req}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-6">
              <Link
                href="/contact"
                className="inline-block px-6 py-2 bg-blue-600 text-white text-sm font-semibold rounded-full hover:bg-blue-700 transition-colors"
              >
                この求人に応募する
              </Link>
            </div>
          </div>
        ))}
      </div>

      <p className="text-center text-sm text-gray-500">
        掲載以外のポジションでもご相談を歓迎しています。
        <Link href="/contact" className="text-blue-600 hover:underline ml-1">お気軽にご連絡ください。</Link>
      </p>
    </div>
  );
}
