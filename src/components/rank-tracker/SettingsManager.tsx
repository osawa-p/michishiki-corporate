"use client";

// サイト別制限・クレジット設定の管理画面（管理者専用）。
// 編集パネルでは、そのサイトの登録キーワードの頻度分布から予測月間消費を
// ライブ計算して表示する（保存自体は警告があってもできる — 予算を下げて
// 定期計測を絞る運用を妨げないため。登録・頻度変更側は予算超過でブロックされる）。
import { useState } from "react";
import type { SiteSettingsView } from "@/lib/rank-tracker/settings-view";
import { CADENCES, type Cadence } from "@/lib/rank-tracker/cadence";
import { predictMonthlyTokens, formatTokens, DEPTH_OPTIONS } from "@/lib/rank-tracker/limits";

type Msg = { kind: "ok" | "err"; text: string };

const API = "/api/rank-tracker/settings";

const INTERVAL_OPTIONS = CADENCES.filter((c) => c.days != null).map((c) => ({
  days: c.days as number,
  label: `${c.label}まで`,
}));

function expandCadences(counts: Partial<Record<Cadence, number>>): Cadence[] {
  const out: Cadence[] = [];
  for (const [cad, n] of Object.entries(counts)) {
    for (let i = 0; i < (n ?? 0); i++) out.push(cad as Cadence);
  }
  return out;
}

export default function SettingsManager({
  initial,
  loadError,
}: {
  initial: SiteSettingsView[];
  loadError: boolean;
}) {
  const [items, setItems] = useState<SiteSettingsView[]>(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);

  // 編集フォームの状態
  const [maxKw, setMaxKw] = useState("");
  const [depth, setDepth] = useState(100);
  const [interval, setIntervalDays] = useState(1);
  const [budgetMan, setBudgetMan] = useState(""); // 万トークン単位の入力

  function openEdit(it: SiteSettingsView) {
    setEditing(it.domain);
    setMaxKw(it.max_keywords == null ? "" : String(it.max_keywords));
    setDepth(it.max_depth);
    setIntervalDays(it.min_interval_days);
    setBudgetMan(it.monthly_budget == null ? "" : String(it.monthly_budget / 10_000));
    setMsg(null);
  }

  async function refresh() {
    const res = await fetch(API, { cache: "no-store" });
    const data = await res.json();
    if (data.ok) setItems(data.items as SiteSettingsView[]);
  }

  async function save(it: SiteSettingsView) {
    const maxKeywords = maxKw.trim() === "" ? null : Number(maxKw);
    const budget = budgetMan.trim() === "" ? null : Math.round(Number(budgetMan) * 10_000);
    if (maxKeywords !== null && (!Number.isInteger(maxKeywords) || maxKeywords < 1)) {
      setMsg({ kind: "err", text: "上限キーワード数は1以上の整数か、空欄（無制限）にしてください。" });
      return;
    }
    if (budget !== null && (!Number.isFinite(budget) || budget < 10_000)) {
      setMsg({ kind: "err", text: "月間予算は1万トークン以上か、空欄（無制限）にしてください。" });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(API, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: it.domain,
          max_keywords: maxKeywords,
          max_depth: depth,
          min_interval_days: interval,
          monthly_budget: budget,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "保存に失敗しました。");
      setMsg({ kind: "ok", text: `${it.domain} の設定を保存しました。` });
      setEditing(null);
      await refresh().catch(() => {});
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "保存に失敗しました。" });
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return <p className="text-sm text-ink-faint">設定の取得に失敗しました。</p>;
  }
  if (items.length === 0) {
    return <p className="text-sm text-ink-faint">追跡サイトがまだありません。キーワードを登録すると表示されます。</p>;
  }

  const inputCls =
    "w-full px-3 py-2 bg-white border border-line text-sm focus:outline-none focus:border-bronze";
  const labelCls = "block text-xs font-semibold text-ink mb-1.5";

  return (
    <div className="space-y-4">
      {msg && (
        <div
          role={msg.kind === "err" ? "alert" : "status"}
          className={`px-4 py-3 text-sm border ${
            msg.kind === "ok"
              ? "bg-bronze/10 border-bronze/30 text-bronze-deep"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="border border-line divide-y divide-line bg-white">
        {items.map((it) => {
          const isEditing = editing === it.domain;
          const budgetPct =
            it.monthly_budget != null
              ? Math.min(100, Math.round((it.used_tokens / it.monthly_budget) * 100))
              : null;
          // 編集中はフォーム値で、通常時は保存値でライブ予測
          const predicted = isEditing
            ? predictMonthlyTokens(expandCadences(it.cadence_counts), { max_depth: depth })
            : it.predicted_tokens;
          const editBudget =
            isEditing && budgetMan.trim() !== "" ? Math.round(Number(budgetMan) * 10_000) : null;
          const overWarn = isEditing && editBudget != null && predicted > editBudget;

          return (
            <div key={it.domain}>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 p-4">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink break-all">{it.domain}</div>
                  <div className="text-[11px] text-ink-faint mt-0.5">
                    キーワード {it.keywords}
                    {it.max_keywords != null && ` / 上限${it.max_keywords}`}件 ・ 深度
                    {it.max_depth}位 ・ 頻度
                    {INTERVAL_OPTIONS.find((o) => o.days === it.min_interval_days)?.label ?? "毎日まで"} ・
                    予測消費 約{formatTokens(it.predicted_tokens)}/月
                  </div>
                </div>

                <div className="min-w-[13rem]">
                  {it.monthly_budget != null ? (
                    <>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-line">
                          <div
                            className={`h-full ${budgetPct! >= 90 ? "bg-red-600" : "bg-bronze"}`}
                            style={{ width: `${budgetPct}%` }}
                          />
                        </div>
                        <span
                          className={`text-[11px] tabular-nums ${
                            budgetPct! >= 90 ? "text-red-700 font-semibold" : "text-ink-soft"
                          }`}
                        >
                          {formatTokens(it.used_tokens)} / {formatTokens(it.monthly_budget)}（{budgetPct}%）
                        </span>
                      </div>
                      <div className="text-[10px] text-ink-faint mt-0.5 text-right">
                        今月の消費（計測{it.measurements}回）
                        {budgetPct! >= 100 && " ・ 定期計測は停止中"}
                      </div>
                    </>
                  ) : (
                    <div className="text-[11px] text-ink-faint text-right">
                      今月の消費 {formatTokens(it.used_tokens)}（予算なし）
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => (isEditing ? setEditing(null) : openEdit(it))}
                  className="text-xs text-bronze-deep hover:underline"
                >
                  {isEditing ? "閉じる" : "編集"}
                </button>
              </div>

              {isEditing && (
                <div className="border-t border-line bg-bronze/5 p-4">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 max-w-4xl">
                    <div>
                      <label htmlFor={`kw-${it.domain}`} className={labelCls}>
                        上限キーワード数（空欄=無制限）
                      </label>
                      <input
                        id={`kw-${it.domain}`}
                        value={maxKw}
                        onChange={(e) => setMaxKw(e.target.value)}
                        inputMode="numeric"
                        placeholder="無制限"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label htmlFor={`dp-${it.domain}`} className={labelCls}>
                        計測深度
                      </label>
                      <select
                        id={`dp-${it.domain}`}
                        value={depth}
                        onChange={(e) => setDepth(Number(e.target.value))}
                        className={inputCls}
                      >
                        {DEPTH_OPTIONS.map((d) => (
                          <option key={d} value={d}>
                            {d}位まで（{formatTokens((Math.ceil(d / 10) + 1) * 10_000)}/回）
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`iv-${it.domain}`} className={labelCls}>
                        使える頻度
                      </label>
                      <select
                        id={`iv-${it.domain}`}
                        value={interval}
                        onChange={(e) => setIntervalDays(Number(e.target.value))}
                        className={inputCls}
                      >
                        {INTERVAL_OPTIONS.map((o) => (
                          <option key={o.days} value={o.days}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`bg-${it.domain}`} className={labelCls}>
                        月間予算（万トークン・空欄=無制限）
                      </label>
                      <input
                        id={`bg-${it.domain}`}
                        value={budgetMan}
                        onChange={(e) => setBudgetMan(e.target.value)}
                        inputMode="numeric"
                        placeholder="例: 300"
                        className={inputCls}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 mt-4">
                    <button
                      type="button"
                      onClick={() => save(it)}
                      disabled={busy}
                      className="px-5 py-2 bg-ink text-paper text-xs font-semibold hover:bg-bronze-deep transition-colors disabled:opacity-60"
                    >
                      保存
                    </button>
                    <span className={`text-xs ${overWarn ? "text-red-700" : "text-ink-soft"}`}>
                      この設定での予測月間消費: <b className="tabular-nums">約{formatTokens(predicted)}</b>
                      {overWarn &&
                        ` ⚠ 予算（${formatTokens(editBudget!)}）を超えています — 新規登録・頻度引き上げはブロックされます`}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-ink-faint leading-relaxed">
        予測 = Σ（キーワード数 × 深度あたりトークン × 30日 ÷ 頻度日数）。同一キーワードを複数サイトで
        追跡している場合、実際のJINA消費は1回分ですが各サイトに計上されます（上限側に倒した安全な見積もり）。
      </p>
    </div>
  );
}
