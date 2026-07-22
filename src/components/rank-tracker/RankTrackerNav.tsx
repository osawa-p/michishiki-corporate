"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

// 社内ツール共通のタブナビ。rank-tracker 配下の各ページで共有する（layout に配置）。
// 権限でタブを出し分ける。
const TABS: { href: string; label: string; roles: string[] }[] = [
  { href: "/rank-tracker/dashboard", label: "ダッシュボード", roles: ["admin", "editor", "viewer_kw", "viewer"] },
  { href: "/rank-tracker/keywords", label: "キーワード管理", roles: ["admin", "editor", "viewer_kw"] },
  { href: "/rank-tracker/measure", label: "クイック計測", roles: ["admin"] },
  // SEO観測ツール（GSC/GA4 は許可サイトのみ全ロールに公開。AI提案・SEO設定は管理者専用）
  { href: "/rank-tracker/seo/gsc", label: "サーチコンソール", roles: ["admin", "editor", "viewer_kw", "viewer"] },
  { href: "/rank-tracker/seo/ga4", label: "GA4", roles: ["admin", "editor", "viewer_kw", "viewer"] },
  { href: "/rank-tracker/seo/proposals", label: "AI提案", roles: ["admin"] },
  { href: "/rank-tracker/members", label: "メンバー", roles: ["admin"] },
  { href: "/rank-tracker/settings", label: "サイト設定", roles: ["admin"] },
  { href: "/rank-tracker/seo/settings", label: "SEO設定", roles: ["admin"] },
];

export default function RankTrackerNav({
  role,
  email,
}: {
  role: string | null;
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

  const tabs = role ? TABS.filter((t) => t.roles.includes(role)) : [];

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
