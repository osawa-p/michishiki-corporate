"use client";

// 俯瞰一覧ビュー: 全キーワードの最新順位・変化・90日統計をソート可能な全幅テーブルで一覧する。
// データはサーバーで一括プリロード済みの props（latestBy / seriesBy）からの純粋な導出のみで、
// BigQuery への追加クエリ・ペイロード増加は発生しない。
// ソート・検索・帯フィルタは一時状態（タグ絞り込みと同じく URL 非保持）。
import { useMemo, useState } from "react";
import type { LatestRank, TrackedKeyword, TrendSeriesPoint } from "@/lib/rank-tracker/bigquery";
import {
  Sparkline,
  diffBadge,
  kwStats,
  bandOf,
  bandCounts,
  matchesBand,
  BandChips,
  RANK_BANDS,
  type BandFilter,
} from "./keyword-bits";

// KPI行に置く順位帯の分布バー。セグメントクリックで俯瞰一覧を該当帯で開く
export function BandBar({
  measured,
  onPick,
}: {
  measured: LatestRank[];
  onPick: (band: BandFilter) => void;
}) {
  if (measured.length === 0) return null;
  const counts = RANK_BANDS.map((b) => measured.filter((l) => b.test(l.rank)).length);
  return (
    <div className="bg-white border border-line px-4 py-2.5 flex-1 min-w-[15rem]">
      <div className="text-[11px] text-ink-faint mb-1.5">
        順位帯の分布（クリックで俯瞰一覧を絞り込み）
      </div>
      <div className="flex gap-[2px] h-3.5" role="img" aria-label="順位帯の分布">
        {RANK_BANDS.map((b, i) =>
          counts[i] === 0 ? null : (
            <button
              key={b.key}
              type="button"
              title={`${b.label} ${counts[i]}件`}
              aria-label={`${b.label} ${counts[i]}件で絞り込む`}
              onClick={() => onPick(b.key)}
              className="min-w-[3px] cursor-pointer transition-opacity hover:opacity-75"
              style={{ background: b.color, flex: `${counts[i]} 0 auto` }}
            />
          )
        )}
      </div>
      <div className="flex flex-wrap gap-x-3.5 gap-y-0.5 mt-1.5 text-[11px] text-ink-soft">
        {RANK_BANDS.map((b, i) => (
          <span key={b.key}>
            <span
              className="inline-block w-2 h-2 mr-1 align-[-1px]"
              style={{ background: b.color }}
            />
            {b.label} <b className="tabular-nums font-semibold">{counts[i]}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

type Row = {
  t: TrackedKeyword;
  latest: LatestRank | undefined;
  best90: number | null;
  d30: number | null;
  spark: (number | null)[];
};

type SortKey = "kw" | "latest" | "diff" | "best" | "d30" | "urls" | "checked";
type Sort = { key: SortKey; dir: 1 | -1 };

function diffOf(l: LatestRank | undefined): number | null {
  return l && l.rank != null && l.prev_rank != null ? l.prev_rank - l.rank : null;
}

function Th({
  k,
  label,
  sort,
  onSort,
  align = "right",
  className = "",
}: {
  k: SortKey;
  label: string;
  sort: Sort;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort.key === k;
  return (
    <th
      aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
      className={`sticky top-0 z-10 bg-white px-3 py-2 border-b border-line whitespace-nowrap ${
        align === "left" ? "text-left" : "text-right"
      } ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className="font-semibold text-ink-faint hover:text-bronze-deep transition-colors"
      >
        {label}
        {active && (
          <span className="ml-0.5 text-[10px] text-bronze-deep">
            {sort.dir === 1 ? "▲" : "▼"}
          </span>
        )}
      </button>
    </th>
  );
}

export default function OverviewTable({
  tracked,
  latestBy,
  seriesBy,
  domainKey,
  band,
  onBandChange,
  onSelect,
}: {
  tracked: TrackedKeyword[]; // タグ絞り込み適用済みの一覧
  latestBy: Map<string, LatestRank>;
  seriesBy: Map<string, TrendSeriesPoint[]>;
  domainKey: string;
  band: BandFilter;
  onBandChange: (band: BandFilter) => void;
  onSelect: (keyword: string) => void;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>({ key: "latest", dir: 1 });

  const rows = useMemo<Row[]>(
    () =>
      tracked.map((t) => {
        const points = seriesBy.get(t.keyword) ?? [];
        const { best90, d30 } = kwStats(points, domainKey);
        return {
          t,
          latest: latestBy.get(t.keyword),
          best90,
          d30,
          spark: points.map((p) => p.ranks[domainKey] ?? null),
        };
      }),
    [tracked, latestBy, seriesBy, domainKey]
  );

  const searched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? rows.filter((r) => r.t.keyword.toLowerCase().includes(needle)) : rows;
  }, [rows, q]);

  const counts = useMemo(() => bandCounts(searched.map((r) => r.latest)), [searched]);

  const visible = useMemo(
    () => searched.filter((r) => matchesBand(r.latest, band)),
    [searched, band]
  );

  const sorted = useMemo(() => {
    const val = (r: Row): string | number | null => {
      switch (sort.key) {
        case "kw":
          return r.t.keyword;
        case "latest":
          return r.latest?.rank ?? null;
        case "diff":
          return diffOf(r.latest);
        case "best":
          return r.best90;
        case "d30":
          return r.d30;
        case "urls":
          // 本数が多い順に並ぶよう負数にする（カニバリ疑いのKWを上に）
          return r.latest ? -(r.latest.own_urls?.length ?? 0) : null;
        case "checked":
          return r.latest?.checked_at ?? null;
      }
    };
    return [...visible].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      // null（未検出・データ無し）はソート方向によらず常に末尾
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const c =
        typeof va === "string" ? va.localeCompare(String(vb), "ja") : va - (vb as number);
      return c * sort.dir;
    });
  }, [visible, sort]);

  function toggleSort(k: SortKey) {
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === 1 ? -1 : 1 } : { key: k, dir: 1 }));
  }

  return (
    <div>
      {/* 帯フィルタと検索 */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <BandChips counts={counts} band={band} onChange={onBandChange} />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="キーワードを検索…"
          aria-label="キーワードを検索"
          className="w-52 max-w-full px-2.5 py-1.5 text-xs border border-line bg-white text-ink focus:outline-2 focus:outline-bronze"
        />
      </div>

      {/* 俯瞰テーブル */}
      <div className="bg-white border border-line">
        <div className="overflow-auto max-h-[42rem]">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <Th k="kw" label="キーワード" sort={sort} onSort={toggleSort} align="left" />
                <th className="sticky top-0 z-10 bg-white px-3 py-2 border-b border-line text-left font-semibold text-ink-faint whitespace-nowrap hidden md:table-cell">
                  タグ
                </th>
                <Th k="latest" label="最新" sort={sort} onSort={toggleSort} />
                <Th k="diff" label="前回差" sort={sort} onSort={toggleSort} />
                <Th k="best" label="90日ベスト" sort={sort} onSort={toggleSort} className="hidden md:table-cell" />
                <Th k="d30" label="30日変化" sort={sort} onSort={toggleSort} className="hidden md:table-cell" />
                <Th k="urls" label="自社URL" sort={sort} onSort={toggleSort} className="hidden md:table-cell" />
                <th className="sticky top-0 z-10 bg-white px-3 py-2 border-b border-line text-left font-semibold text-ink-faint whitespace-nowrap">
                  推移(90日)
                </th>
                <Th k="checked" label="最終計測" sort={sort} onSort={toggleSort} className="hidden md:table-cell" />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-ink-faint">
                    該当するキーワードがありません
                  </td>
                </tr>
              ) : (
                sorted.map((r) => {
                  const kw = r.t.keyword;
                  const badge = diffBadge(r.latest);
                  const diffPlain = badge.label === "未検出" || badge.label === "未計測";
                  return (
                    <tr
                      key={kw}
                      tabIndex={0}
                      onClick={() => onSelect(kw)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onSelect(kw);
                      }}
                      title="クリックで個別分析へ"
                      className="odd:bg-white even:bg-paper hover:bg-bronze/5 cursor-pointer focus-visible:outline-2 focus-visible:outline-bronze focus-visible:-outline-offset-2"
                    >
                      <td className="px-3 py-1.5 text-left max-w-[17rem] truncate font-medium text-ink">
                        {kw}
                      </td>
                      <td className="px-3 py-1.5 text-left whitespace-nowrap hidden md:table-cell">
                        {r.t.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-block px-1.5 mr-1 text-[10px] leading-4 border border-bronze/30 text-bronze-deep bg-white"
                          >
                            {tag}
                          </span>
                        ))}
                        {r.t.cadence === "stopped" && (
                          <span className="text-[10px] text-ink-faint">停止中</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        {r.latest ? (
                          <>
                            <span
                              className="inline-block w-2 h-2 mr-1.5 align-[0px]"
                              style={{ background: bandOf(r.latest.rank).color }}
                            />
                            {r.latest.rank != null ? (
                              <span className="tabular-nums font-semibold text-sm text-bronze-deep">
                                {r.latest.rank}位
                              </span>
                            ) : (
                              <span className="text-ink-faint">圏外</span>
                            )}
                          </>
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        {diffPlain ? (
                          <span className="text-ink-faint">—</span>
                        ) : (
                          <span className={`tabular-nums ${badge.cls}`}>{badge.label}</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums hidden md:table-cell">
                        {r.best90 != null ? `${r.best90}位` : <span className="text-ink-faint">—</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap hidden md:table-cell">
                        {r.d30 == null ? (
                          <span className="text-ink-faint">—</span>
                        ) : r.d30 > 0 ? (
                          <span className="tabular-nums text-green-800">▲{r.d30}</span>
                        ) : r.d30 < 0 ? (
                          <span className="tabular-nums text-red-700">▼{-r.d30}</span>
                        ) : (
                          <span className="tabular-nums text-ink-faint">→0</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums hidden md:table-cell">
                        {r.latest?.own_urls?.length ? (
                          <span className="font-semibold text-bronze-deep">
                            {r.latest.own_urls.length}
                          </span>
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <Sparkline ranks={r.spark} />
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-ink-faint hidden md:table-cell">
                        {r.latest ? r.latest.checked_at.slice(5, 10) : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 text-[11px] text-ink-faint border-t border-line">
          {sorted.length}件を表示 ・ 行クリックで個別分析へ ・ 列ヘッダーで並べ替え
        </div>
      </div>
    </div>
  );
}
