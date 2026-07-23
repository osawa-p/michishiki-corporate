"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

// SEO観測ツール共通のサイト切替。?site= を書き換えてサーバー再取得させる。
function Picker({ sites, selected }: { sites: string[]; selected: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function onChange(site: string) {
    // 選択をCookieにも記憶する。タブ移動などで ?site= が付かずに開いたページは
    // このCookieを既定値に使うため、ページをまたいでも選択サイトが維持される
    document.cookie = `seo-site=${encodeURIComponent(site)}; path=/rank-tracker; max-age=31536000; samesite=lax`;
    const next = new URLSearchParams(params.toString());
    next.set("site", site);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <label className="inline-flex items-center gap-2 text-xs text-ink-soft">
      サイト
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        className="border border-line bg-white px-2 py-1.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-bronze-deep"
      >
        {sites.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function SeoSitePicker(props: { sites: string[]; selected: string }) {
  return (
    <Suspense fallback={null}>
      <Picker {...props} />
    </Suspense>
  );
}
