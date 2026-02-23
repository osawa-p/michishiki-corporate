import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "お問い合わせ",
  description: "株式会社ミチビキへのお問い合わせフォーム",
};

export default function ContactPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="mb-12 text-center">
        <p className="text-blue-600 text-sm font-semibold tracking-widest mb-2">CONTACT</p>
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">お問い合わせ</h1>
        <p className="text-gray-600 text-sm">
          ご質問・ご相談・お見積りのご依頼はこちらからお気軽にどうぞ。<br />
          通常2営業日以内にご返信いたします。
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-8 md:p-10">
        {/* NOTE: フォーム送信機能は後続タスクで実装（Resend / SendGrid等） */}
        <form className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="name">
              お名前 <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              type="text"
              required
              placeholder="山田 太郎"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="company">
              会社名
            </label>
            <input
              id="company"
              type="text"
              placeholder="株式会社〇〇"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="email">
              メールアドレス <span className="text-red-500">*</span>
            </label>
            <input
              id="email"
              type="email"
              required
              placeholder="example@mail.com"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="subject">
              お問い合わせ種別 <span className="text-red-500">*</span>
            </label>
            <select
              id="subject"
              required
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white"
            >
              <option value="">選択してください</option>
              <option>サービスに関するご質問</option>
              <option>お見積りのご依頼</option>
              <option>採用に関するお問い合わせ</option>
              <option>その他</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="message">
              お問い合わせ内容 <span className="text-red-500">*</span>
            </label>
            <textarea
              id="message"
              required
              rows={6}
              placeholder="お問い合わせ内容をご記入ください"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-blue-600 text-white font-semibold rounded-full hover:bg-blue-700 transition-colors"
          >
            送信する
          </button>
        </form>
      </div>
    </div>
  );
}
