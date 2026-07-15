"use client";

// サイト別ダッシュボードの分析ワークスペース。
// 左: キーワード一覧（タグ絞り込み・最新順位・前回差・ミニスパークライン）
// 右: 選択キーワードの推移チャート（期間切替・競合最大3社）と競合サマリ
// 選択キーワード・期間・競合は URL クエリに保持する（リロード・共有に耐える。
// replace() を使うため履歴は増やさない）。
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  LatestRank,
  TrackedKeyword,
  KeywordTrendRow,
  TrendSeriesPoint,
  CompetitorCandidate,
} from "@/lib/rank-tracker/bigquery";
import { cadenceLabel } from "@/lib/rank-tracker/cadence";
import { targetKey } from "@/lib/rank-tracker/domain";
import RankChart, { TARGET_COLOR, COMP_COLORS } from "./RankChart";

const RANGES = [
  { value: 30, label: "1ヶ月" },
  { value: 90, label: "3ヶ月" },
  { value: 0, label: "全期間" },
] as const;

type Detail = { series: TrendSeriesPoint[]; candidates: CompetitorCandidate[] };

function diffBadge(l: LatestRank | undefined): { label: string; cls: string } {
  if (!l) return { label: "未計測", cls: "text-ink-faint border-line" };
  if (l.rank == null) return { label: "未検出", cls: "text-ink-faint border-line" };
  if (!l.has_prev) return { label: "新規", cls: "text-bronze-deep border-bronze/40" };
  if (l.prev_rank == null) return { label: "復帰", cls: "text-green-800 border-green-700/40" };
  const d = l.prev_rank - l.rank;
  if (d > 0) return { label: `▲${d}`, cls: "text-green-800 border-green-700/40" };
  if (d < 0) return { label: `▼${-d}`, cls: "text-red-700 border-red-600/40" };
  return { label: "→0", cls: "text-ink-faint border-line" };
}

function Sparkline({ points }: { points: { rank: number | null }[] }) {
  const vals = points.slice(-16).map((p) => p.rank);
  if (vals.filter((v) => v != null).length < 2) return <span className="w-16" aria-hidden />;
  const w = 64;
  const h = 22;
  const pad = 2;
  let d = "";
  let pen = false;
  vals.forEach((v, i) => {
    if (v == null) {
      pen = false;
      return;
    }
    const px = pad + (i * (w - 2 * pad)) / (vals.length - 1);
    const py = pad + ((Math.min(v, 30) - 1) * (h - 2 * pad)) / 29;
    d += `${pen ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)} `;
    pen = true;
  });
  return (
    <svg width={w} height={h} aria-hidden className="shrink-0">
      <path d={d.trim()} fill="none" stroke="#a17c3f" strokeWidth={1.4} />
    </svg>
  );
}

export default function DashboardWorkspace({
  domain,
  tracked,
  latest,
  trends,
  loadError,
}: {
  domain: string;
  tracked: TrackedKeyword[];
  latest: LatestRank[];
  trends: KeywordTrendRow[];
  loadError: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  // series.ranks のキーは正規化済みドメイン。URL直打ち（www付き等）でも一致するよう
  // 表示用 domain と照合キーを分離する
  const domainKey = targetKey(domain);

  const latestBy = useMemo(() => new Map(latest.map((l) => [l.keyword, l])), [latest]);
  const sparkBy = useMemo(() => {
    const m = new Map<string, { rank: number | null }[]>();
    for (const t of trends) {
      const arr = m.get(t.keyword) ?? [];
      arr.push({ rank: t.rank });
      m.set(t.keyword, arr);
    }
    return m;
  }, [trends]);
  const allTags = useMemo(() => [...new Set(tracked.flatMap((t) => t.tags))].sort(), [tracked]);

  // ── URL 状態 ──
  const urlKw = sp.get("kw") ?? "";
  const rawRange = Number(sp.get("range") ?? 30);
  const range = RANGES.some((r) => r.value === rawRange) ? rawRange : 30;
  const comps = useMemo(
    () =>
      [
        ...new Set(
          (sp.get("comps") ?? "")
            .split(",")
            .map((s) => targetKey(s))
            .filter((s) => s && s !== domainKey)
        ),
      ].slice(0, 3),
    [sp, domainKey]
  );

  const [tagFilter, setTagFilter] = useState("");
  const shownKeywords = tracked.filter((t) => !tagFilter || t.tags.includes(tagFilter));
  // タグ絞り込みで選択中キーワードが一覧から消えたら、表示中の先頭へ選択を移す
  const selected =
    urlKw && shownKeywords.some((t) => t.keyword === urlKw)
      ? urlKw
      : (shownKeywords[0]?.keyword ?? "");

  function setUrl(patch: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  // ── 選択キーワードの詳細（推移＋競合候補） ──
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(false);
  const cacheRef = useRef(new Map<string, Detail>());
  const compsKey = comps.join(",");

  useEffect(() => {
    if (!selected) return;
    const key = `${selected}|${range}|${compsKey}`;
    const hit = cacheRef.current.get(key);
    if (hit) {
      setDetail(hit);
      setErr(false);
      // 直前の未完了fetchのfinallyはaborted扱いでloadingを触らないため、ここで確実に解除する
      setLoading(false);
      return;
    }
    let aborted = false;
    setLoading(true);
    setErr(false);
    const qs = new URLSearchParams({
      domain,
      keyword: selected,
      range: String(range),
      competitors: compsKey,
      withCandidates: "1",
    });
    fetch(`/api/rank-tracker/history?${qs.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (aborted) return;
        if (!data.ok) throw new Error();
        const d: Detail = {
          series: data.series as TrendSeriesPoint[],
          candidates: (data.candidates ?? []) as CompetitorCandidate[],
        };
        cacheRef.current.set(key, d);
        setDetail(d);
      })
      .catch(() => {
        if (!aborted) setErr(true);
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });
    return () => {
      aborted = true;
    };
  }, [selected, range, compsKey, domain]);

  if (loadError) {
    return (
      <p className="text-sm text-ink-faint">
        データの取得に失敗しました。BigQueryの設定・権限を確認してください。
      </p>
    );
  }
  if (tracked.length === 0) {
    return (
      <p className="text-sm text-ink-faint">
        このサイトにはまだ登録キーワードがありません。
        <Link
          href="/rank-tracker/keywords"
          className="text-bronze-deep underline underline-offset-2 ml-1"
        >
          キーワード管理
        </Link>
        から登録してください。
      </p>
    );
  }

  // ── KPI ──
  const measured = tracked.map((t) => latestBy.get(t.keyword)).filter(Boolean) as LatestRank[];
  const top10 = measured.filter((l) => l.rank != null && l.rank <= 10).length;
  const up = measured.filter(
    (l) => l.rank != null && l.prev_rank != null && l.rank < l.prev_rank
  ).length;
  const notFound = measured.filter((l) => l.rank == null).length;
  const lastChecked = measured.reduce((a, l) => (l.checked_at > a ? l.checked_at : a), "");

  const selectedTracked = tracked.find((t) => t.keyword === selected);
  const selectedLatest = latestBy.get(selected);
  const selBadge = diffBadge(selectedLatest);

  function toggleComp(d: string) {
    const next = comps.includes(d)
      ? comps.filter((c) => c !== d)
      : comps.length >= 3
        ? comps
        : [...comps, d];
    setUrl({ comps: next.join(",") });
  }

  const kpiCls = "bg-white border border-line px-4 py-2.5 min-w-[7rem]";

  return (
    <div className="space-y-5">
      {/* KPI */}
      <div className="flex flex-wrap gap-2.5">
        <div className={kpiCls}>
          <div className="font-serif text-xl font-semibold leading-tight">
            {tracked.length}
            <span className="font-sans text-xs font-normal text-ink-faint"> 件</span>
          </div>
          <div className="text-[11px] text-ink-faint">登録キーワード</div>
        </div>
        <div className={kpiCls}>
          <div className="font-serif text-xl font-semibold leading-tight text-bronze-deep">
            {top10}
            <span className="font-sans text-xs font-normal text-ink-faint"> 件</span>
          </div>
          <div className="text-[11px] text-ink-faint">Top10入り</div>
        </div>
        <div className={kpiCls}>
          <div className="font-serif text-xl font-semibold leading-tight text-green-800">
            {up}
            <span className="font-sans text-xs font-normal text-ink-faint"> 件</span>
          </div>
          <div className="text-[11px] text-ink-faint">前回から上昇</div>
        </div>
        <div className={kpiCls}>
          <div className="font-serif text-xl font-semibold leading-tight text-ink-faint">
            {notFound}
            <span className="font-sans text-xs font-normal text-ink-faint"> 件</span>
          </div>
          <div className="text-[11px] text-ink-faint">未検出</div>
        </div>
        {lastChecked && (
          <div className={kpiCls}>
            <div className="text-sm font-semibold leading-tight pt-1 tabular-nums">
              {lastChecked.slice(5)}
            </div>
            <div className="text-[11px] text-ink-faint">最終取得</div>
          </div>
        )}
      </div>

      {/* タグ絞り込み */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
          <span>タグ:</span>
          <button
            type="button"
            onClick={() => setTagFilter("")}
            className={`px-2.5 py-1 border ${
              tagFilter === ""
                ? "bg-ink text-paper border-ink"
                : "bg-white border-line text-ink-soft hover:text-bronze-deep"
            }`}
          >
            すべて
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTagFilter(tagFilter === t ? "" : t)}
              className={`px-2.5 py-1 border ${
                tagFilter === t
                  ? "bg-ink text-paper border-ink"
                  : "bg-white border-line text-ink-soft hover:text-bronze-deep"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* ワークスペース */}
      <div className="bg-white border border-line grid lg:grid-cols-[19rem_minmax(0,1fr)]">
        {/* 左: キーワード一覧 */}
        <div className="border-b lg:border-b-0 lg:border-r border-line max-h-[32rem] lg:max-h-none overflow-y-auto">
          <div className="px-4 py-3 border-b border-line text-[11px] tracking-wider text-ink-faint">
            キーワード（{shownKeywords.length}）
          </div>
          {shownKeywords.map((t) => {
            const l = latestBy.get(t.keyword);
            const badge = diffBadge(l);
            const sel = t.keyword === selected;
            return (
              <button
                key={t.keyword}
                type="button"
                onClick={() => setUrl({ kw: t.keyword, comps: null })}
                aria-pressed={sel}
                className={`w-full text-left px-4 py-3 border-b border-line border-l-2 transition-colors ${
                  sel ? "border-l-bronze bg-bronze/5" : "border-l-transparent hover:bg-bronze/5"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-ink truncate">{t.keyword}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className={`px-1.5 text-[10px] leading-4 border bg-white ${badge.cls}`}>
                        {badge.label}
                      </span>
                      {t.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-1.5 text-[10px] leading-4 border border-bronze/30 text-bronze-deep bg-white"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div
                    className={`font-serif text-lg font-semibold tabular-nums ${
                      l?.rank ? "text-bronze-deep" : "text-ink-faint text-sm"
                    }`}
                  >
                    {l ? (l.rank ? `${l.rank}位` : "圏外") : "—"}
                  </div>
                  <Sparkline points={sparkBy.get(t.keyword) ?? []} />
                </div>
              </button>
            );
          })}
        </div>

        {/* 右: 分析パネル */}
        <div className="p-5 md:p-6 min-w-0">
          {!selected ? (
            <p className="text-sm text-ink-faint">左の一覧からキーワードを選択してください。</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-serif text-lg font-semibold break-all">{selected}</h2>
                <div className="inline-flex border border-line" role="group" aria-label="表示期間">
                  {RANGES.map((r, i) => (
                    <button
                      key={r.value}
                      type="button"
                      aria-pressed={range === r.value}
                      onClick={() => setUrl({ range: String(r.value) })}
                      className={`px-3.5 py-1.5 text-xs ${i > 0 ? "border-l border-line" : ""} ${
                        range === r.value
                          ? "bg-ink text-paper"
                          : "bg-white text-ink-soft hover:text-bronze-deep"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mt-1 mb-4 text-xs text-ink-faint">
                {selectedTracked ? `${cadenceLabel(selectedTracked.cadence)}取得` : ""}
                {selectedLatest
                  ? ` ・ 最新 ${selectedLatest.rank ? `${selectedLatest.rank}位` : "未検出"}（${selBadge.label}） ・ ${selectedLatest.checked_at}`
                  : " ・ まだ計測データがありません"}
              </p>

              {/* 凡例 */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-xs text-ink-soft">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-5 border-t-[3px]" style={{ borderColor: TARGET_COLOR }} />
                  {domain}（自社）
                </span>
                {comps.map((c, i) => (
                  <span key={c} className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block w-5 border-t-[3px] border-dashed"
                      style={{ borderColor: COMP_COLORS[i] }}
                    />
                    {c}
                  </span>
                ))}
              </div>

              {loading ? (
                <div className="h-[300px] flex items-center justify-center">
                  <p className="text-sm text-ink-faint animate-pulse">推移を読み込み中…</p>
                </div>
              ) : err ? (
                <p className="text-sm text-red-600 py-8">推移の取得に失敗しました。</p>
              ) : detail ? (
                <>
                  <RankChart series={detail.series} target={domainKey} competitors={comps} />

                  {/* 競合サマリ */}
                  {detail.candidates.length > 0 && (
                    <div className="mt-5 overflow-x-auto">
                      <p className="text-xs font-semibold text-ink-soft mb-2">
                        競合サマリ（この期間のSERPから自動抽出・チェックでチャートに重ねる／最大3社）
                      </p>
                      <table className="w-full text-xs border border-line">
                        <thead>
                          <tr className="text-ink-faint">
                            <th className="text-left px-3 py-2 border-b border-line font-semibold">ドメイン</th>
                            <th className="text-right px-3 py-2 border-b border-line font-semibold">最新</th>
                            <th className="text-right px-3 py-2 border-b border-line font-semibold">最高</th>
                            <th className="text-right px-3 py-2 border-b border-line font-semibold">平均</th>
                            <th className="text-right px-3 py-2 border-b border-line font-semibold">出現</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.candidates.slice(0, 6).map((c) => {
                            const checked = comps.includes(c.domain);
                            const colorIdx = comps.indexOf(c.domain);
                            return (
                              <tr key={c.domain} className="odd:bg-white even:bg-paper">
                                <td className="px-3 py-1.5">
                                  <label className="inline-flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={!checked && comps.length >= 3}
                                      onChange={() => toggleComp(c.domain)}
                                      className="h-3.5 w-3.5 accent-bronze-deep"
                                    />
                                    {checked && (
                                      <span
                                        className="inline-block w-4 border-t-2"
                                        style={{ borderColor: COMP_COLORS[colorIdx] }}
                                      />
                                    )}
                                    <span className="break-all">{c.domain}</span>
                                  </label>
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums">{c.latest_rank}位</td>
                                <td className="px-3 py-1.5 text-right tabular-nums">{c.best_rank}位</td>
                                <td className="px-3 py-1.5 text-right tabular-nums">{c.avg_rank}位</td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-ink-faint">
                                  {c.appearances}/{c.batches}回
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* 計測履歴 */}
                  {detail.series.length > 0 && (
                    <details className="mt-4 border border-line">
                      <summary className="px-4 py-2.5 text-xs text-ink-soft cursor-pointer select-none">
                        計測履歴（{detail.series.length}回）を表で見る
                      </summary>
                      <div className="border-t border-line max-h-52 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-ink-faint sticky top-0 bg-white">
                              <th className="text-left px-4 py-2 border-b border-line font-semibold">計測日時</th>
                              <th className="text-right px-4 py-2 border-b border-line font-semibold">自社順位</th>
                              <th className="text-right px-4 py-2 border-b border-line font-semibold">取得件数</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...detail.series].reverse().map((p) => (
                              <tr key={p.checked_at} className="odd:bg-white even:bg-paper">
                                <td className="px-4 py-1.5 text-ink-soft tabular-nums">{p.checked_at}</td>
                                <td
                                  className={`px-4 py-1.5 text-right tabular-nums font-medium ${
                                    p.ranks[domainKey] != null ? "text-bronze-deep" : "text-ink-faint"
                                  }`}
                                >
                                  {p.ranks[domainKey] != null ? `${p.ranks[domainKey]}位` : "未検出"}
                                </td>
                                <td className="px-4 py-1.5 text-right tabular-nums text-ink-faint">{p.total}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
