"use client";

import { useState } from "react";
import type {
  Ga4Summary,
  TrafficPoint,
  ChannelStat,
  SourceMediumStat,
  PageStat,
} from "@/lib/seo-monitor/bigquery";

export type Ga4Data = {
  summary: Ga4Summary;
  series: TrafficPoint[];
  channels: ChannelStat[];
  sourceMedium: SourceMediumStat[];
  pages: PageStat[];
};

const TABS = [
  { key: "summary", label: "サマリー" },
  { key: "channels", label: "チャネル詳細" },
  { key: "pages", label: "URL別" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const nf = (n: number) => Math.round(n).toLocaleString("ja-JP");
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
// 秒 → m:ss
function mmss(secs: number): string {
  const s = Math.round(secs);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function delta(cur: number, prev: number): { text: string; up: boolean } | null {
  if (prev <= 0) return null;
  const d = (cur - prev) / prev;
  return { text: `${d >= 0 ? "+" : ""}${(d * 100).toFixed(1)}%`, up: d >= 0 };
}

export default function Ga4Workspace({ data, days }: { data: Ga4Data; days: number }) {
  const [tab, setTab] = useState<TabKey>("summary");
  const { summary, series, channels, sourceMedium, pages } = data;

  const hasData = summary.sessions > 0 || series.length > 0;
  const dSessions = delta(summary.sessions, summary.prev_sessions);
  const dOrganic = delta(summary.organic_sessions, summary.prev_organic_sessions);
  const dKeyEvents = delta(summary.key_events, summary.prev_key_events);
  const organicShare = summary.sessions > 0 ? summary.organic_sessions / summary.sessions : 0;
  const maxChannel = Math.max(1, ...channels.map((c) => c.sessions));

  if (!hasData) {
    return (
      <div className="border border-line bg-white p-8 text-sm text-ink-soft leading-relaxed">
        <p className="font-semibold text-ink mb-2">まだGA4データがありません</p>
        <p>
          毎朝の自動取得（2日前の日次データ）が蓄積されると、ここに流入概況・チャネル・URL別が表示されます。
          サービスアカウントが GA4 プロパティの閲覧者に追加されているか確認してください。
        </p>
      </div>
    );
  }

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
            <StatCard label="セッション" value={nf(summary.sessions)} delta={dSessions} />
            <StatCard
              label="自然検索セッション"
              value={nf(summary.organic_sessions)}
              delta={dOrganic}
              sub={`構成比 ${pct(organicShare)}`}
            />
            <StatCard label="アクティブユーザー" value={nf(summary.active_users)} />
            <StatCard label="キーイベント" value={nf(summary.key_events)} delta={dKeyEvents} />
            <StatCard label="表示回数（PV）" value={nf(summary.views)} />
            <StatCard label="平均エンゲージメント時間" value={mmss(summary.avg_engagement_secs)} />
            <StatCard label="直帰率" value={pct(summary.bounce_rate)} />
          </div>

          {series.length >= 2 && (
            <div className="border border-line bg-white p-6">
              <h2 className="text-sm font-semibold mb-1">日次セッション — 全体 vs 自然検索</h2>
              <TrafficChart series={series} />
              <div className="mt-2 flex gap-5 text-[11px] text-ink-soft">
                <span>
                  <i className="inline-block w-3.5 h-[3px] align-middle mr-1.5" style={{ background: "#86672f" }} />
                  自然検索
                </span>
                <span>
                  <i className="inline-block w-3.5 h-[3px] align-middle mr-1.5" style={{ background: "#9ca3af" }} />
                  全体
                </span>
                <span className="ml-auto">直近{days}日</span>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "channels" && (
        <div className="space-y-8">
          <div>
            <h2 className="text-sm font-semibold mb-3">チャネル別セッション</h2>
            <div className="border border-line bg-white p-6 space-y-2">
              {channels.map((c) => (
                <div key={c.channel} className="grid grid-cols-[130px_1fr_90px_70px] items-center gap-3">
                  <span className="text-xs">{c.channel}</span>
                  <div className="h-4 bg-paper border border-line overflow-hidden">
                    <div
                      className="h-full bg-bronze"
                      style={{ width: `${(c.sessions / maxChannel) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-right tabular-nums">{nf(c.sessions)}</span>
                  <span className="text-[11px] text-right tabular-nums text-ink-soft">
                    CV {nf(c.key_events)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold mb-3">ソース / メディア別</h2>
            <div className="overflow-x-auto border border-line bg-white">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-paper text-ink-soft">
                    <th className="px-3 py-2 text-left">ソース / メディア</th>
                    <th className="px-3 py-2 text-right">セッション</th>
                    <th className="px-3 py-2 text-right">UU</th>
                    <th className="px-3 py-2 text-right">キーイベント</th>
                    <th className="px-3 py-2 text-right">CVR</th>
                    <th className="px-3 py-2 text-right">平均滞在</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceMedium.map((r) => (
                    <tr key={`${r.source}/${r.medium}`} className="border-t border-line hover:bg-paper/50">
                      <td className="px-3 py-2 font-mono">{r.source} / {r.medium}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{nf(r.sessions)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{nf(r.active_users)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{nf(r.key_events)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.sessions > 0 ? pct(r.key_events / r.sessions) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{mmss(r.avg_engagement_secs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "pages" && (
        <div>
          <h2 className="text-sm font-semibold mb-3">ランディングページ別</h2>
          <div className="overflow-x-auto border border-line bg-white">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-paper text-ink-soft">
                  <th className="px-3 py-2 text-left">URL</th>
                  <th className="px-3 py-2 text-right">PV</th>
                  <th className="px-3 py-2 text-right">セッション</th>
                  <th className="px-3 py-2 text-right">UU</th>
                  <th className="px-3 py-2 text-right">キーイベント</th>
                  <th className="px-3 py-2 text-right">CVR</th>
                  <th className="px-3 py-2 text-right">平均滞在</th>
                  <th className="px-3 py-2 text-right">直帰率</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((p) => (
                  <tr key={p.page} className="border-t border-line hover:bg-paper/50">
                    <td className="px-3 py-2 break-all">{p.page}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{nf(p.views)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{nf(p.sessions)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{nf(p.active_users)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{nf(p.key_events)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pct(p.cvr)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{mmss(p.avg_engagement_secs)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {p.bounce_rate >= 0.5 ? (
                        <span className="text-red-700 font-semibold">{pct(p.bounce_rate)}</span>
                      ) : (
                        pct(p.bounce_rate)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
  delta,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: { text: string; up: boolean } | null;
}) {
  return (
    <div className="border border-line bg-white p-5">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] flex gap-2">
        {delta && (
          <span className={`font-semibold ${delta.up ? "text-emerald-700" : "text-red-700"}`}>
            {delta.up ? "▲" : "▼"} {delta.text}
          </span>
        )}
        {sub && <span className="text-ink-faint">{sub}</span>}
      </p>
    </div>
  );
}

// 手書きインラインSVGの2系列ライン（RankChart と同じ流儀・外部ライブラリ不使用）
function TrafficChart({ series }: { series: TrafficPoint[] }) {
  const W = 720;
  const H = 220;
  const PL = 48;
  const PR = 10;
  const PT = 12;
  const PB = 24;
  const iw = W - PL - PR;
  const ih = H - PT - PB;
  const max = Math.max(1, ...series.map((p) => p.sessions));
  const ymax = Math.ceil(max / 100) * 100;
  const x = (i: number) => PL + (iw * i) / Math.max(1, series.length - 1);
  const y = (v: number) => PT + ih * (1 - v / ymax);
  const line = (pick: (p: TrafficPoint) => number) =>
    series.map((p, i) => `${x(i).toFixed(1)},${y(pick(p)).toFixed(1)}`).join(" ");
  const gridStep = ymax / 4;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="日次セッション推移">
      {[0, 1, 2, 3, 4].map((g) => {
        const gy = y(g * gridStep);
        return (
          <g key={g}>
            <line x1={PL} y1={gy} x2={W - PR} y2={gy} stroke="#e2ded2" strokeWidth={1} strokeDasharray={g === 0 ? undefined : "3 3"} />
            <text x={PL - 6} y={gy + 3.5} textAnchor="end" fontSize={10} fill="#9b968a">
              {(g * gridStep).toLocaleString("ja-JP")}
            </text>
          </g>
        );
      })}
      {series.map((p, i) =>
        i % 7 === 0 ? (
          <text key={p.date} x={x(i)} y={H - 6} textAnchor="middle" fontSize={10} fill="#9b968a">
            {p.date.slice(5).replace("-", "/")}
          </text>
        ) : null
      )}
      <polyline points={line((p) => p.sessions)} fill="none" stroke="#9ca3af" strokeWidth={2} strokeLinejoin="round" />
      <polyline points={line((p) => p.organic_sessions)} fill="none" stroke="#86672f" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}
