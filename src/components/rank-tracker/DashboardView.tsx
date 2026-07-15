"use client";

import { useState } from "react";

type LatestRank = {
  keyword: string;
  checked_at: string;
  total: number;
  rank: number | null;
  url: string | null;
};

type TrendPoint = {
  checked_at: string;
  total: number;
  rank: number | null;
};

export default function DashboardView({
  domain,
  latest,
  loadError,
}: {
  domain: string;
  latest: LatestRank[];
  loadError: boolean;
}) {
  const [openKw, setOpenKw] = useState<string | null>(null);
  const [trend, setTrend] = useState<Record<string, TrendPoint[]>>({});
  const [loadingKw, setLoadingKw] = useState<string | null>(null);
  const [errorKw, setErrorKw] = useState<string | null>(null);

  async function openTrend(keyword: string) {
    if (openKw === keyword) {
      setOpenKw(null);
      return;
    }
    setOpenKw(keyword);
    setErrorKw(null);
    if (trend[keyword]) return;

    setLoadingKw(keyword);
    try {
      const res = await fetch(
        `/api/rank-tracker/history?domain=${encodeURIComponent(domain)}&keyword=${encodeURIComponent(keyword)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error();
      setTrend((t) => ({ ...t, [keyword]: data.trend as TrendPoint[] }));
    } catch {
      setErrorKw(keyword);
    } finally {
      // 別キーワードを連続で開いたとき、古いリクエストの完了が新しい方の
      // ローディング表示を消さないようにする
      setLoadingKw((cur) => (cur === keyword ? null : cur));
    }
  }

  if (loadError) {
    return (
      <p className="text-sm text-ink-faint">
        最新順位の取得に失敗しました。BigQueryの設定・権限を確認してください。
      </p>
    );
  }
  if (latest.length === 0) {
    return (
      <p className="text-sm text-ink-faint">
        このサイトにはまだ計測データがありません（定期取得ONのキーワードが計測されると表示されます）。
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {latest.map((row) => {
        const open = openKw === row.keyword;
        return (
          <div key={row.keyword} className="border border-line bg-white">
            <button
              type="button"
              onClick={() => openTrend(row.keyword)}
              className="w-full flex items-center gap-4 p-4 text-left hover:bg-paper/60 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ink line-clamp-1">{row.keyword}</div>
                <div className="text-[11px] text-ink-faint">
                  {row.total}件中 / {row.checked_at}
                </div>
              </div>
              <div
                className={`font-serif text-xl font-semibold ${
                  row.rank ? "text-bronze-deep" : "text-ink-faint"
                }`}
              >
                {row.rank ? `${row.rank}位` : "圏外"}
              </div>
              <span className={`text-ink-faint transition-transform ${open ? "rotate-180" : ""}`}>
                ▾
              </span>
            </button>

            {open && (
              <div className="border-t border-line p-4 bg-paper/40">
                {loadingKw === row.keyword ? (
                  <p className="text-sm text-ink-faint">推移を読み込み中…</p>
                ) : errorKw === row.keyword ? (
                  <p className="text-sm text-red-600">推移の取得に失敗しました。</p>
                ) : (
                  <TrendPanel points={trend[row.keyword] ?? []} url={row.url} />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TrendPanel({ points, url }: { points: TrendPoint[]; url: string | null }) {
  if (points.length === 0) {
    return <p className="text-sm text-ink-faint">推移データがありません。</p>;
  }
  // API は新しい順（DESC）。古い順に並べ替えて表示する。
  const asc = [...points].reverse();

  return (
    <div className="space-y-4">
      <Sparkline points={asc} />
      <div className="max-h-56 overflow-y-auto border border-line">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-ink text-paper">
            <tr>
              <th className="px-3 py-2 text-left">計測日時</th>
              <th className="px-3 py-2 text-right w-20">順位</th>
              <th className="px-3 py-2 text-right w-20">件数</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={`${p.checked_at}-${i}`} className="odd:bg-white even:bg-paper">
                <td className="px-3 py-1.5 text-ink-soft tabular-nums">{p.checked_at}</td>
                <td
                  className={`px-3 py-1.5 text-right tabular-nums font-medium ${
                    p.rank ? "text-bronze-deep" : "text-ink-faint"
                  }`}
                >
                  {p.rank ? `${p.rank}位` : "圏外"}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-ink-faint">{p.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {url && (
        <p className="text-xs text-ink-soft break-all">
          <span className="font-semibold">最新の掲載URL:</span>{" "}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-bronze-deep underline underline-offset-2"
          >
            {url}
          </a>
        </p>
      )}
    </div>
  );
}

// 順位推移の簡易スパークライン（順位1が上・圏外は下端の×印）。
function Sparkline({ points }: { points: TrendPoint[] }) {
  const ranked = points.filter((p) => p.rank != null) as (TrendPoint & { rank: number })[];
  if (ranked.length < 2) return null;

  const W = 480;
  const H = 80;
  const pad = 10;
  const n = points.length;
  const maxRank = Math.max(...ranked.map((p) => p.rank), 10);
  const x = (i: number) => (n === 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (n - 1));
  // rank=1 を上端、maxRank を下端に写像
  const y = (rank: number) =>
    maxRank === 1 ? pad : pad + ((rank - 1) * (H - 2 * pad)) / (maxRank - 1);

  // 連続する順位点だけを結ぶ折れ線パス（圏外はギャップにして新しいサブパスを始める）
  let d = "";
  let penDown = false;
  points.forEach((p, i) => {
    if (p.rank == null) {
      penDown = false;
      return;
    }
    d += `${penDown ? "L" : "M"}${x(i).toFixed(1)},${y(p.rank).toFixed(1)} `;
    penDown = true;
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20" preserveAspectRatio="none">
      <path d={d.trim()} fill="none" stroke="#86672f" strokeWidth={1.5} />
      {points.map((p, i) =>
        p.rank == null ? (
          <text
            key={i}
            x={x(i)}
            y={H - 2}
            textAnchor="middle"
            fontSize="9"
            fill="#8b877c"
          >
            ×
          </text>
        ) : (
          <circle key={i} cx={x(i)} cy={y(p.rank)} r={2.5} fill="#86672f" />
        )
      )}
    </svg>
  );
}
