"use client";

import { Fragment, useState } from "react";
import type { UserSummary, CvPath, CvStats, JourneySession } from "@/lib/seo-monitor/bigquery";

// GA4ページ「ユーザー単位」タブ（G-6 ユーザー一覧＋経路ビュー / G-7 王道経路）。
// データ源は GA4 の BigQuery エクスポート（有効化済みプロパティのみ）。

const nf = (n: number) => Math.round(n).toLocaleString("ja-JP");
function mmss(secs: number): string {
  const s = Math.round(secs);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function UserJourneyPanel({
  site,
  users,
  cvPaths,
  cvStats,
}: {
  site: string;
  users: UserSummary[];
  cvPaths: CvPath[];
  cvStats: CvStats;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [journey, setJourney] = useState<JourneySession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openJourney(userKey: string) {
    if (selected === userKey) {
      setSelected(null);
      return;
    }
    setSelected(userKey);
    setJourney([]);
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/rank-tracker/seo/user-journey?site=${encodeURIComponent(site)}&user=${encodeURIComponent(userKey)}`
      );
      const data = await res.json();
      if (!res.ok || !data.ok) setError(data.error ?? "取得に失敗しました。");
      else setJourney(data.sessions);
    } catch {
      setError("取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  if (users.length === 0) {
    return (
      <div className="border border-line bg-white p-8 text-sm text-ink-soft leading-relaxed">
        <p className="font-semibold text-ink mb-2">まだユーザー単位のデータがありません</p>
        <p>
          このレポートはGA4の<b>BigQueryエクスポート</b>が元データです。エクスポートを有効化した
          プロパティのみ、翌日以降の毎朝の自動集計でデータが貯まります（過去分はエクスポート開始日以降のみ）。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* G-7 王道経路 */}
      <div>
        <h2 className="text-sm font-semibold mb-3">王道経路 — CVに至るチャネル遷移パターン</h2>
        <div className="grid gap-4 sm:grid-cols-3 mb-4">
          <div className="border border-line bg-white p-5">
            <p className="text-xs text-ink-soft">CVユーザー数</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{nf(cvStats.cv_users)}</p>
          </div>
          <div className="border border-line bg-white p-5">
            <p className="text-xs text-ink-soft">CVユーザーの平均セッション数</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{cvStats.avg_sessions.toFixed(1)}回</p>
          </div>
          <div className="border border-line bg-white p-5">
            <p className="text-xs text-ink-soft">初回接触 → CV の平均日数</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{cvStats.avg_days_to_cv.toFixed(1)}日</p>
          </div>
        </div>
        {cvPaths.length === 0 ? (
          <p className="text-sm text-ink-soft">
            集計期間内にCV（キーイベント）に至ったユーザーがまだいません。
          </p>
        ) : (
          <div className="space-y-2">
            {cvPaths.map((p, i) => (
              <div key={p.pattern} className="border border-line bg-white px-4 py-3 flex flex-wrap items-center gap-3">
                <span className="flex-none w-6 h-6 rounded-full bg-paper border border-line text-[11px] font-bold flex items-center justify-center text-bronze-deep">
                  {i + 1}
                </span>
                <span className="text-xs font-mono break-all">{p.pattern.replaceAll("→", " → ")}</span>
                <span className="ml-auto text-[11px] text-ink-soft tabular-nums whitespace-nowrap">
                  {nf(p.users)}人 ／ 平均 {p.avg_sessions.toFixed(1)} セッション
                </span>
              </div>
            ))}
            <p className="text-[11px] text-ink-faint">
              ✓ はそのセッションでキーイベント（CV）が発生したことを示します。
            </p>
          </div>
        )}
      </div>

      {/* G-6 ユーザー一覧 */}
      <div>
        <h2 className="text-sm font-semibold mb-3">
          ユーザー一覧
          <span className="ml-2 text-[11px] font-normal text-ink-faint">
            CV・セッション数の多い順・行をクリックで経路を表示
          </span>
        </h2>
        <div className="overflow-x-auto border border-line bg-white">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-paper text-ink-soft">
                <th className="px-3 py-2 text-left">ユーザー</th>
                <th className="px-3 py-2 text-left">識別</th>
                <th className="px-3 py-2 text-left">初回チャネル</th>
                <th className="px-3 py-2 text-right">セッション</th>
                <th className="px-3 py-2 text-right">PV</th>
                <th className="px-3 py-2 text-right">CV</th>
                <th className="px-3 py-2 text-right">平均滞在</th>
                <th className="px-3 py-2 text-right">最終訪問</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <Fragment key={u.user_key}>
                  <tr
                    onClick={() => openJourney(u.user_key)}
                    className={`border-t border-line cursor-pointer hover:bg-paper/50 ${
                      selected === u.user_key ? "bg-paper/70" : ""
                    }`}
                  >
                    <td className="px-3 py-2 font-mono">{u.user_key.slice(0, 16)}…</td>
                    <td className="px-3 py-2">
                      {u.is_identified ? (
                        <span className="inline-block px-2 py-0.5 text-[11px] font-semibold bg-blue-50 text-blue-700">
                          user_id
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 text-[11px] font-semibold bg-gray-100 text-gray-500">
                          匿名
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{u.first_channel}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{nf(u.sessions)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{nf(u.pages)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {u.key_events > 0 ? (
                        <span className="font-semibold text-emerald-700">{nf(u.key_events)}</span>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{mmss(u.avg_engagement_secs)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{u.last_date.slice(5)}</td>
                  </tr>
                  {selected === u.user_key && (
                    <tr className="border-t border-line">
                      <td colSpan={8} className="px-4 py-4 bg-paper/40">
                        {loading ? (
                          <p className="text-xs text-ink-soft">経路を読み込み中…</p>
                        ) : error ? (
                          <p className="text-xs text-red-700">{error}</p>
                        ) : (
                          <div className="space-y-2">
                            {journey.map((s, i) => (
                              <div
                                key={i}
                                className={`border bg-white px-4 py-3 ${
                                  s.key_events > 0 ? "border-emerald-600" : "border-line"
                                }`}
                              >
                                <div className="flex flex-wrap items-baseline gap-3 text-xs">
                                  <span className="font-bold text-bronze-deep">セッション {i + 1}</span>
                                  <span className="font-semibold tabular-nums">
                                    {s.date} {s.start_time}
                                  </span>
                                  <span className="inline-block px-2 py-0.5 text-[11px] border border-dashed border-line text-ink-soft">
                                    {s.channel}
                                    {s.source ? `（${s.source}）` : ""}
                                  </span>
                                  <span className="text-ink-faint tabular-nums">
                                    滞在 {mmss(s.engagement_secs)} ／ {nf(s.page_count)}ページ
                                  </span>
                                </div>
                                {s.key_events > 0 && (
                                  <p className="mt-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 inline-block px-2 py-0.5">
                                    CV発生 ✓ {s.key_event_detail ?? ""}
                                  </p>
                                )}
                                {s.pages && (
                                  <p className="mt-1.5 text-[11px] font-mono text-ink-soft break-all">
                                    {s.pages}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-ink-faint">
          ※ user_id はサイト側でGA4に送っている場合のみ。匿名はブラウザ／端末単位（user_pseudo_id）です。
        </p>
      </div>
    </div>
  );
}
