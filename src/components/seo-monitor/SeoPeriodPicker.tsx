"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

export const SEO_PERIODS = [7, 30, 90] as const;

// SEO観測ツール共通の期間切替。?days= を書き換えてサーバー再取得させる。
function Picker({ selected }: { selected: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function onSelect(days: number) {
    const next = new URLSearchParams(params.toString());
    next.set("days", String(days));
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="inline-flex items-center gap-1 text-xs" role="group" aria-label="集計期間">
      <span className="text-ink-soft mr-1">期間</span>
      {SEO_PERIODS.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onSelect(d)}
          aria-pressed={selected === d}
          className={`px-3 py-1.5 border transition-colors ${
            selected === d
              ? "border-bronze bg-white text-bronze-deep font-semibold"
              : "border-line bg-paper text-ink-soft hover:text-bronze-deep"
          }`}
        >
          {d}日
        </button>
      ))}
    </div>
  );
}

export default function SeoPeriodPicker(props: { selected: number }) {
  return (
    <Suspense fallback={null}>
      <Picker {...props} />
    </Suspense>
  );
}
