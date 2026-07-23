"use client";

import { useMemo, useState } from "react";
import type {
  RotationProgress,
  LatestInspection,
  QuerySummary,
  QueryPageRow,
  OpportunityQuery,
  CtrGapQuery,
  MovingQuery,
  CvQueryRow,
} from "@/lib/seo-monitor/bigquery";
import type { CoverageSnapshotRow } from "@/lib/seo-monitor/types";

export type GscData = {
  coverage: CoverageSnapshotRow[];
  rotation: RotationProgress;
  inspections: LatestInspection[];
  stale: LatestInspection[];
  queries: QuerySummary[];
  queryPages: QueryPageRow[];
  opportunity: OpportunityQuery[];
  ctrGap: CtrGapQuery[];
  moving: MovingQuery[];
  cvQueries: CvQueryRow[];
};

const TABS = [
  { key: "summary", label: "サマリー" },
  { key: "coverage", label: "カバレッジ" },
  { key: "inspection", label: "URL検査" },
  { key: "queries", label: "クエリ分析" },
  { key: "insights", label: "改善分析" },
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
  days,
  data,
}: {
  site: string;
  staleDays: number;
  days: number;
  data: GscData;
}) {
  const [tab, setTab] = useState<TabKey>("summary");
  // クエリ絞り込みは「入力値」と「適用値」を分ける。クエリ数が多いサイトでは
  // 1キーごとの全件フィルタ＋再描画が重いため、ボタン/Enterで明示的に適用する
  const [kwInput, setKwInput] = useState("");
  const [kw, setKw] = useState("");
  const [copiedQuery, setCopiedQuery] = useState<string | null>(null);

  const { coverage, rotation, inspections, stale, queries, queryPages, opportunity, ctrGap, moving, cvQueries } = data;

  // 順位変動: delta > 0 が上昇（順位の数値が小さくなった）
  const risers = moving.filter((m) => m.delta > 0);
  const fallers = moving.filter((m) => m.delta < 0).reverse();

  // CV貢献クエリはページ単位でグルーピングして表示（取得時点でCV降順に整列済み）
  const cvPages = useMemo(() => {
    const map = new Map<string, CvQueryRow[]>();
    for (const r of cvQueries) {
      const arr = map.get(r.page) ?? [];
      arr.push(r);
      map.set(r.page, arr);
    }
    return [...map.entries()];
  }, [cvQueries]);

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
              <h2 className="text-sm font-semibold">クエリ別（直近{days}日）</h2>
              <input
                type="text"
                value={kwInput}
                onChange={(e) => setKwInput(e.target.value)}
                onKeyDown={(e) => {
                  // IMEの変換確定Enterでは適用しない
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) setKw(kwInput.trim());
                }}
                placeholder="キーワードで絞り込み"
                className="border border-line bg-white px-2 py-1 text-xs w-48 focus-visible:outline-2 focus-visible:outline-bronze-deep"
              />
              <button
                type="button"
                onClick={() => setKw(kwInput.trim())}
                className="px-3 py-1 text-xs font-semibold bg-bronze-deep text-white hover:opacity-90 transition-opacity"
              >
                絞り込み
              </button>
              {kw && (
                <button
                  type="button"
                  onClick={() => {
                    setKwInput("");
                    setKw("");
                  }}
                  className="text-xs text-bronze-deep underline hover:no-underline"
                >
                  クリア
                </button>
              )}
              <span className="text-[11px] text-ink-faint">
                {nf(filteredQueries.length)} / {nf(queries.length)} 件
              </span>
            </div>
            {queries.length === 0 ? (
              <p className="text-sm text-ink-soft">
                この期間のクエリデータがありません（GSCデータは約3日遅れのため、取得開始から数日かかります）。
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

      {tab === "insights" && (
        <div className="space-y-10">
          <div>
            <h2 className="text-sm font-semibold mb-1">改善チャンス（4〜20位 × 表示回数上位）</h2>
            <p className="text-[11px] text-ink-faint mb-3">
              表示回数が多いのに1ページ目上位に届いていないクエリ。順位を数個上げるだけでクリックが大きく伸びる候補です（直近{days}日）。
            </p>
            {opportunity.length === 0 ? (
              <p className="text-sm text-ink-soft">該当するクエリがまだありません。</p>
            ) : (
              <div className="overflow-x-auto border border-line bg-white">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-paper text-ink-soft">
                      <th className="px-3 py-2 text-left">クエリ</th>
                      <th className="px-3 py-2 text-right">表示回数</th>
                      <th className="px-3 py-2 text-right">クリック</th>
                      <th className="px-3 py-2 text-right">CTR</th>
                      <th className="px-3 py-2 text-right">順位</th>
                      <th className="px-3 py-2 text-left">主な掲載ページ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opportunity.map((q) => (
                      <tr key={q.query} className="border-t border-line hover:bg-paper/50">
                        <td className="px-3 py-2">{q.query}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{nf(q.impressions)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{nf(q.clicks)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{pct(q.ctr)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{q.position.toFixed(1)}</td>
                        <td className="px-3 py-2 break-all text-ink-soft">{q.top_page}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h2 className="text-sm font-semibold mb-1">CTR改善候補（同順位帯より低CTR）</h2>
            <p className="text-[11px] text-ink-faint mb-3">
              同じ順位帯のサイト内中央値CTRと比べてクリック率が半分以下のクエリ。タイトル・ディスクリプション改善の優先度付けに。
              「取り逃し」は中央値CTRとの差 × 表示回数によるクリック数の推定です。
            </p>
            {ctrGap.length === 0 ? (
              <p className="text-sm text-ink-soft">該当するクエリがまだありません。</p>
            ) : (
              <div className="overflow-x-auto border border-line bg-white">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-paper text-ink-soft">
                      <th className="px-3 py-2 text-left">クエリ</th>
                      <th className="px-3 py-2 text-right">順位</th>
                      <th className="px-3 py-2 text-right">CTR</th>
                      <th className="px-3 py-2 text-right">同順位帯の中央値</th>
                      <th className="px-3 py-2 text-right">取り逃し（推定）</th>
                      <th className="px-3 py-2 text-right">表示回数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ctrGap.map((q) => (
                      <tr key={q.query} className="border-t border-line hover:bg-paper/50">
                        <td className="px-3 py-2">{q.query}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{q.position.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{pct(q.ctr)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{pct(q.median_ctr)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-bronze-deep">
                          {nf(q.lost_clicks)}クリック
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{nf(q.impressions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h2 className="text-sm font-semibold mb-1">順位変動（直近7日 vs 前7日）</h2>
            <p className="text-[11px] text-ink-faint mb-3">
              加重平均順位が2以上動いたクエリ。伸びている芽と、対処すべき下落を早期に掴むための一覧です。
            </p>
            {moving.length === 0 ? (
              <p className="text-sm text-ink-soft">大きく変動したクエリはありません。</p>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {[
                  { label: "上昇", rows: risers, sign: "↑", color: "text-emerald-700" },
                  { label: "下降", rows: fallers, sign: "↓", color: "text-red-700" },
                ].map((g) => (
                  <div key={g.label} className="overflow-x-auto border border-line bg-white">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-paper text-ink-soft">
                          <th className="px-3 py-2 text-left">{g.label}クエリ</th>
                          <th className="px-3 py-2 text-right">前7日</th>
                          <th className="px-3 py-2 text-right">直近7日</th>
                          <th className="px-3 py-2 text-right">変動</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.length === 0 ? (
                          <tr className="border-t border-line">
                            <td className="px-3 py-2 text-ink-faint" colSpan={4}>該当なし</td>
                          </tr>
                        ) : (
                          g.rows.slice(0, 20).map((m) => (
                            <tr key={m.query} className="border-t border-line hover:bg-paper/50">
                              <td className="px-3 py-2">{m.query}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{m.pos_prev.toFixed(1)}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{m.pos_cur.toFixed(1)}</td>
                              <td className={`px-3 py-2 text-right tabular-nums font-semibold ${g.color}`}>
                                {g.sign}{Math.abs(m.delta).toFixed(1)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-sm font-semibold mb-1">CV貢献クエリ（GA4 × サーチコンソール）</h2>
            <p className="text-[11px] text-ink-faint mb-3">
              GA4でCV（キーイベント）が発生しているランディングページに、どの検索クエリから流入しているかの突き合わせ（直近{days}日）。
              GSCとGA4は計測方式が異なるため対応付けは推定です。GSC/GA4の通常画面では見られないクロス集計です。
            </p>
            {cvPages.length === 0 ? (
              <p className="text-sm text-ink-soft">CVが発生したページへの検索流入がまだありません。</p>
            ) : (
              <div className="overflow-x-auto border border-line bg-white">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-paper text-ink-soft">
                      <th className="px-3 py-2 text-left">ページ</th>
                      <th className="px-3 py-2 text-right">CV</th>
                      <th className="px-3 py-2 text-right">セッション</th>
                      <th className="px-3 py-2 text-left">流入クエリ</th>
                      <th className="px-3 py-2 text-right">クリック</th>
                      <th className="px-3 py-2 text-right">順位</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cvPages.map(([page, rows]) =>
                      rows.map((r, i) => (
                        <tr key={`${page}-${r.query}`} className="border-t border-line">
                          {i === 0 && (
                            <>
                              <td className="px-3 py-2 break-all align-top" rowSpan={rows.length}>{page}</td>
                              <td className="px-3 py-2 text-right tabular-nums font-semibold align-top" rowSpan={rows.length}>
                                {nf(r.cv)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums align-top" rowSpan={rows.length}>
                                {nf(r.sessions)}
                              </td>
                            </>
                          )}
                          <td className="px-3 py-2">{r.query}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{nf(r.clicks)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.position.toFixed(1)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
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
