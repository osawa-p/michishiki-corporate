"use client";

import { useMemo, useState } from "react";
import type {
  RotationProgress,
  LatestInspection,
  QuerySummary,
  QueryPageRow,
} from "@/lib/seo-monitor/bigquery";
import type { CoverageSnapshotRow } from "@/lib/seo-monitor/types";

export type GscData = {
  coverage: CoverageSnapshotRow[];
  rotation: RotationProgress;
  inspections: LatestInspection[];
  stale: LatestInspection[];
  queries: QuerySummary[];
  queryPages: QueryPageRow[];
};

const TABS = [
  { key: "summary", label: "サマリー" },
  { key: "coverage", label: "カバレッジ" },
  { key: "inspection", label: "URL検査" },
  { key: "queries", label: "クエリ分析" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const nf = (n: number) => n.toLocaleString("ja-JP");
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const day = (s: string | null) => (s ? s.slice(0, 10) : "—");

function verdictChip(v: string | null) {
  if (v === "PASS")
    return <span className="inline-block px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700">登録済み</span>;
  if (v === "FAIL")
    return <span className="inline-block px-2 py-0.5 text-[11px] font-semibold bg-red-50 text-red-700">エラー</span>;
  if (v == null) return <span className="text-ink-faint text-[11px]">—</span>;
  return <span className="inline-block px-2 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-700">未登録</span>;
}

// カニバリ調査用プロンプト（クエリ×URLの実データを差し込む）
function buildCannibalPrompt(site: string, query: string, pages: QueryPageRow[]): string {
  const lines = pages
    .map((p) => `- ${p.page}（平均 ${p.position.toFixed(1)}位・クリック${nf(p.clicks)}・表示${nf(p.impressions)}）`)
    .join("\n");
  return `あなたはSEOコンサルタントです。以下のクエリで複数URLが検索結果に出ており、カニバリゼーションの疑いがあります。

サイト: ${site}
クエリ: 「${query}」
競合しているURL:
${lines}

確認してほしいこと:
1. 両ページの検索意図の重なりを分析
2. 主役に据えるべきURLの判断
3. もう一方の扱い（リライトで意図をずらす / canonical / 統合）の提案

出力: 推奨構成と、必要な作業の箇条書き`;
}

export default function GscWorkspace({
  site,
  staleDays,
  data,
}: {
  site: string;
  staleDays: number;
  data: GscData;
}) {
  const [tab, setTab] = useState<TabKey>("summary");
  const [kw, setKw] = useState("");
  const [copiedQuery, setCopiedQuery] = useState<string | null>(null);

  const { coverage, rotation, inspections, stale, queries, queryPages } = data;

  const cannibalQueries = useMemo(() => {
    const map = new Map<string, QueryPageRow[]>();
    for (const r of queryPages) {
      const arr = map.get(r.query) ?? [];
      arr.push(r);
      map.set(r.query, arr);
    }
    return [...map.entries()].filter(([, pages]) => pages.length >= 2);
  }, [queryPages]);

  const filteredQueries = useMemo(() => {
    const needle = kw.trim().toLowerCase();
    if (!needle) return queries;
    return queries.filter((q) => q.query.toLowerCase().includes(needle));
  }, [queries, kw]);

  async function copyPrompt(query: string, pages: QueryPageRow[]) {
    try {
      await navigator.clipboard.writeText(buildCannibalPrompt(site, query, pages));
    } finally {
      setCopiedQuery(query);
      setTimeout(() => setCopiedQuery(null), 1500);
    }
  }

  const inspectedPct = rotation.total > 0 ? Math.round((rotation.inspected / rotation.total) * 100) : 0;

  return (
    <div>
      <div className="flex gap-1 border-b border-line mb-8 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap px-4 py-2.5 text-sm border-b-2 transition-colors ${
              tab === t.key
                ? "border-bronze text-bronze-deep font-semibold"
                : "border-transparent text-ink-soft hover:text-bronze-deep"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "summary" && (
        <div className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="インデックス対象URL" value={nf(rotation.total)} />
            <StatCard label="検査済みURL" value={nf(rotation.inspected)} sub={`対象の${inspectedPct}%`} />
            <StatCard label="検査で対象外化" value={nf(rotation.excluded)} sub="noindex・404・canonical等" />
            <StatCard
              label={`${staleDays}日超 未クロール`}
              value={nf(stale.length)}
              tone={stale.length > 0 ? "warn" : undefined}
            />
          </div>
          <div className="border border-line bg-white p-6 text-sm text-ink-soft leading-relaxed">
            <p className="font-semibold text-ink mb-2">このページの読み方</p>
            <p>
              URL台帳は sitemap から毎朝更新され、インデックス対象URLだけを検査ローテーションが巡回します。
              カバレッジ集計（理由別内訳）はスクレイパー連携後に表示されます。
              クエリの動きは「クエリ分析」タブ、検査の詳細は「URL検査」タブへ。
            </p>
          </div>
        </div>
      )}

      {tab === "coverage" && (
        <div className="space-y-4">
          {coverage.length === 0 ? (
            <div className="border border-line bg-white p-8 text-sm text-ink-soft leading-relaxed">
              <p className="font-semibold text-ink mb-2">カバレッジ集計は未取得です</p>
              <p>
                理由別内訳（クロール済み-未登録 など）はカバレッジレポートのスクレイパー連携（Phase 2）で
                取得します。それまでの間、個別URLの状態は「URL検査」タブで確認できます。
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-line bg-white">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-paper text-ink-soft">
                    <th className="px-3 py-2 text-left">理由</th>
                    <th className="px-3 py-2 text-left">分類</th>
                    <th className="px-3 py-2 text-right">件数</th>
                    <th className="px-3 py-2 text-right">取得日</th>
                  </tr>
                </thead>
                <tbody>
                  {coverage.map((c, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="px-3 py-2">{c.reason}</td>
                      <td className="px-3 py-2">{c.bucket}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{nf(c.count)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.snapshot_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "inspection" && (
        <div className="space-y-8">
          <div className="border border-line bg-white p-6">
            <div className="flex items-center gap-4">
              <span className="text-2xl font-semibold tabular-nums">{inspectedPct}%</span>
              <div className="flex-1 h-3 bg-paper border border-line overflow-hidden">
                <div className="h-full bg-bronze" style={{ width: `${inspectedPct}%` }} />
              </div>
            </div>
            <p className="mt-3 text-xs text-ink-soft">
              検査済み {nf(rotation.inspected)} / {nf(rotation.total)} URL ／ 対象外化{" "}
              {nf(rotation.excluded)} 件 ／ 検査対象はインデックス対象URLのみ（noindex・リダイレクト・404・canonical別URLは自動で対象外）
            </p>
          </div>

          {stale.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold mb-3">
                長期未クロール（{staleDays}日以上）
                <span className="ml-2 inline-block px-2 py-0.5 text-[11px] font-semibold bg-red-50 text-red-700">
                  {nf(stale.length)}件
                </span>
              </h2>
              <InspectionTable rows={stale} highlightStale={staleDays} />
            </div>
          )}

          <div>
            <h2 className="text-sm font-semibold mb-3">最近の検査結果</h2>
            {inspections.length === 0 ? (
              <p className="text-sm text-ink-soft">
                まだ検査結果がありません。毎朝の自動実行でローテーションが進みます。
              </p>
            ) : (
              <InspectionTable rows={inspections} highlightStale={staleDays} />
            )}
          </div>
        </div>
      )}

      {tab === "queries" && (
        <div className="space-y-8">
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <h2 className="text-sm font-semibold">クエリ別（直近28日）</h2>
              <input
                type="text"
                value={kw}
                onChange={(e) => setKw(e.target.value)}
                placeholder="キーワードで絞り込み"
                className="border border-line bg-white px-2 py-1 text-xs w-48 focus-visible:outline-2 focus-visible:outline-bronze-deep"
              />
              <span className="text-[11px] text-ink-faint">
                {nf(filteredQueries.length)} / {nf(queries.length)} 件
              </span>
            </div>
            {queries.length === 0 ? (
              <p className="text-sm text-ink-soft">
                まだクエリデータがありません（GSCデータは約3日遅れのため、取得開始から数日かかります）。
              </p>
            ) : (
              <div className="overflow-x-auto border border-line bg-white">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-paper text-ink-soft">
                      <th className="px-3 py-2 text-left">クエリ</th>
                      <th className="px-3 py-2 text-right">表示回数</th>
                      <th className="px-3 py-2 text-right">クリック</th>
                      <th className="px-3 py-2 text-right">CTR</th>
                      <th className="px-3 py-2 text-right">平均順位</th>
                      <th className="px-3 py-2 text-left">着地URL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredQueries.slice(0, 100).map((q) => (
                      <tr key={q.query} className="border-t border-line hover:bg-paper/50">
                        <td className="px-3 py-2">{q.query}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{nf(q.impressions)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{nf(q.clicks)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{pct(q.ctr)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{q.position.toFixed(1)}</td>
                        <td className="px-3 py-2">
                          {q.pages >= 2 ? (
                            <span className="inline-block px-2 py-0.5 text-[11px] font-semibold bg-orange-50 text-orange-700">
                              {q.pages}URL（カニバリ疑い）
                            </span>
                          ) : (
                            <span className="text-ink-faint">1URL</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {cannibalQueries.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold mb-3">カニバリ疑いのクエリ × URL</h2>
              <div className="overflow-x-auto border border-line bg-white">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-paper text-ink-soft">
                      <th className="px-3 py-2 text-left">クエリ</th>
                      <th className="px-3 py-2 text-left">着地URL</th>
                      <th className="px-3 py-2 text-right">表示回数</th>
                      <th className="px-3 py-2 text-right">クリック</th>
                      <th className="px-3 py-2 text-right">平均順位</th>
                      <th className="px-3 py-2 text-left">調査</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cannibalQueries.map(([query, pages]) =>
                      pages.map((p, i) => (
                        <tr key={`${query}-${p.page}`} className="border-t border-line">
                          {i === 0 && (
                            <td className="px-3 py-2 align-top" rowSpan={pages.length}>
                              {query}
                            </td>
                          )}
                          <td className="px-3 py-2 break-all">{p.page}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{nf(p.impressions)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{nf(p.clicks)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{p.position.toFixed(1)}</td>
                          {i === 0 && (
                            <td className="px-3 py-2 align-top" rowSpan={pages.length}>
                              <button
                                type="button"
                                onClick={() => copyPrompt(query, pages)}
                                className="text-bronze-deep underline hover:no-underline"
                              >
                                {copiedQuery === query ? "コピーしました ✓" : "調査プロンプトをコピー"}
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-ink-faint">
                「調査プロンプトをコピー」は対象クエリ・URL・順位を差し込んだ調査依頼文をクリップボードへコピーします。Claude等に貼って使ってください。
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "warn";
}) {
  return (
    <div className="border border-line bg-white p-5">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "warn" ? "text-red-700" : ""}`}>
        {value}
      </p>
      {sub && <p className="mt-1 text-[11px] text-ink-faint">{sub}</p>}
    </div>
  );
}

function InspectionTable({
  rows,
  highlightStale,
}: {
  rows: LatestInspection[];
  highlightStale: number;
}) {
  return (
    <div className="overflow-x-auto border border-line bg-white">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-paper text-ink-soft">
            <th className="px-3 py-2 text-left">URL</th>
            <th className="px-3 py-2 text-left">判定</th>
            <th className="px-3 py-2 text-left">カバレッジ</th>
            <th className="px-3 py-2 text-right">最終クロール</th>
            <th className="px-3 py-2 text-right">経過日数</th>
            <th className="px-3 py-2 text-left">canonical</th>
            <th className="px-3 py-2 text-right">検査日</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.url} className="border-t border-line hover:bg-paper/50">
              <td className="px-3 py-2 break-all">{r.url}</td>
              <td className="px-3 py-2">{verdictChip(r.verdict)}</td>
              <td className="px-3 py-2">{r.coverage_state ?? "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{day(r.last_crawl_time)}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.days_since_crawl == null ? (
                  "—"
                ) : r.days_since_crawl >= highlightStale ? (
                  <span className="px-1.5 py-0.5 font-semibold bg-red-50 text-red-700">
                    {r.days_since_crawl}日
                  </span>
                ) : (
                  `${r.days_since_crawl}日`
                )}
              </td>
              <td className="px-3 py-2">
                {r.canonical_match === false ? (
                  <span className="text-orange-700 font-semibold">✕ 別URL</span>
                ) : r.canonical_match === true ? (
                  "✓"
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{day(r.inspected_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
