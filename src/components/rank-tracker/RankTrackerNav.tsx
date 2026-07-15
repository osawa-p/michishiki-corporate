"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 社内ツール共通のタブナビ。rank-tracker 配下の各ページで共有する（layout に配置）。
const TABS = [
  { href: "/rank-tracker", label: "その場計測", exact: true },
  { href: "/rank-tracker/keywords", label: "キーワード管理" },
  { href: "/rank-tracker/dashboard", label: "ダッシュボード" },
];

export default function RankTrackerNav() {
  const pathname = usePathname();
  return (
    <div className="border-b border-line bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {TABS.map((t) => {
            const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`whitespace-nowrap px-4 py-3 text-sm border-b-2 transition-colors ${
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
