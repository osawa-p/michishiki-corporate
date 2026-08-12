"use client";

// ダッシュボード系コンポーネント（DashboardWorkspace / OverviewTable）で共有する
// キーワード表示部品と、プリロード済み時系列からの統計導出。
// すべて props からの純粋な導出で、現在時刻・乱数に依存しない（hydration差分を出さない）。
import type { LatestRank, TrendSeriesPoint } from "@/lib/rank-tracker/bigquery";

export function diffBadge(l: LatestRank | undefined): { label: string; cls: string } {
  if (!l) return { label: "未計測", cls: "text-ink-faint border-line" };
  if (l.rank == null) return { label: "未検出", cls: "text-ink-faint border-line" };
  if (!l.has_prev) return { label: "新規", cls: "text-bronze-deep border-bronze/40" };
  if (l.prev_rank == null) return { label: "復帰", cls: "text-green-800 border-green-700/40" };
  const d = l.prev_rank - l.rank;
  if (d > 0) return { label: `▲${d}`, cls: "text-green-800 border-green-700/40" };
  if (d < 0) return { label: `▼${-d}`, cls: "text-red-700 border-red-600/40" };
  return { label: "→0", cls: "text-ink-faint border-line" };
}

// 最新計測日時から n 日前のJST日時文字列（"YYYY-MM-DD HH:MM"）。checked_at と辞書順比較できる。
// 現在時刻でなくデータ側の最新時刻を起点にすることで、SSRとhydrationの時刻差による
// 表示ずれ（hydration mismatch）を避け、純粋な導出にする。
export function cutoffFrom(latestCheckedAt: string, days: number): string {
  const d = new Date(latestCheckedAt.replace(" ", "T") + ":00+09:00");
  d.setTime(d.getTime() - days * 86_400_000);
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

export function Sparkline({ ranks }: { ranks: (number | null)[] }) {
  const vals = ranks.slice(-16);
  if (vals.filter((v) => v != null).length < 2) return <span className="w-16" aria-hidden />;
  const w = 64;
  const h = 22;
  const pad = 3; // 終端ドットが欠けない余白
  const pts = vals.map((v, i) =>
    v == null
      ? null
      : ([
          pad + (i * (w - 2 * pad)) / (vals.length - 1),
          pad + ((Math.min(v, 30) - 1) * (h - 2 * pad)) / 29,
        ] as const)
  );
  let d = "";
  let pen = false;
  for (const p of pts) {
    if (p == null) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)} `;
    pen = true;
  }
  const last = [...pts].reverse().find((p) => p != null);
  return (
    <svg width={w} height={h} aria-hidden className="shrink-0">
      <path d={d.trim()} fill="none" stroke="#a17c3f" strokeWidth={1.4} />
      {last && <circle cx={last[0]} cy={last[1]} r={2} fill="#86672f" />}
    </svg>
  );
}

// ── 順位帯（俯瞰ビューの分布バー・チップ・行ドットで共有） ──
// 色はブロンズ系の濃淡（濃=上位）＋未検出はニュートラル。識別は必ずラベル文字を併記し、
// 色のみに依存しない。
export type BandKey = "top3" | "t10" | "t30" | "low" | "out";

export type RankBand = {
  key: BandKey;
  label: string;
  color: string;
  test: (rank: number | null) => boolean;
};

export const RANK_BANDS: RankBand[] = [
  { key: "top3", label: "Top3", color: "#5c451c", test: (r) => r != null && r <= 3 },
  { key: "t10", label: "4〜10位", color: "#86672f", test: (r) => r != null && r >= 4 && r <= 10 },
  { key: "t30", label: "11〜30位", color: "#ab8a4d", test: (r) => r != null && r >= 11 && r <= 30 },
  { key: "low", label: "31位以下", color: "#cbb27a", test: (r) => r != null && r > 30 },
  { key: "out", label: "未検出", color: "#b3aea1", test: (r) => r == null },
];

export function bandOf(rank: number | null): RankBand {
  return RANK_BANDS.find((b) => b.test(rank))!;
}

// 俯瞰ビューの帯フィルタ。"le10" はKPI「Top10入り」と対応する複合帯（Top3+4〜10位）
export type BandFilter = "" | "le10" | BandKey;

export function matchesBand(l: LatestRank | undefined, band: BandFilter): boolean {
  if (!band) return true;
  if (!l) return false;
  if (band === "le10") return l.rank != null && l.rank <= 10;
  const b = RANK_BANDS.find((x) => x.key === band);
  return !!b && b.test(l.rank);
}

// 帯フィルタチップに出す件数（キー: "" | "le10" | BandKey）。未計測は「すべて」のみに含む
export function bandCounts(latests: (LatestRank | undefined)[]): Record<string, number> {
  const m: Record<string, number> = { "": latests.length, le10: 0 };
  for (const b of RANK_BANDS) m[b.key] = 0;
  for (const l of latests) {
    if (!l) continue;
    if (l.rank != null && l.rank <= 10) m.le10++;
    m[bandOf(l.rank).key]++;
  }
  return m;
}

// 帯フィルタのチップ列（俯瞰一覧・ヒートマップで共有）
export function BandChips({
  counts,
  band,
  onChange,
}: {
  counts: Record<string, number>;
  band: BandFilter;
  onChange: (band: BandFilter) => void;
}) {
  const chips: { value: BandFilter; label: string }[] = [
    { value: "", label: "すべて" },
    { value: "le10", label: "Top10" },
    ...RANK_BANDS.map((b) => ({ value: b.key as BandFilter, label: b.label })),
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button
          key={c.value}
          type="button"
          onClick={() => onChange(c.value)}
          aria-pressed={band === c.value}
          className={`px-2.5 py-1 text-xs border ${
            band === c.value
              ? "bg-ink text-paper border-ink"
              : "bg-white border-line text-ink-soft hover:text-bronze-deep"
          }`}
        >
          {c.label} <span className="tabular-nums">{counts[c.value] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}

// SERPのURLからGoogleのトラッキングパラメータ（srsltid）を除去する。
// 表示・リンク用の整形で、BQ上の生データは変更しない
export function cleanSerpUrl(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete("srsltid");
    return u.toString();
  } catch {
    return url;
  }
}

// 90日プリロード系列からキーワード統計を導出する。
// best90 = 期間内ベスト順位、d30 = 直近30日の変化（正=上昇。有効値2点未満は null）
export function kwStats(
  points: TrendSeriesPoint[],
  domainKey: string
): { best90: number | null; d30: number | null } {
  let best90: number | null = null;
  for (const p of points) {
    const r = p.ranks[domainKey];
    if (r != null && (best90 === null || r < best90)) best90 = r;
  }
  let d30: number | null = null;
  if (points.length > 0) {
    const cutoff = cutoffFrom(points[points.length - 1].checked_at, 30);
    const win = points
      .filter((p) => p.checked_at >= cutoff)
      .map((p) => p.ranks[domainKey])
      .filter((r): r is number => r != null);
    if (win.length >= 2) d30 = win[0] - win[win.length - 1];
  }
  return { best90, d30 };
}
