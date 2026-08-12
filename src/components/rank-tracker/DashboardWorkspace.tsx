"use client";

// サイト別ダッシュボードの分析ワークスペース。
// 左: キーワード一覧（タグ絞り込み・最新順位・前回差・ミニスパークライン）
// 右: 選択キーワードの推移チャート（期間切替・競合最大5社）と競合サマリ
//
// パフォーマンス設計: 直近90日分の全キーワード推移＋競合はサーバーで一括プリロード
// されて props で渡ってくるため、キーワード切替・競合ON/OFF・期間切替（1ヶ月/3ヶ月）
// は BigQuery へ行かずクライアント側で即時に完結する。「全期間」だけオンデマンド取得。
// 選択キーワード・期間・競合は URL クエリに保持する（リロード・共有に耐える。
// replace() を使うため履歴は増やさない）。
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  LatestRank,
  LatestSerp,
  TrackedKeyword,
  TrendSeriesPoint,
  SiteSeriesPack,
  SiteCandidateRow,
  CompetitorCandidate,
} from "@/lib/rank-tracker/bigquery";
import { cadenceLabel } from "@/lib/rank-tracker/cadence";
import { targetKey } from "@/lib/rank-tracker/domain";
import RankChart, { TARGET_COLOR, COMP_COLORS, MAX_COMPS } from "./RankChart";
import OverviewTable, { BandBar } from "./OverviewTable";
import {
  Sparkline,
  diffBadge,
  cutoffFrom,
  cleanSerpUrl,
  type BandFilter,
} from "./keyword-bits";

const RANGES = [
  { value: 30, label: "1ヶ月" },
  { value: 90, label: "3ヶ月" },
  { value: 0, label: "全期間" },
] as const;

export default function DashboardWorkspace({
  domain,
  tracked,
  latest,
  series,
  candidates,
  loadError,
}: {
  domain: string;
  tracked: TrackedKeyword[];
  latest: LatestRank[];
  series: SiteSeriesPack;
  candidates: SiteCandidateRow[];
  loadError: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  // series.ranks のキーは正規化済みドメイン。URL直打ち（www付き等）でも一致するよう
  // 表示用 domain と照合キーを分離する
  const domainKey = targetKey(domain);

  const latestBy = useMemo(() => new Map(latest.map((l) => [l.keyword, l])), [latest]);

  // サーバー側でパック済みの時系列（bigquery.packSiteSeries）を Map 化
  const seriesBy = useMemo(
    () => new Map(series.map((s) => [s.keyword, s.points])),
    [series]
  );

  const candidatesBy = useMemo(() => {
    const m = new Map<string, CompetitorCandidate[]>();
    for (const c of candidates) {
      const arr = m.get(c.keyword) ?? [];
      arr.push(c);
      m.set(c.keyword, arr);
    }
    return m;
  }, [candidates]);

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
      ].slice(0, MAX_COMPS),
    [sp, domainKey]
  );

  // ビュー: 俯瞰一覧（view=overview）/ 個別分析（未指定・不明値）。既存の共有URLは挙動不変
  const view = sp.get("view") === "overview" ? "overview" : "detail";

  const [tagFilter, setTagFilter] = useState("");
  // 個別分析の左リスト用の絞り込み・並べ替え（一時状態）
  const [kwQuery, setKwQuery] = useState("");
  const [kwSort, setKwSort] = useState<"reg" | "rank" | "diff" | "name">("reg");
  // 俯瞰一覧の帯フィルタ（ソート・検索と同じく一時状態。KPIタイル・分布バーからも設定される）
  const [band, setBand] = useState<BandFilter>("");
  const shownKeywords = tracked.filter((t) => !tagFilter || t.tags.includes(tagFilter));

  // 個別分析の左リスト表示用（検索・並べ替え適用後）。選択の自動フォールバックには
  // shownKeywords を使い続け、絞り込みで選択が勝手に変わらないようにする
  const kwNeedle = kwQuery.trim().toLowerCase();
  let listKeywords = kwNeedle
    ? shownKeywords.filter((t) => t.keyword.toLowerCase().includes(kwNeedle))
    : shownKeywords;
  if (kwSort !== "reg") {
    const by = (t: TrackedKeyword): number | string | null => {
      if (kwSort === "name") return t.keyword;
      const l = latestBy.get(t.keyword);
      if (kwSort === "rank") return l?.rank ?? null;
      // 変動順: 変動幅の大きい順（未計測・未検出は末尾）
      return l && l.rank != null && l.prev_rank != null
        ? -Math.abs(l.prev_rank - l.rank)
        : null;
    };
    listKeywords = [...listKeywords].sort((a, b) => {
      const va = by(a);
      const vb = by(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return typeof va === "string" ? va.localeCompare(String(vb), "ja") : va - (vb as number);
    });
  }
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

  // ── 「全期間」だけオンデマンド取得（90日を超える過去分が必要なため） ──
  // ローディングは「まだ allTime に無い」ことから導出する（effect内の同期setStateを避ける）
  const [allTime, setAllTime] = useState<Record<string, TrendSeriesPoint[]>>({});
  const [errKey, setErrKey] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const fetchedRef = useRef(new Set<string>());
  const compsKey = comps.join(",");

  useEffect(() => {
    if (range !== 0 || !selected) return;
    const key = `${selected}|${compsKey}`;
    if (fetchedRef.current.has(key)) return;
    let aborted = false;
    // 再取得の開始時に前回のエラー表示を消す（effect本文の同期setStateを避けるため遅延）
    queueMicrotask(() => {
      if (!aborted) setErrKey((k) => (k === key ? null : k));
    });
    const qs = new URLSearchParams({
      domain,
      keyword: selected,
      range: "0",
      competitors: compsKey,
    });
    fetch(`/api/rank-tracker/history?${qs.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (aborted) return;
        if (!data.ok) throw new Error();
        fetchedRef.current.add(key);
        setAllTime((m) => ({ ...m, [key]: data.series as TrendSeriesPoint[] }));
        setErrKey((k) => (k === key ? null : k));
      })
      .catch(() => {
        if (!aborted) setErrKey(key);
      });
    return () => {
      aborted = true;
    };
  }, [range, selected, compsKey, domain, retry]);

  // ── SERP詳細（選択キーワードの最新計測分）もオンデマンド取得 ──
  // 全KW分をプリロードすると重いため、個別分析で選択されたキーワードだけ取りに行く
  const [serpBy, setSerpBy] = useState<Record<string, LatestSerp>>({});
  const [serpErrKey, setSerpErrKey] = useState<string | null>(null);
  const [serpRetry, setSerpRetry] = useState(0);
  const [serpFilter, setSerpFilter] = useState<"top20" | "all" | "own">("top20");
  const serpFetchedRef = useRef(new Set<string>());

  useEffect(() => {
    if (view !== "detail" || !selected) return;
    if (serpFetchedRef.current.has(selected)) return;
    let aborted = false;
    const key = selected;
    queueMicrotask(() => {
      if (!aborted) setSerpErrKey((k) => (k === key ? null : k));
    });
    const qs = new URLSearchParams({ domain, keyword: key });
    fetch(`/api/rank-tracker/serp?${qs.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (aborted) return;
        if (!data.ok) throw new Error();
        serpFetchedRef.current.add(key);
        setSerpBy((m) => ({ ...m, [key]: data.serp as LatestSerp }));
        setSerpErrKey((k) => (k === key ? null : k));
      })
      .catch(() => {
        if (!aborted) setSerpErrKey(key);
      });
    return () => {
      aborted = true;
    };
  }, [view, selected, domain, serpRetry]);

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
  const selectedCandidates = candidatesBy.get(selected) ?? [];
  const selectedSerp = serpBy[selected];

  // 表示する時系列: 1ヶ月/3ヶ月はプリロードからクライアントで切り出し、全期間はオンデマンド
  const preloaded = seriesBy.get(selected) ?? [];
  let points: TrendSeriesPoint[] | null;
  if (range === 0) {
    points = allTime[`${selected}|${compsKey}`] ?? null;
  } else if (range === 90 || preloaded.length === 0) {
    points = preloaded;
  } else {
    const cutoff = cutoffFrom(preloaded[preloaded.length - 1].checked_at, 30);
    points = preloaded.filter((p) => p.checked_at >= cutoff);
  }
  const waiting = range === 0 && points === null;

  // URL直打ち等でプリロードに存在しない競合ドメインが指定された場合、30日/90日表示では
  // 線を描けない（候補上位20社のみプリロード対象）ため、存在するものだけをチャートへ渡す。
  // 全期間はAPIが指定ドメインを明示的に取得するのでそのまま。
  const presentDomains = new Set<string>();
  for (const p of preloaded) for (const d of Object.keys(p.ranks)) presentDomains.add(d);
  const chartComps = range === 0 ? comps : comps.filter((c) => presentDomains.has(c));

  function toggleComp(d: string) {
    const next = comps.includes(d)
      ? comps.filter((c) => c !== d)
      : comps.length >= MAX_COMPS
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
        <button
          type="button"
          onClick={() => {
            setBand("le10");
            setUrl({ view: "overview" });
          }}
          title="俯瞰一覧をTop10で絞り込む"
          className={`${kpiCls} text-left cursor-pointer transition-colors hover:border-bronze`}
        >
          <div className="font-serif text-xl font-semibold leading-tight text-bronze-deep">
            {top10}
            <span className="font-sans text-xs font-normal text-ink-faint"> 件</span>
          </div>
          <div className="text-[11px] text-ink-faint">Top10入り ›</div>
        </button>
        <div className={kpiCls}>
          <div className="font-serif text-xl font-semibold leading-tight text-green-800">
            {up}
            <span className="font-sans text-xs font-normal text-ink-faint"> 件</span>
          </div>
          <div className="text-[11px] text-ink-faint">前回から上昇</div>
        </div>
        <button
          type="button"
          onClick={() => {
            setBand("out");
            setUrl({ view: "overview" });
          }}
          title="俯瞰一覧を未検出で絞り込む"
          className={`${kpiCls} text-left cursor-pointer transition-colors hover:border-bronze`}
        >
          <div className="font-serif text-xl font-semibold leading-tight text-ink-faint">
            {notFound}
            <span className="font-sans text-xs font-normal text-ink-faint"> 件</span>
          </div>
          <div className="text-[11px] text-ink-faint">未検出 ›</div>
        </button>
        {lastChecked && (
          <div className={kpiCls}>
            <div className="text-sm font-semibold leading-tight pt-1 tabular-nums">
              {lastChecked.slice(5)}
            </div>
            <div className="text-[11px] text-ink-faint">最終取得</div>
          </div>
        )}
        <BandBar
          measured={measured}
          onPick={(b) => {
            setBand(b);
            setUrl({ view: "overview" });
          }}
        />
      </div>

      {/* タグ絞り込みとビュー切替 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
          {allTags.length > 0 && (
            <>
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
            </>
          )}
        </div>
        <div className="inline-flex border border-line" role="group" aria-label="表示ビュー">
          <button
            type="button"
            aria-pressed={view === "overview"}
            onClick={() => setUrl({ view: "overview" })}
            className={`px-3.5 py-1.5 text-xs ${
              view === "overview"
                ? "bg-ink text-paper"
                : "bg-white text-ink-soft hover:text-bronze-deep"
            }`}
          >
            俯瞰一覧
          </button>
          <button
            type="button"
            aria-pressed={view === "detail"}
            onClick={() => setUrl({ view: null })}
            className={`px-3.5 py-1.5 text-xs border-l border-line ${
              view === "detail"
                ? "bg-ink text-paper"
                : "bg-white text-ink-soft hover:text-bronze-deep"
            }`}
          >
            個別分析
          </button>
        </div>
      </div>

      {/* ワークスペース: 俯瞰一覧はプリロード済みデータの導出のみで全幅テーブル表示 */}
      {view === "overview" ? (
        <OverviewTable
          tracked={shownKeywords}
          latestBy={latestBy}
          seriesBy={seriesBy}
          domainKey={domainKey}
          band={band}
          onBandChange={setBand}
          onSelect={(kw) => setUrl({ kw, view: null, comps: null })}
        />
      ) : (
      <div className="bg-white border border-line grid lg:grid-cols-[19rem_minmax(0,1fr)]">
        {/* 左: キーワード一覧 */}
        <div className="border-b lg:border-b-0 lg:border-r border-line max-h-[32rem] lg:max-h-none overflow-y-auto">
          <div className="px-4 py-3 border-b border-line text-[11px] tracking-wider text-ink-faint">
            キーワード（
            {listKeywords.length !== shownKeywords.length
              ? `${listKeywords.length}/${shownKeywords.length}`
              : shownKeywords.length}
            ）
          </div>
          <div className="px-4 py-2 border-b border-line flex items-center gap-2">
            <input
              type="search"
              value={kwQuery}
              onChange={(e) => setKwQuery(e.target.value)}
              placeholder="絞り込み…"
              aria-label="キーワードを絞り込み"
              className="flex-1 min-w-0 px-2 py-1 text-xs border border-line bg-white text-ink focus:outline-2 focus:outline-bronze"
            />
            <select
              value={kwSort}
              onChange={(e) => setKwSort(e.target.value as typeof kwSort)}
              aria-label="並べ替え"
              className="px-1.5 py-1 text-xs border border-line bg-white text-ink-soft"
            >
              <option value="reg">登録順</option>
              <option value="rank">順位順</option>
              <option value="diff">変動順</option>
              <option value="name">名前順</option>
            </select>
          </div>
          {listKeywords.map((t) => {
            const l = latestBy.get(t.keyword);
            const badge = diffBadge(l);
            const sel = t.keyword === selected;
            const spark = (seriesBy.get(t.keyword) ?? []).map((p) => p.ranks[domainKey] ?? null);
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
                  <Sparkline ranks={spark} />
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

              {/* 自社ランクインURL（最新計測で自社が入っている全URL。複数あればカニバリの手がかり） */}
              {selectedLatest?.own_urls && selectedLatest.own_urls.length > 0 && (
                <div className="mb-4 border border-line bg-white px-4 py-2.5">
                  <p className="text-[11px] text-ink-faint mb-1">
                    自社ランクインURL（{selectedLatest.own_urls.length}本・最新計測）
                  </p>
                  {selectedLatest.own_urls.map((o) => (
                    <p
                      key={`${o.rank}-${o.url}`}
                      className="text-xs mt-0.5 flex items-baseline gap-2"
                    >
                      <span className="shrink-0 px-1.5 text-[10px] leading-4 border border-bronze/40 text-bronze-deep bg-white tabular-nums">
                        {o.rank}位
                      </span>
                      <a
                        href={cleanSerpUrl(o.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-bronze-deep underline underline-offset-2 break-all"
                      >
                        {cleanSerpUrl(o.url)}
                      </a>
                    </p>
                  ))}
                </div>
              )}

              {/* 凡例 */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-xs text-ink-soft">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-5 border-t-[3px]" style={{ borderColor: TARGET_COLOR }} />
                  {domain}（自社）
                </span>
                {chartComps.map((c, i) => (
                  <span key={c} className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block w-5 border-t-[3px] border-dashed"
                      style={{ borderColor: COMP_COLORS[i] }}
                    />
                    {c}
                  </span>
                ))}
              </div>

              {waiting ? (
                errKey === `${selected}|${compsKey}` ? (
                  <p className="text-sm text-red-600 py-8">
                    推移の取得に失敗しました。
                    <button
                      type="button"
                      onClick={() => setRetry((r) => r + 1)}
                      className="ml-3 px-3 py-1 text-xs border border-line bg-white text-bronze-deep hover:border-bronze"
                    >
                      再試行
                    </button>
                  </p>
                ) : (
                  <div className="h-[300px] flex items-center justify-center">
                    <p className="text-sm text-ink-faint animate-pulse">全期間の推移を読み込み中…</p>
                  </div>
                )
              ) : points ? (
                <>
                  <RankChart series={points} target={domainKey} competitors={chartComps} />

                  {/* 競合サマリ */}
                  {selectedCandidates.length > 0 && (
                    <div className="mt-5 overflow-x-auto max-h-72 overflow-y-auto border-b border-line">
                      <p className="text-xs font-semibold text-ink-soft mb-2">
                        競合サマリ（直近90日のSERPから自動抽出・チェックでチャートに重ねる／最大5社）
                      </p>
                      <table className="w-full text-xs border border-line">
                        <thead>
                          <tr className="text-ink-faint">
                            <th className="text-left px-3 py-2 border-b border-line font-semibold">ドメイン</th>
                            <th className="text-right px-3 py-2 border-b border-line font-semibold">最新</th>
                            <th className="text-right px-3 py-2 border-b border-line font-semibold">最高</th>
                            <th className="text-right px-3 py-2 border-b border-line font-semibold">平均</th>
                            <th className="text-right px-3 py-2 border-b border-line font-semibold">出現</th>
                            <th className="text-left px-3 py-2 border-b border-line font-semibold">最新URL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedCandidates.map((c) => {
                            const checked = comps.includes(c.domain);
                            const colorIdx = chartComps.indexOf(c.domain);
                            return (
                              <tr key={c.domain} className="odd:bg-white even:bg-paper">
                                <td className="px-3 py-1.5">
                                  <label className="inline-flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={!checked && comps.length >= MAX_COMPS}
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
                                <td className="px-3 py-1.5 min-w-[14rem]">
                                  {c.latest_url ? (
                                    <a
                                      href={cleanSerpUrl(c.latest_url)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[11px] text-bronze-deep hover:underline underline-offset-2 break-all"
                                    >
                                      {cleanSerpUrl(c.latest_url)}
                                    </a>
                                  ) : (
                                    <span className="text-ink-faint">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* SERP詳細（最新計測1回分の順位×URL×タイトル。オンデマンド取得） */}
                  <div className="mt-5">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                      <p className="text-xs font-semibold text-ink-soft">
                        SERP詳細
                        {selectedSerp?.checked_at && (
                          <span className="font-normal text-ink-faint">
                            （最新計測 {selectedSerp.checked_at} ・ {selectedSerp.total}件取得・自社ハイライト）
                          </span>
                        )}
                      </p>
                      <div
                        className="inline-flex border border-line"
                        role="group"
                        aria-label="SERP詳細の絞り込み"
                      >
                        {(
                          [
                            ["top20", "上位20"],
                            ["all", "すべて"],
                            ["own", "自社のみ"],
                          ] as const
                        ).map(([value, label], i) => (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={serpFilter === value}
                            onClick={() => setSerpFilter(value)}
                            className={`px-3 py-1 text-xs ${i > 0 ? "border-l border-line" : ""} ${
                              serpFilter === value
                                ? "bg-ink text-paper"
                                : "bg-white text-ink-soft hover:text-bronze-deep"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {serpErrKey === selected ? (
                      <p className="text-sm text-red-600 py-4">
                        SERP詳細の取得に失敗しました。
                        <button
                          type="button"
                          onClick={() => setSerpRetry((r) => r + 1)}
                          className="ml-3 px-3 py-1 text-xs border border-line bg-white text-bronze-deep hover:border-bronze"
                        >
                          再試行
                        </button>
                      </p>
                    ) : !selectedSerp ? (
                      <p className="text-xs text-ink-faint py-4 animate-pulse">
                        SERP詳細を読み込み中…
                      </p>
                    ) : selectedSerp.rows.length === 0 ? (
                      <p className="text-xs text-ink-faint py-4">まだ計測データがありません。</p>
                    ) : (
                      (() => {
                        const shown =
                          serpFilter === "top20"
                            ? selectedSerp.rows.filter((r) => r.rank <= 20)
                            : serpFilter === "own"
                              ? selectedSerp.rows.filter((r) => r.domain === domainKey)
                              : selectedSerp.rows;
                        if (shown.length === 0) {
                          return (
                            <p className="text-xs text-ink-faint py-4">
                              {serpFilter === "own"
                                ? `自社はこのSERP（${selectedSerp.total}件）に未検出です。`
                                : "該当する行がありません。"}
                            </p>
                          );
                        }
                        return (
                          <div className="border border-line max-h-96 overflow-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-ink-faint">
                                  <th className="sticky top-0 bg-white text-right px-3 py-2 border-b border-line font-semibold w-12">
                                    順位
                                  </th>
                                  <th className="sticky top-0 bg-white text-left px-3 py-2 border-b border-line font-semibold">
                                    タイトル / URL
                                  </th>
                                  <th className="sticky top-0 bg-white text-left px-3 py-2 border-b border-line font-semibold">
                                    ドメイン
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {shown.map((row) => {
                                  const own = row.domain === domainKey;
                                  return (
                                    <tr
                                      key={`${row.rank}-${row.url}`}
                                      className={own ? "bg-bronze/10" : "odd:bg-white even:bg-paper"}
                                    >
                                      <td
                                        className={`px-3 py-1.5 text-right tabular-nums align-top font-medium ${
                                          own ? "text-bronze-deep" : "text-ink-soft"
                                        }`}
                                      >
                                        {row.rank}
                                      </td>
                                      <td className="px-3 py-1.5">
                                        <a
                                          href={cleanSerpUrl(row.url)}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="block group"
                                        >
                                          <span className="block text-ink group-hover:text-bronze-deep">
                                            {row.title || row.url}
                                          </span>
                                          <span className="block text-[10px] text-ink-faint break-all">
                                            {cleanSerpUrl(row.url)}
                                          </span>
                                        </a>
                                      </td>
                                      <td
                                        className={`px-3 py-1.5 align-top whitespace-nowrap ${
                                          own
                                            ? "font-semibold text-bronze-deep"
                                            : "text-ink-soft"
                                        }`}
                                      >
                                        {own ? `${domainKey}（自社）` : row.domain}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()
                    )}
                  </div>

                  {/* 計測履歴 */}
                  {points.length > 0 && (
                    <details className="mt-4 border border-line">
                      <summary className="px-4 py-2.5 text-xs text-ink-soft cursor-pointer select-none">
                        計測履歴（{points.length}回）を表で見る
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
                            {[...points].reverse().map((p) => (
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
      )}
    </div>
  );
}
