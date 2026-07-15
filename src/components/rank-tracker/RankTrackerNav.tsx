"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

// 社内ツール共通のタブナビ。rank-tracker 配下の各ページで共有する（layout に配置）。
// 権限でタブを出し分ける: 閲覧のみ=ダッシュボードだけ / 管理者=全タブ+メンバー管理。
const TABS: { href: string; label: string; adminOnly?: boolean }[] = [
  { href: "/rank-tracker/dashboard", label: "ダッシュボード" },
  { href: "/rank-tracker/keywords", label: "キーワード管理", adminOnly: true },
  { href: "/rank-tracker/measure", label: "クイック計測", adminOnly: true },
  { href: "/rank-tracker/members", label: "メンバー", adminOnly: true },
];

export default function RankTrackerNav({
  role,
  email,
}: {
  role: "admin" | "viewer" | null;
  email: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    try {
      await fetch("/api/rank-tracker/auth/logout", { method: "POST" });
    } finally {
      router.push("/rank-tracker/login");
      router.refresh();
    }
  }

  const tabs = role ? TABS.filter((t) => role === "admin" || !t.adminOnly) : [];

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
          {tabs.map((t) => {
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
          {role && (
            <span className="ml-auto flex items-baseline gap-3 pl-4 py-3 whitespace-nowrap">
              {email && email !== "(basic-auth)" && (
                <span className="hidden md:inline text-[11px] text-ink-faint">{email}</span>
              )}
              <button
                type="button"
                onClick={logout}
                className="text-xs text-ink-faint hover:text-bronze-deep transition-colors"
              >
                ログアウト
              </button>
            </span>
          )}
        </nav>
      </div>
    </div>
  );
}
