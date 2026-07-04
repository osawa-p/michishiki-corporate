import Link from "next/link";
import { services } from "@/lib/services";

export default function Footer() {
  return (
    <footer className="bg-night text-stone-400">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
          {/* Brand */}
          <div className="md:col-span-5">
            <p className="font-serif text-xl font-semibold text-paper mb-1">株式会社ミチビキ</p>
            <p className="text-[10px] tracking-[0.35em] uppercase text-stone-500 mb-5">
              Michibiki Inc.
            </p>
            <p className="text-sm leading-relaxed max-w-xs">
              検索エンジンにも、AIにも、正しく見つけられるために。
              SEO・AXO/LLMOを軸としたWebマーケティング支援を行っています。
            </p>
          </div>

          {/* Services */}
          <div className="md:col-span-4">
            <p className="text-xs tracking-[0.25em] uppercase text-stone-500 mb-4">Services</p>
            <ul className="space-y-2.5 text-sm">
              {services.map((s) => (
                <li key={s.slug}>
                  <Link href={`/service/${s.slug}`} className="hover:text-paper transition-colors">
                    {s.title}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/service" className="hover:text-paper transition-colors">
                  サービス一覧
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div className="md:col-span-3">
            <p className="text-xs tracking-[0.25em] uppercase text-stone-500 mb-4">Company</p>
            <ul className="space-y-2.5 text-sm">
              <li><Link href="/about" className="hover:text-paper transition-colors">会社概要</Link></li>
              <li><Link href="/news" className="hover:text-paper transition-colors">お知らせ</Link></li>
              <li><Link href="/blog" className="hover:text-paper transition-colors">ブログ</Link></li>
              <li><Link href="/recruit" className="hover:text-paper transition-colors">採用情報</Link></li>
              <li><Link href="/contact" className="hover:text-paper transition-colors">お問い合わせ</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-14 pt-6 border-t border-stone-800 flex flex-col sm:flex-row justify-between gap-2 text-xs text-stone-500">
          <p>&copy; {new Date().getFullYear()} Michibiki Inc. All rights reserved.</p>
          <p className="tracking-wider">SEO / AXO / LLMO / CVR / DATA</p>
        </div>
      </div>
    </footer>
  );
}
