"use client";

// 順位推移チャート（自社＋競合最大5社）。
// - Y軸: 1位が上。データに応じて 10/20/30/50/100 に段階スナップ
// - Top10 の帯を薄く表示
// - 未検出（取得N件内に不在）は線を切り、下端に × を表示
// - ホバーで日時・各ドメインの順位をツールチップ表示
import { useRef, useState } from "react";
import type { TrendSeriesPoint } from "@/lib/rank-tracker/bigquery";

// チャートに重ねられる競合の上限（色・線種のセット数と揃えること）
export const MAX_COMPS = 5;
export const TARGET_COLOR = "#86672f"; // bronze-deep
// 青鈍・弁柄・紫鼠・灰青・鶯茶（色覚差があっても線種で区別できるようダッシュも変える）
export const COMP_COLORS = ["#3f5c5a", "#7a5145", "#5f596f", "#4a6b8a", "#7d7038"];
const COMP_DASHES = ["7 4", "2 4", "10 4", "4 2 1 2", "14 4 2 4"];

const W = 760;
const H = 300;
const L = 46;
const R = 14;
const T = 14;
const B = 46;
const OUT_Y = H - B + 22; // 「未検出」帯のy位置

function snapMax(v: number): number {
  for (const s of [10, 20, 30, 50, 100]) if (v <= s) return s;
  return 100;
}

export default function RankChart({
  series,
  target,
  competitors,
}: {
  series: TrendSeriesPoint[];
  target: string;
  competitors: string[]; // 表示中の競合（最大 MAX_COMPS 社）
}) {
  const [hover, setHover] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [tipPos, setTipPos] = useState({ x: 0, y: 0 });

  const n = series.length;
  if (n === 0) {
    return <p className="text-sm text-ink-faint py-8 text-center">この期間の計測データがありません。</p>;
  }

  const domains = [target, ...competitors.slice(0, MAX_COMPS)];
  const allRanks = series.flatMap((p) =>
    domains.map((d) => p.ranks[d]).filter((r): r is number => r != null)
  );
  const maxRank = snapMax(Math.max(10, ...allRanks));

  const x = (i: number) => (n === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (n - 1));
  const y = (rank: number) =>
    T + ((Math.min(rank, maxRank) - 1) * (H - T - B)) / (maxRank - 1);

  // Y軸目盛り
  const ticks = [...new Set([1, Math.round(maxRank / 4), Math.round(maxRank / 2), Math.round((maxRank * 3) / 4), maxRank])]
    .filter((t) => t >= 1)
    .sort((a, b) => a - b);

  // X軸ラベル（間引き。"YYYY-MM-DD HH:MM" → "M/D"）
  const xStep = Math.max(1, Math.ceil(n / 8));
  const shortDate = (s: string) => {
    const m = s.match(/^\d{4}-(\d{2})-(\d{2})/);
    return m ? `${Number(m[1])}/${Number(m[2])}` : s;
  };

  const seriesFor = (domain: string) => series.map((p) => p.ranks[domain] ?? null);

  function pathFor(vals: (number | null)[]): string {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  }

  function onMove(ev: React.MouseEvent<SVGSVGElement>) {
    const svg = ev.currentTarget;
    const rect = svg.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) * W) / rect.width;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - L) * (n - 1)) / (W - L - R))));
    setHover(i);
    const box = boxRef.current?.getBoundingClientRect();
    if (box) setTipPos({ x: ev.clientX - box.left, y: ev.clientY - box.top });
  }

  const hovered = hover != null ? series[hover] : null;

  return (
    <div ref={boxRef} className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full h-auto"
        role="img"
        aria-label={`${target} の順位推移チャート`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* Top10帯（Y軸が10位より深いときだけ意味を持つ） */}
        {maxRank > 10 && (
          <>
            <rect x={L} y={y(1)} width={W - L - R} height={y(10) - y(1)} fill="rgba(161,124,63,0.06)" />
            <text x={W - R - 4} y={y(10) - 5} textAnchor="end" fontSize="10" fill="#b9a26d">
              Top10
            </text>
          </>
        )}
        {/* グリッドとY軸 */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} y1={y(t)} x2={W - R} y2={y(t)} stroke="#e2ded2" strokeWidth={1} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#8b877c">
              {t}
            </text>
          </g>
        ))}
        <text x={L - 8} y={OUT_Y + 4} textAnchor="end" fontSize="10" fill="#8b877c">
          未検出
        </text>
        {/* X軸ラベル */}
        {series.map((p, i) =>
          i % xStep === 0 ? (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#8b877c">
              {shortDate(p.checked_at)}
            </text>
          ) : null
        )}
        {/* ホバー位置の縦線 */}
        {hover != null && (
          <line x1={x(hover)} y1={T} x2={x(hover)} y2={H - B} stroke="#c9c3b2" strokeWidth={1} />
        )}
        {/* 競合（自社より下に描画） */}
        {competitors.slice(0, MAX_COMPS).map((c, ci) => {
          const vals = seriesFor(c);
          return (
            <g key={c}>
              <path
                d={pathFor(vals)}
                fill="none"
                stroke={COMP_COLORS[ci]}
                strokeWidth={1.8}
                strokeDasharray={COMP_DASHES[ci]}
              />
              {vals.map((v, i) =>
                v == null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={2.2} fill={COMP_COLORS[ci]} />
              )}
            </g>
          );
        })}
        {/* 自社 */}
        <path d={pathFor(seriesFor(target))} fill="none" stroke={TARGET_COLOR} strokeWidth={2.5} />
        {seriesFor(target).map((v, i) =>
          v == null ? (
            <text key={i} x={x(i)} y={OUT_Y + 4} textAnchor="middle" fontSize="11" fill="#8b877c">
              ×
            </text>
          ) : (
            <circle key={i} cx={x(i)} cy={y(v)} r={3.2} fill={TARGET_COLOR} />
          )
        )}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute z-10 bg-ink text-paper text-[11px] leading-relaxed px-2.5 py-1.5 whitespace-nowrap"
          style={{ left: tipPos.x, top: tipPos.y - 12, transform: "translate(-50%, -100%)" }}
        >
          <b>{hovered.checked_at}</b>
          <br />
          <span style={{ color: "#d9b878" }}>
            {target}{" "}
            {hovered.ranks[target] != null
              ? `${hovered.ranks[target]}位`
              : `${hovered.total}件内で未検出`}
          </span>
          {competitors.slice(0, MAX_COMPS).map((c) => (
            <span key={c}>
              <br />
              {c} {hovered.ranks[c] != null ? `${hovered.ranks[c]}位` : "未検出"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
