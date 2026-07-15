"use client";

import { useMemo, useState } from "react";

type Row = {
  keyword: string;
  target_domain: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

type Msg = { kind: "ok" | "err"; text: string };

const API = "/api/rank-tracker/keywords";

export default function KeywordManager({
  initial,
  loadError,
  defaultDomain,
}: {
  initial: Row[];
  loadError: boolean;
  defaultDomain: string;
}) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [tab, setTab] = useState<"single" | "bulk">("single");
  const [filter, setFilter] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);

  // 単一登録フォーム
  const [kw, setKw] = useState("");
  const [dm, setDm] = useState(defaultDomain);
  // 一括登録フォーム
  const [bulk, setBulk] = useState("");
  const [bulkDm, setBulkDm] = useState(defaultDomain);

  const domains = useMemo(
    () => Array.from(new Set(rows.map((r) => r.target_domain))).sort(),
    [rows]
  );
  const shown = filter ? rows.filter((r) => r.target_domain === filter) : rows;

  const same = (a: Row, b: { keyword: string; target_domain: string }) =>
    a.keyword === b.keyword && a.target_domain === b.target_domain;

  async function refresh() {
    const res = await fetch(API, { cache: "no-store" });
    const data = await res.json();
    if (data.ok) setRows(data.items as Row[]);
  }

  async function postAdd(body: Record<string, unknown>) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "登録に失敗しました。");
      await refresh();
      setMsg({ kind: "ok", text: `${data.added}件を登録しました（重複は無視）。` });
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "登録に失敗しました。" });
    } finally {
      setBusy(false);
    }
  }

  async function addSingle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!kw.trim()) return;
    await postAdd({ keyword: kw.trim(), domain: dm.trim() || defaultDomain });
    setKw("");
  }

  async function addBulk(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const keywords = bulk
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (keywords.length === 0) return;
    await postAdd({ keywords, domain: bulkDm.trim() || defaultDomain });
    setBulk("");
  }

  async function toggle(row: Row) {
    const next = !row.enabled;
    // 楽観更新
    setRows((rs) => rs.map((r) => (same(r, row) ? { ...r, enabled: next } : r)));
    try {
      const res = await fetch(API, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: row.keyword, domain: row.target_domain, enabled: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error();
    } catch {
      // 失敗したら戻す
      setRows((rs) => rs.map((r) => (same(r, row) ? { ...r, enabled: row.enabled } : r)));
      setMsg({ kind: "err", text: "ON/OFFの更新に失敗しました。" });
    }
  }

  async function remove(row: Row) {
    if (!window.confirm(`「${row.keyword}」(${row.target_domain}) を削除しますか？`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(API, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: row.keyword, domain: row.target_domain }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "削除に失敗しました。");
      setRows((rs) => rs.filter((r) => !same(r, row)));
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "削除に失敗しました。" });
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full px-4 py-3 bg-white border border-line text-sm focus:outline-none focus:border-bronze";
  const labelCls = "block text-sm font-semibold text-ink mb-2";

  return (
    <div className="space-y-10">
      {/* 登録カード（単一 / 一括タブ） */}
      <div className="bg-white border border-line">
        <div className="flex border-b border-line">
          {(
            [
              { key: "single", label: "単一登録" },
              { key: "bulk", label: "一括登録" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-5 py-3 text-sm border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? "border-bronze text-bronze-deep font-semibold"
                  : "border-transparent text-ink-soft hover:text-bronze-deep"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === "single" ? (
            <form onSubmit={addSingle} className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_16rem_auto] sm:items-end">
              <div>
                <label htmlFor="kw" className={labelCls}>
                  キーワード <span className="text-bronze-deep">*</span>
                </label>
                <input
                  id="kw"
                  value={kw}
                  onChange={(e) => setKw(e.target.value)}
                  placeholder="例: 生成AI 研修"
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="dm" className={labelCls}>
                  対象ドメイン
                </label>
                <input
                  id="dm"
                  value={dm}
                  onChange={(e) => setDm(e.target.value)}
                  placeholder={defaultDomain}
                  className={inputCls}
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="h-[46px] px-6 bg-ink text-paper text-sm font-semibold hover:bg-bronze-deep transition-colors disabled:opacity-60"
              >
                登録
              </button>
            </form>
          ) : (
            <form onSubmit={addBulk} className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_16rem]">
                <div>
                  <label htmlFor="bulk" className={labelCls}>
                    キーワード（1行1件） <span className="text-bronze-deep">*</span>
                  </label>
                  <textarea
                    id="bulk"
                    value={bulk}
                    onChange={(e) => setBulk(e.target.value)}
                    rows={6}
                    placeholder={"生成AI 研修\nDX 研修\nプロンプト 研修"}
                    className={`${inputCls} resize-y`}
                  />
                </div>
                <div>
                  <label htmlFor="bulkDm" className={labelCls}>
                    対象ドメイン（共通）
                  </label>
                  <input
                    id="bulkDm"
                    value={bulkDm}
                    onChange={(e) => setBulkDm(e.target.value)}
                    placeholder={defaultDomain}
                    className={inputCls}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="px-6 py-3 bg-ink text-paper text-sm font-semibold hover:bg-bronze-deep transition-colors disabled:opacity-60"
              >
                まとめて登録
              </button>
            </form>
          )}

          {msg && (
            <div
              className={`mt-4 px-4 py-3 text-sm border ${
                msg.kind === "ok"
                  ? "bg-bronze/10 border-bronze/30 text-bronze-deep"
                  : "bg-red-50 border-red-200 text-red-700"
              }`}
            >
              {msg.text}
            </div>
          )}
        </div>
      </div>

      {/* 一覧 */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="font-serif text-xl font-semibold">
            登録キーワード <span className="text-ink-faint text-sm font-sans">（{rows.length}件）</span>
          </h2>
          {domains.length > 1 && (
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-line text-sm focus:outline-none focus:border-bronze"
            >
              <option value="">すべてのサイト</option>
              {domains.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
        </div>

        {loadError ? (
          <p className="text-sm text-ink-faint">
            設定の取得に失敗しました。BigQueryの設定・権限を確認してください。
          </p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-ink-faint">まだ登録キーワードがありません。</p>
        ) : (
          <div className="border border-line divide-y divide-line">
            {shown.map((row) => (
              <div
                key={`${row.target_domain} ${row.keyword}`}
                className="flex flex-wrap items-center gap-4 p-4 bg-white"
              >
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={() => toggle(row)}
                    className="h-4 w-4 accent-bronze-deep"
                  />
                  <span
                    className={`text-[11px] tracking-wider ${
                      row.enabled ? "text-bronze-deep" : "text-ink-faint"
                    }`}
                  >
                    {row.enabled ? "定期取得ON" : "OFF"}
                  </span>
                </label>

                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink">{row.keyword}</div>
                  <div className="text-xs text-ink-faint">{row.target_domain}</div>
                </div>

                <div className="text-[11px] text-ink-faint text-right hidden sm:block">
                  登録 {row.created_at}
                </div>

                <button
                  type="button"
                  onClick={() => remove(row)}
                  disabled={busy}
                  className="text-xs text-ink-faint hover:text-red-600 transition-colors disabled:opacity-60"
                >
                  削除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
