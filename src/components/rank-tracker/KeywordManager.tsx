"use client";

import { useMemo, useState } from "react";
import type { TrackedKeyword } from "@/lib/rank-tracker/bigquery";
import { targetKey, isValidTargetDomain } from "@/lib/rank-tracker/domain";
import { CADENCES, type Cadence } from "@/lib/rank-tracker/cadence";
import DomainPicker from "./DomainPicker";

type Row = TrackedKeyword;
type Msg = { kind: "ok" | "err"; text: string };

const API = "/api/rank-tracker/keywords";

// タグ入力（カンマ・読点区切り）をパースする
function parseTags(text: string): string[] {
  return [...new Set(text.split(/[,、]/).map((t) => t.trim()).filter(Boolean))].slice(0, 10);
}

const rowKey = (r: { keyword: string; target_domain: string }) =>
  `${r.target_domain}\u0000${r.keyword}`;

export default function KeywordManager({
  initial,
  domains,
  loadError,
  defaultDomain,
  mode = "admin",
}: {
  initial: Row[];
  domains: string[];
  loadError: boolean;
  defaultDomain: string;
  // admin=全機能 / editor=許可サイトのみ・新規サイト追加不可 / readonly=閲覧のみ
  mode?: "admin" | "editor" | "readonly";
}) {
  const readonly = mode === "readonly";
  const [rows, setRows] = useState<Row[]>(initial);
  const [tab, setTab] = useState<"single" | "bulk">("single");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);

  // 登録フォーム（対象サイト・頻度・タグは単一/一括で共有）
  const [dm, setDm] = useState(domains[0] ?? defaultDomain);
  const [cadence, setCadence] = useState<Cadence>("weekly");
  const [tagsText, setTagsText] = useState("");
  const [kw, setKw] = useState("");
  const [bulk, setBulk] = useState("");

  // 一覧の絞り込み
  const [filterDomain, setFilterDomain] = useState("");
  const [filterTag, setFilterTag] = useState("");

  // タグの行内編集
  const [tagEditKey, setTagEditKey] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");

  const knownDomains = useMemo(
    () =>
      [...new Set([...domains, ...rows.map((r) => r.target_domain)])].sort(),
    [domains, rows]
  );
  const allTags = useMemo(
    () => [...new Set(rows.flatMap((r) => r.tags))].sort(),
    [rows]
  );

  const shown = rows.filter(
    (r) =>
      (!filterDomain || r.target_domain === filterDomain) &&
      (!filterTag || r.tags.includes(filterTag))
  );

  // 一括入力のライブ集計
  const bulkStats = useMemo(() => {
    const lines = bulk.split("\n").map((s) => s.trim()).filter(Boolean);
    const uniq = [...new Set(lines)];
    const existing = new Set(
      rows.filter((r) => r.target_domain === targetKey(dm)).map((r) => r.keyword)
    );
    const fresh = uniq.filter((k) => !existing.has(k));
    return {
      lines: lines.length,
      dup: lines.length - uniq.length,
      already: uniq.length - fresh.length,
      fresh: fresh.length,
    };
  }, [bulk, rows, dm]);

  async function refresh() {
    const res = await fetch(API, { cache: "no-store" });
    const data = await res.json();
    if (data.ok) setRows(data.items as Row[]);
  }

  // 登録成功時のみ true を返す（呼び出し側は成功時だけ入力欄をクリアする）
  async function postAdd(body: Record<string, unknown>): Promise<boolean> {
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
      setMsg({
        kind: "ok",
        text:
          data.added === data.requested
            ? `${data.added}件を登録しました。`
            : `${data.added}件を登録しました（${data.requested - data.added}件は登録済みのためスキップ）。`,
      });
      try {
        await refresh();
      } catch {
        // 一覧の再取得失敗は登録の成否と無関係なので握りつぶす（再読み込みで復帰）
      }
      return true;
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "登録に失敗しました。" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  // 「新しいサイトを追加」で未入力・不正入力のまま送信すると、サーバー側の既定ドメインへ
  // 静かにフォールバックしてしまうため、送信前にクライアントで弾く
  function validateDomain(): boolean {
    if (isValidTargetDomain(targetKey(dm))) return true;
    setMsg({
      kind: "err",
      text: "対象サイトのドメインを入力してください（例: example.com）。",
    });
    return false;
  }

  async function addSingle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!kw.trim() || !validateDomain()) return;
    const ok = await postAdd({
      keyword: kw.trim(),
      domain: dm.trim(),
      cadence,
      tags: parseTags(tagsText),
    });
    if (ok) setKw("");
  }

  async function addBulk(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const keywords = bulk.split("\n").map((s) => s.trim()).filter(Boolean);
    if (keywords.length === 0 || !validateDomain()) return;
    const ok = await postAdd({
      keywords,
      domain: dm.trim(),
      cadence,
      tags: parseTags(tagsText),
    });
    if (ok) setBulk("");
  }

  // 共通PATCH。404（他所で削除済み）は一覧を取り直す。
  async function patchRow(row: Row, patch: { cadence?: Cadence; tags?: string[] }) {
    const res = await fetch(API, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword: row.keyword, domain: row.target_domain, ...patch }),
    });
    const data = await res.json().catch(() => ({ ok: false }));
    if (res.status === 404) {
      setMsg({ kind: "err", text: "対象のキーワードは削除されています。一覧を更新しました。" });
      await refresh().catch(() => {});
      return false;
    }
    return res.ok && data.ok === true;
  }

  async function changeCadence(row: Row, next: Cadence) {
    const prev = row.cadence;
    // 楽観更新
    setRows((rs) => rs.map((r) => (rowKey(r) === rowKey(row) ? { ...r, cadence: next } : r)));
    const ok = await patchRow(row, { cadence: next }).catch(() => false);
    if (!ok) {
      // 連続変更で後続のPATCHが走っている場合は巻き戻さない（現在値が自分の楽観値のときだけ戻す）
      setRows((rs) =>
        rs.map((r) =>
          rowKey(r) === rowKey(row) && r.cadence === next ? { ...r, cadence: prev } : r
        )
      );
      setMsg((m) => m ?? { kind: "err", text: "取得頻度の更新に失敗しました。" });
    } else {
      // サーバー側で next_run_at が再設定されるため一覧を取り直す（失敗しても表示が古いだけ）
      refresh().catch(() => {});
    }
  }

  async function saveTags(row: Row) {
    const tags = parseTags(tagDraft);
    const ok = await patchRow(row, { tags }).catch(() => false);
    if (ok) {
      setRows((rs) => rs.map((r) => (rowKey(r) === rowKey(row) ? { ...r, tags } : r)));
      setTagEditKey(null);
    } else {
      setMsg((m) => m ?? { kind: "err", text: "タグの更新に失敗しました。" });
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
      setRows((rs) => rs.filter((r) => rowKey(r) !== rowKey(row)));
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "削除に失敗しました。" });
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full px-4 py-3 bg-white border border-line text-sm focus:outline-none focus:border-bronze";
  const labelCls = "block text-sm font-semibold text-ink mb-2";
  const chipCls =
    "inline-flex items-center px-2 py-0.5 text-[10px] leading-4 border border-bronze/35 text-bronze-deep bg-white";

  return (
    <div className="space-y-10">
      {/* 登録カード（読み取り専用権限では非表示） */}
      {!readonly && (
      <div className="bg-white border border-line">
        {/* 対象サイト（単一/一括で共有） */}
        <div className="p-5 border-b border-line bg-bronze/5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="dm" className={labelCls}>
                対象サイト
              </label>
              <DomainPicker
                id="dm"
                domains={knownDomains}
                value={dm}
                onChange={setDm}
                allowNew={mode === "admin"}
              />
            </div>
            <div className="grid gap-5 grid-cols-2">
              <div>
                <label htmlFor="cadence" className={labelCls}>
                  取得頻度
                </label>
                <select
                  id="cadence"
                  value={cadence}
                  onChange={(e) => setCadence(e.target.value as Cadence)}
                  className={inputCls}
                >
                  {CADENCES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                      {c.value === "stopped" ? "（登録のみ）" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="tags" className={labelCls}>
                  タグ（カンマ区切り）
                </label>
                <input
                  id="tags"
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="CVキーワード, コラム"
                  className={inputCls}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 単一 / 一括タブ */}
        <div className="flex border-b border-line" role="tablist">
          {(
            [
              { key: "single", label: "単一登録" },
              { key: "bulk", label: "一括登録" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
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
            <form onSubmit={addSingle} className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
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
              <button
                type="submit"
                disabled={busy}
                className="h-[46px] px-6 bg-ink text-paper text-sm font-semibold hover:bg-bronze-deep transition-colors disabled:opacity-60"
              >
                登録
              </button>
            </form>
          ) : (
            <form onSubmit={addBulk} className="space-y-4">
              <div>
                <label htmlFor="bulk" className={labelCls}>
                  キーワード（1行1件・貼り付け対応） <span className="text-bronze-deep">*</span>
                </label>
                <textarea
                  id="bulk"
                  value={bulk}
                  onChange={(e) => setBulk(e.target.value)}
                  rows={7}
                  placeholder={"生成AI 研修\nDX 研修\nプロンプト 研修"}
                  className={`${inputCls} resize-y`}
                />
                {bulkStats.lines > 0 && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 text-xs text-ink-soft border border-line bg-paper">
                    <span>
                      入力 <b className="text-ink">{bulkStats.lines}行</b>
                    </span>
                    <span>
                      登録予定 <b className="text-bronze-deep">{bulkStats.fresh}件</b>
                    </span>
                    {bulkStats.dup > 0 && (
                      <span className="text-red-700">入力内重複 {bulkStats.dup}件</span>
                    )}
                    {bulkStats.already > 0 && <span>登録済み {bulkStats.already}件</span>}
                  </div>
                )}
              </div>
              <button
                type="submit"
                disabled={busy || bulkStats.lines === 0}
                className="px-6 py-3 bg-ink text-paper text-sm font-semibold hover:bg-bronze-deep transition-colors disabled:opacity-60"
              >
                まとめて登録
              </button>
            </form>
          )}

          {msg && (
            <div
              role={msg.kind === "err" ? "alert" : "status"}
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
      )}

      {/* 一覧 */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="font-serif text-xl font-semibold">
            登録キーワード{" "}
            <span className="text-ink-faint text-sm font-sans">（{shown.length}件）</span>
          </h2>
          {knownDomains.length > 1 && (
            <select
              value={filterDomain}
              onChange={(e) => setFilterDomain(e.target.value)}
              className="px-3 py-2 bg-white border border-line text-sm focus:outline-none focus:border-bronze"
            >
              <option value="">すべてのサイト</option>
              {knownDomains.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
        </div>

        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-4 text-xs text-ink-faint">
            <span>タグ:</span>
            <button
              type="button"
              onClick={() => setFilterTag("")}
              className={`px-2.5 py-1 border text-xs ${
                filterTag === ""
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
                onClick={() => setFilterTag(filterTag === t ? "" : t)}
                className={`px-2.5 py-1 border text-xs ${
                  filterTag === t
                    ? "bg-ink text-paper border-ink"
                    : "bg-white border-line text-ink-soft hover:text-bronze-deep"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {loadError ? (
          <p className="text-sm text-ink-faint">
            設定の取得に失敗しました。BigQueryの設定・権限を確認してください。
          </p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-ink-faint">条件に合う登録キーワードがありません。</p>
        ) : (
          <div className="border border-line divide-y divide-line">
            {shown.map((row) => {
              const k = rowKey(row);
              const editing = tagEditKey === k;
              return (
                <div key={k} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 bg-white">
                  {readonly ? (
                    <span
                      className={`px-2.5 py-1 border border-line text-xs ${
                        row.cadence === "stopped" ? "text-ink-faint bg-paper" : "text-bronze-deep bg-white"
                      }`}
                    >
                      {CADENCES.find((c) => c.value === row.cadence)?.label ?? row.cadence}
                    </span>
                  ) : (
                    <select
                      aria-label={`「${row.keyword}」の取得頻度`}
                      value={row.cadence}
                      onChange={(e) => changeCadence(row, e.target.value as Cadence)}
                      className={`px-2 py-1.5 border border-line text-xs focus:outline-none focus:border-bronze ${
                        row.cadence === "stopped" ? "text-ink-faint bg-paper" : "text-bronze-deep bg-white"
                      }`}
                    >
                      {CADENCES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink">{row.keyword}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-ink-faint">{row.target_domain}</span>
                      {!editing &&
                        row.tags.map((t) => (
                          <span key={t} className={chipCls}>
                            {t}
                          </span>
                        ))}
                      {!editing && !readonly && (
                        <button
                          type="button"
                          onClick={() => {
                            setTagEditKey(k);
                            setTagDraft(row.tags.join(", "));
                          }}
                          className="inline-flex items-center px-2 py-0.5 text-[10px] leading-4 border border-dashed border-line text-ink-faint hover:text-bronze-deep hover:border-bronze"
                        >
                          {row.tags.length > 0 ? "タグ編集" : "＋タグ"}
                        </button>
                      )}
                    </div>
                    {editing && (
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          value={tagDraft}
                          onChange={(e) => setTagDraft(e.target.value)}
                          placeholder="CVキーワード, コラム"
                          className="px-3 py-1.5 bg-white border border-line text-xs focus:outline-none focus:border-bronze w-64 max-w-full"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => saveTags(row)}
                          className="px-3 py-1.5 bg-ink text-paper text-xs hover:bg-bronze-deep"
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          onClick={() => setTagEditKey(null)}
                          className="text-xs text-ink-faint hover:text-ink"
                        >
                          キャンセル
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="text-[11px] text-ink-faint text-right hidden md:block">
                    {row.cadence === "stopped" ? (
                      "定期取得なし"
                    ) : (
                      <>次回 {row.next_run_at ?? "—"}</>
                    )}
                  </div>

                  {!readonly && (
                    <button
                      type="button"
                      onClick={() => remove(row)}
                      disabled={busy}
                      className="text-xs text-ink-faint hover:text-red-600 transition-colors disabled:opacity-60"
                    >
                      削除
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
