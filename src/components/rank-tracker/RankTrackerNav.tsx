"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 社内ツール共通のタブナビ。rank-tracker 配下の各ページで共有する（layout に配置）。
// 利用頻度（確認 > 設定 > 単発計測）の順に並べる。
const TABS = [
  { href: "/rank-tracker/dashboard", label: "ダッシュボード" },
  { href: "/rank-tracker/keywords", label: "キーワード管理" },
  { href: "/rank-tracker/measure", label: "クイック計測" },
];

export default function RankTrackerNav() {
  const pathname = usePathname();
  return (
    <div className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex items-baseline gap-1 -mb-px overflow-x-auto">
          <span className="hidden sm:inline-block pr-4 py-3 font-serif text-sm font-semibold">
            順位計測
            <span className="ml-2 font-sans text-[10px] font-normal tracking-[0.25em] uppercase text-bronze">
              internal
            </span>
          </span>
          {TABS.map((t) => {
            const active = pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap px-4 py-3 text-sm border-b-2 transition-colors focus-visible:outline-2 focus-visible:outline-bronze-deep ${
                  active
                    ? "border-bronze text-bronze-deep font-semibold"
                    : "border-transparent text-ink-soft hover:text-bronze-deep"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
