import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "会社概要",
  description: "株式会社ミチビキの会社概要・代表メッセージ・ミッション",
};

export default function AboutPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="mb-14 text-center">
        <p className="text-blue-600 text-sm font-semibold tracking-widest mb-2">ABOUT US</p>
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900">会社概要</h1>
      </div>

      {/* Mission / Vision */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
        <div className="bg-slate-900 text-white rounded-2xl p-8">
          <p className="text-blue-400 text-xs font-semibold tracking-widest mb-3">MISSION</p>
          <h2 className="text-xl font-bold mb-4">検索とAIの進化とともに、<br />ビジネスの正しい道を拓く</h2>
          <p className="text-slate-300 text-sm leading-relaxed">
            SEO・LLMOを軸に、企業が「検索されるだけでなくAIにも選ばれる」
            存在になれるよう、戦略から実装まで伴走します。
          </p>
        </div>
        <div className="bg-blue-600 text-white rounded-2xl p-8">
          <p className="text-blue-200 text-xs font-semibold tracking-widest mb-3">VISION</p>
          <h2 className="text-xl font-bold mb-4">ウェブ集客の新常識をつくる</h2>
          <p className="text-blue-100 text-sm leading-relaxed">
            DB型SEOやLLMO対応を日本のスタンダードにし、
            規模を問わずすべての企業が正しく集客できる世界を目指します。
          </p>
        </div>
      </div>

      {/* CEO Message */}
      <div className="bg-white rounded-2xl shadow-sm p-8 md:p-12 mb-16">
        <h2 className="text-xl font-bold text-gray-900 mb-8">代表メッセージ</h2>
        <div className="flex flex-col md:flex-row gap-8 items-start">
          <div className="flex-shrink-0 text-center">
            <div className="w-40 h-40 md:w-48 md:h-48 rounded-2xl overflow-hidden mx-auto bg-gray-100">
              <Image
                src="/images/ceo.jpg"
                alt="代表取締役 大沢 翔己"
                width={192}
                height={192}
                className="w-full h-full object-cover"
              />
            </div>
            <p className="mt-3 font-bold text-gray-900 text-sm">代表取締役</p>
            <p className="text-gray-700 font-bold">大沢 翔己</p>
          </div>
          <div className="flex-1">
            <p className="text-gray-700 text-sm leading-relaxed mb-4">
              SEOやLLMO（Large Language Model Optimization）という言葉はまだ新しいですが、
              「検索エンジンだけでなく、AIにも正しく認識される」ことの重要性は急速に高まっています。
            </p>
            <p className="text-gray-700 text-sm leading-relaxed mb-4">
              株式会社ミチビキは、この変化の最前線で企業の集客・ブランディングを支援することを使命としています。
              特にDB型SEOの設計・実装とコンテンツディレクションに強みを持ち、
              大規模なサイト構造の構築から個別のコンテンツ戦略まで幅広く対応します。
            </p>
            <p className="text-gray-700 text-sm leading-relaxed">
              Webの世界で「道に迷わない」ための羅針盤として、お客様とともに歩んでいきます。
            </p>
          </div>
        </div>
      </div>

      {/* Company Info */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-8 py-6 bg-gray-50 border-b">
          <h2 className="text-xl font-bold text-gray-900">会社情報</h2>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {[
              ["会社名", "株式会社ミチビキ"],
              ["英語表記", "michibiki inc."],
              ["設立", "2025年6月"],
              ["代表者", "代表取締役 大沢 翔己"],
              ["所在地", "神奈川県横浜市港北区大曽根台32-2-2"],
              ["事業内容", "WEBマーケティング支援事業・犬のトリミングポータルサイト運営（予定）"],
            ].map(([label, value]) => (
              <tr key={label} className="border-b last:border-0">
                <th className="text-left px-8 py-4 bg-gray-50 font-semibold text-gray-700 w-32 md:w-48 whitespace-nowrap">
                  {label}
                </th>
                <td className="px-8 py-4 text-gray-800">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
