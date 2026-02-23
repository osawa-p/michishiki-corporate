import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "会社概要",
  description: "株式会社ミチビキの会社概要・ミッション・ビジョン",
};

export default function AboutPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      {/* Page Title */}
      <div className="mb-14 text-center">
        <p className="text-blue-600 text-sm font-semibold tracking-widest mb-2">ABOUT US</p>
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900">会社概要</h1>
      </div>

      {/* Mission / Vision */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
        <div className="bg-blue-600 text-white rounded-2xl p-8">
          <p className="text-blue-200 text-sm font-semibold tracking-widest mb-3">MISSION</p>
          <h2 className="text-xl font-bold mb-4">人とペットが共に輝く社会をつくる</h2>
          <p className="text-blue-100 text-sm leading-relaxed">
            テクノロジーの力でペットと人の関係をより豊かにし、
            安心して共に暮らせる社会基盤の構築に貢献します。
          </p>
        </div>
        <div className="bg-gray-900 text-white rounded-2xl p-8">
          <p className="text-gray-400 text-sm font-semibold tracking-widest mb-3">VISION</p>
          <h2 className="text-xl font-bold mb-4">ペット産業のデジタルインフラへ</h2>
          <p className="text-gray-300 text-sm leading-relaxed">
            ペット関連のすべての情報・サービスが集まるプラットフォームとして、
            業界の標準インフラになることを目指します。
          </p>
        </div>
      </div>

      {/* Company Info Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-16">
        <div className="px-8 py-6 bg-gray-50 border-b">
          <h2 className="text-xl font-bold text-gray-900">会社情報</h2>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {[
              ["会社名", "株式会社ミチビキ"],
              ["英語表記", "MICHISHIKI CO., LTD."],
              ["設立", "2024年"],
              ["代表者", "代表取締役 （お名前）"],
              ["所在地", "〒xxx-xxxx 東京都（住所）"],
              ["事業内容", "Webシステム開発、ペット向けプラットフォーム運営、DXコンサルティング"],
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
