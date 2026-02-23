import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-400">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Company */}
          <div>
            <p className="text-white font-bold text-lg mb-3">株式会社ミチビキ</p>
            <p className="text-sm leading-relaxed">
              人とペットの豊かな未来を<br />
              共に歩む会社です。
            </p>
          </div>

          {/* Links */}
          <div>
            <p className="text-white font-semibold mb-3">メニュー</p>
            <ul className="space-y-2 text-sm">
              <li><Link href="/about" className="hover:text-white transition-colors">会社概要</Link></li>
              <li><Link href="/service" className="hover:text-white transition-colors">サービス</Link></li>
              <li><Link href="/news" className="hover:text-white transition-colors">お知らせ</Link></li>
              <li><Link href="/recruit" className="hover:text-white transition-colors">採用情報</Link></li>
              <li><Link href="/contact" className="hover:text-white transition-colors">お問い合わせ</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <p className="text-white font-semibold mb-3">お問い合わせ</p>
            <p className="text-sm leading-relaxed">
              ご質問・ご相談はお気軽に<br />
              お問い合わせフォームよりご連絡ください。
            </p>
            <Link
              href="/contact"
              className="inline-block mt-4 px-5 py-2 border border-gray-500 text-sm rounded-full hover:border-white hover:text-white transition-colors"
            >
              お問い合わせフォーム
            </Link>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-gray-800 text-center text-xs">
          <p>&copy; {new Date().getFullYear()} 株式会社ミチビキ. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
