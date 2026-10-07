"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { BoardData, RunRow, StaffRow, TaskRow } from "@/lib/rank-tracker/ai-staff";
import { DERIVED_META, deriveTask as derive, type Derived } from "@/lib/rank-tracker/ai-staff-view";
import AiStaffOffice from "./AiStaffOffice";
import { RoleBust } from "./AiStaffAvatar";

// AI社員ボード（管理者専用・クライアント部品）。2026-10-07 に GPT-6 Astra の監修で再設計。
// - 既定は「全案件 × 確認待ち」の受信箱。未指示などは状態の切替で見る
// - 1タスク=1カード。確認待ちは返答（要約→確認事項→指標→詳細）と確認操作を常時表示、それ以外は見出しだけで開閉
// - 修正・追加の指示は「書いてから送る」。前回の依頼文を誤送信しない
// - 15秒更新で編集中の値を上書きしない。保存失敗で編集欄を閉じない
// 画面の状態は runs から決まる: 最新 run が queued/claimed/running なら作業中、done/failed なら確認待ち。
// データの読み書きは /api/rank-tracker/ai-staff（管理者専用）。

const API = "/api/rank-tracker/ai-staff";
const POLL_MS = 15_000;
const OFFICE_KEY = "ai-staff:office-hidden";

const VERDICT_META: Record<string, { label: string; color: string }> = {
  done: { label: "完了提案", color: "#0ca30c" },
  check: { label: "要確認", color: "#b3352e" },
  hold: { label: "観測中", color: "#fab219" },
  blocked: { label: "先方待ち", color: "#b07cc6" },
};
const RUN_STATUS_LABEL: Record<string, string> = {
  queued: "依頼済み（派遣係の確保待ち）",
  claimed: "確保済み",
  running: "作業中",
  done: "返答あり",
  failed: "失敗",
};
const GROUP_LABEL: Record<string, string> = {
  X: "追加の依頼",
  W: "WBS の施策（tasks.js から自動登録）",
  A: "定例の結果を記録に反映",
  B: "効果測定・定常の計測",
  C: "提案・資料づくり",
  D: "確認・技術まわり",
  E: "先方からの受領待ち",
};
const WBS_ST_LABEL: Record<string, string> = { todo: "未着手", doing: "進行中", wait: "待ち", done: "完了" };

// 定型の指示。取得できるデータや比較期間を決めつけない文面にする
const PRESETS: { id: string; label: string; role: string; text: string }[] = [
  {
    id: "measure",
    label: "判定日の効果測定",
    role: "analytics",
    text: "この施策の効果を測定してください。対象・比較期間・指標・数値・判断根拠を示し、材料不足は確認事項にしてください。",
  },
  {
    id: "meeting",
    label: "定例前の棚卸し",
    role: "leader",
    text: "定例に向け、この案件の進捗・未決事項・期限・先方への確認事項を整理し、判断が必要な順にまとめてください。",
  },
  {
    id: "article",
    label: "記事レビュー",
    role: "seo",
    text: "対象記事を検索意図・構成・根拠・内部リンクの観点でレビューし、修正箇所と理由を優先順に示してください。対象が不明なら確認してください。",
  },
  {
    id: "critique",
    label: "反論担当の点検",
    role: "critic",
    text: "このタスクの直近の成果物・提案を、前提の誤り・裏取り不足・数値の整合・先方の受け取り方・リスク・代替案の観点で点検し、直すべき点を重要順に示してください。",
  },
];

const CSS = `
.ai-board :is(button, select, input:not([type="checkbox"]), summary) { min-height: 44px; }
.ai-board :is(input:not([type="checkbox"]), select, textarea) { font-size: 16px; }
.ai-board :is(button, a, summary, input, select, textarea):focus-visible { outline: 2px solid #86672f; outline-offset: 3px; }
.ai-board .action-primary, .ai-board .action-secondary { min-height: 44px; padding: .5rem .875rem; border-radius: .375rem; font-size: .875rem; }
.ai-board .action-primary { background: #86672f; color: #fff; font-weight: 600; }
.ai-board .action-secondary { border: 1px solid #e2ded2; color: #56534a; background: #fff; }
.ai-board button:disabled { opacity: .5; cursor: not-allowed; }
.ai-board .filter-chip { min-height: 44px; }
.add-sheet { position: fixed; inset: 0 0 0 auto; margin: 0; width: min(36rem, 100%); max-width: 100%; height: 100dvh; max-height: 100dvh; overflow-y: auto; border: 1px solid #e2ded2; border-right: 0; padding: 1.25rem; padding-bottom: max(1.25rem, env(safe-area-inset-bottom)); }
.add-sheet::backdrop { background: rgb(28 27 24 / 35%); }
@media (max-width: 767px) {
  .add-sheet { inset: auto 0 0; width: 100%; height: auto; max-height: 90dvh; border-radius: 1rem 1rem 0 0; border-right: 1px solid #e2ded2; }
}
@media (prefers-reduced-motion: reduce) {
  .ai-board, .ai-board *, .ai-board *::before, .ai-board *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}
`;

type Metric =
  | { label?: string; before?: number; after?: number; unit?: string; better?: string; note?: string; text?: string }
  | null;
type Link = { label?: string; url?: string };
type Row = { task: TaskRow; runs: RunRow[]; latest: RunRow | undefined; derived: Derived };

function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s || s === "null") return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
function shortId(t: TaskRow): string {
  return t.id.startsWith(`${t.pj}-`) ? t.id.slice(t.pj.length + 1) : t.id;
}
function fmtTs(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }))) as { ok: boolean; error?: string };
  if (!res.ok && !json.error) json.error = `HTTP ${res.status}`;
  return json;
}

// WBS（tasks.js → wbs-tasks.json）の施策情報。WBS ID で結ぶ。page.tsx から渡す
export type WbsInfo = { st: string; due: string; pri: number; task: string };

export default function AiStaffBoard({ initial, loadError, wbs }: { initial: BoardData | null; loadError: boolean; wbs?: Record<string, WbsInfo> }) {
  const [data, setData] = useState<BoardData | null>(initial);
  const [error, setError] = useState<string | null>(loadError ? "ボードの取得に失敗しました。BigQuery の接続を確認してください。" : null);
  const [refreshing, setRefreshing] = useState(false);
  const [pj, setPj] = useState<string>("all");
  const [role, setRole] = useState<string>("all");
  // 既定は「確認待ち」の受信箱。未指示などは切替で見る
  const [stateFilter, setStateFilter] = useState<Derived | "all">("review");
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showOffice, setShowOffice] = useState(true);
  const timer = useRef<number | null>(null);
  const focusBeforeUpdate = useRef<HTMLElement | null>(null);
  const addDialogRef = useRef<HTMLDialogElement>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(API, { cache: "no-store" });
      const json = (await res.json()) as { ok: boolean; error?: string } & Partial<BoardData>;
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      // 更新で操作対象が消えたときにフォーカスを戻すため、直前のフォーカスを覚える
      const focused = document.activeElement;
      focusBeforeUpdate.current = focused instanceof HTMLElement && focused.closest(".ai-board") ? focused : null;
      setData({ staff: json.staff ?? [], tasks: json.tasks ?? [], runs: json.runs ?? [], generatedAt: json.generatedAt ?? new Date().toISOString() });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新に失敗しました。");
    } finally {
      setRefreshing(false);
    }
  }, []);

  // 定期的に自動更新（タブが見えているときだけ）
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    timer.current = window.setInterval(tick, POLL_MS);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [refresh]);

  // WBS ページからのリンク（?q=M-37）: 検索欄を初期化し、状態フィルターで隠さない
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("q");
    if (value) {
      setQ(value);
      setStateFilter("all");
    }
    try {
      if (window.localStorage.getItem(OFFICE_KEY) === "1") setShowOffice(false);
    } catch {}
  }, []);
  const toggleOffice = () => {
    setShowOffice((v) => {
      try {
        window.localStorage.setItem(OFFICE_KEY, v ? "1" : "0");
      } catch {}
      return !v;
    });
  };

  // 更新で行が消えたら一覧見出しへフォーカスを戻す
  useEffect(() => {
    const previous = focusBeforeUpdate.current;
    focusBeforeUpdate.current = null;
    if (previous && !previous.isConnected) document.getElementById("ai-inbox-heading")?.focus();
  }, [data]);

  // 追加フォームはネイティブ dialog（フォーカス制御と Esc 閉じを利用）
  useEffect(() => {
    const dialog = addDialogRef.current;
    if (!dialog) return;
    if (showAdd && !dialog.open) dialog.showModal();
    if (!showAdd && dialog.open) dialog.close();
  }, [showAdd]);

  const staffByPj = useMemo(() => {
    const m: Record<string, StaffRow[]> = {};
    for (const s of data?.staff ?? []) (m[s.pj] ||= []).push(s);
    return m;
  }, [data]);
  const staffById = useMemo(() => Object.fromEntries((data?.staff ?? []).map((s) => [s.id, s])), [data]);
  const pjLabel = useCallback(
    (p: string) => {
      const s = staffByPj[p]?.[0];
      return s ? s.name.split("／")[0] : p;
    },
    [staffByPj],
  );
  const roleLabel = useCallback(
    (id: string | null | undefined) => {
      if (!id) return "未割当";
      const s = staffById[id];
      return s ? s.name.split("／")[1] ?? s.role : id;
    },
    [staffById],
  );
  const roles = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of data?.staff ?? []) if (!seen.has(s.role)) seen.set(s.role, s.name.split("／")[1] ?? s.role);
    return [...seen.entries()];
  }, [data]);
  const pjs = useMemo(() => Object.keys(staffByPj).sort(), [staffByPj]);

  const runsByTask = useMemo(() => {
    const m: Record<string, RunRow[]> = {};
    for (const r of data?.runs ?? []) (m[r.task_id] ||= []).push(r); // runs は created_at 降順
    return m;
  }, [data]);

  // 件数には案件・担当・検索を反映し、状態フィルターだけを除く（件数と一覧の母集団を揃える）
  const scopedRows = useMemo<Row[]>(() => {
    const query = q.trim().toLowerCase();
    return (data?.tasks ?? [])
      .map((task) => {
        const runs = runsByTask[task.id] ?? [];
        return { task, runs, latest: runs[0], derived: derive(task, runs[0]) };
      })
      .filter(
        ({ task: t, latest }) =>
          (pj === "all" || t.pj === pj) &&
          (role === "all" || staffById[t.owner_staff ?? ""]?.role === role) &&
          (!query || [t.id, t.wbs_id, t.title, t.state, t.next, latest?.summary].filter(Boolean).join(" ").toLowerCase().includes(query)),
      );
  }, [data, runsByTask, pj, role, q, staffById]);

  const counts = useMemo(() => {
    const c: Record<Derived, number> = { review: 0, working: 0, open: 0, waiting: 0, done: 0 };
    for (const row of scopedRows) c[row.derived]++;
    return c;
  }, [scopedRows]);

  const rows = useMemo(
    () =>
      scopedRows
        .filter((r) => stateFilter === "all" || r.derived === stateFilter)
        .sort(
          (a, b) =>
            DERIVED_META[a.derived].order - DERIVED_META[b.derived].order ||
            (a.task.due || "9999-12-31").localeCompare(b.task.due || "9999-12-31") ||
            a.task.pj.localeCompare(b.task.pj) ||
            (a.task.task_group ?? "").localeCompare(b.task.task_group ?? "") ||
            (a.task.ord ?? 0) - (b.task.ord ?? 0) ||
            a.task.id.localeCompare(b.task.id),
        ),
    [scopedRows, stateFilter],
  );

  return (
    <div className="ai-board space-y-6">
      <style>{CSS}</style>
      {error && (
        <p role="alert" className="rounded border border-[#b3352e]/40 bg-[#b3352e]/5 px-4 py-3 text-sm text-[#b3352e]">
          {error}
        </p>
      )}

      {/* オフィス（社員の状態をアニメーションで表示） */}
      {data && showOffice && (
        <AiStaffOffice
          staff={data.staff}
          tasks={data.tasks}
          runs={data.runs}
          pjLabel={pjLabel}
          onSelect={(p, r) => {
            setPj(p);
            setRole(r);
            setStateFilter("all");
          }}
        />
      )}

      {/* 案件の切替（見た目はタブだが通常の絞り込みボタン） */}
      <div role="group" aria-label="案件で絞り込み" className="flex gap-2 overflow-x-auto pb-1">
        {["all", ...pjs].map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={pj === p}
            onClick={() => setPj(p)}
            className={`shrink-0 rounded border px-3 text-sm ${pj === p ? "border-bronze bg-bronze/10 font-semibold text-bronze-deep" : "border-line text-ink-soft"}`}
          >
            {p === "all" ? "全案件" : pjLabel(p)}
          </button>
        ))}
      </div>

      {/* 状態の切替と操作 */}
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(DERIVED_META) as Derived[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setStateFilter(k)}
            aria-pressed={stateFilter === k}
            className={`filter-chip inline-flex items-center gap-2 rounded-full border px-3 text-xs ${
              stateFilter === k ? "border-bronze bg-bronze/10 font-semibold text-bronze-deep" : "border-line text-ink-soft hover:border-bronze"
            }`}
          >
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: DERIVED_META[k].color }} aria-hidden />
            {DERIVED_META[k].label}
            <span className="font-mono">{counts[k]}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setStateFilter("all")}
          aria-pressed={stateFilter === "all"}
          className={`filter-chip rounded-full border px-3 text-xs ${stateFilter === "all" ? "border-bronze bg-bronze/10 font-semibold text-bronze-deep" : "border-line text-ink-soft hover:border-bronze"}`}
        >
          すべて
        </button>
        <span className="ml-auto flex flex-wrap items-center gap-2 text-xs text-ink-faint">
          {data && <span>更新 {fmtTs(data.generatedAt)}</span>}
          <button type="button" onClick={toggleOffice} className="action-secondary" aria-pressed={showOffice}>
            {showOffice ? "オフィスを隠す" : "オフィスを表示"}
          </button>
          <button type="button" onClick={() => void refresh()} disabled={refreshing} className="action-secondary">
            {refreshing ? "更新中…" : "更新"}
          </button>
          <button type="button" onClick={() => setShowAdd(true)} className="action-primary" aria-haspopup="dialog">
            ＋ タスクを追加
          </button>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded border border-line bg-paper px-2" aria-label="担当で絞り込み">
          <option value="all">全担当</option>
          {roles.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="検索（ID・WBS・題名・状況・返答）" className="min-w-[220px] flex-1 rounded border border-line bg-paper px-2" aria-label="検索" />
      </div>

      <h2 id="ai-inbox-heading" tabIndex={-1} className="font-serif text-xl text-ink">
        {stateFilter === "review" ? "確認待ちの返答" : stateFilter === "all" ? "タスク一覧" : `${DERIVED_META[stateFilter].label}のタスク`}
        <span className="ml-2 font-sans text-sm text-ink-soft">{rows.length}件</span>
      </h2>
      {rows.length === 0 && (
        <p className="text-sm text-ink-soft">
          {stateFilter === "review" ? "この条件の確認待ちはありません。作業中や未指示は上の切替から確認できます。" : "この条件に一致するタスクはありません。"}
        </p>
      )}
      <ul className="space-y-4">
        {rows.map(({ task, runs, latest, derived }) => (
          <TaskRowView
            key={task.id}
            task={task}
            runs={runs}
            latest={latest}
            derived={derived}
            staffOptions={staffByPj[task.pj] ?? []}
            pjLabel={pjLabel(task.pj)}
            roleLabel={roleLabel}
            wbsInfo={task.wbs_id ? wbs?.[task.wbs_id] : undefined}
            onChanged={refresh}
          />
        ))}
      </ul>

      <dialog ref={addDialogRef} className="add-sheet bg-paper text-ink" aria-labelledby="add-task-title" onClose={() => setShowAdd(false)}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="add-task-title" className="font-serif text-xl">
            タスクを追加
          </h2>
          <button type="button" className="action-secondary" onClick={() => setShowAdd(false)}>
            閉じる
          </button>
        </div>
        {showAdd && data && (
          <AddTaskForm
            pjs={pjs}
            pjLabel={pjLabel}
            staffByPj={staffByPj}
            initialPj={pj !== "all" ? pj : undefined}
            onDone={() => {
              setShowAdd(false);
              void refresh();
            }}
          />
        )}
      </dialog>
    </div>
  );
}

// 状態チップ: 色は装飾、記号と文字で区別する（色覚多様性への配慮）
function Chip({ label, color }: { label: string; color: string }) {
  const symbols: Record<string, string> = { 確認待ち: "?", 作業中: "◷", 未指示: "○", 先方待ち: "Ⅱ", 完了: "✓" };
  const key = label.replace(/^AI判定：/, "");
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-line bg-paper px-2 py-1 text-xs font-medium text-ink">
      <span aria-hidden="true" className="h-3 w-1 rounded" style={{ backgroundColor: color }} />
      <span aria-hidden="true">{symbols[key] ?? "◇"}</span>
      {label}
    </span>
  );
}

// 指標: 数値の方向と、better（up=増えるほど良い／down=減るほど良い）が分かるときだけ評価語を添える
function MetricPill({ metric }: { metric: Metric }) {
  if (!metric) return null;
  const { label, before, after, unit = "", text, better, note } = metric;
  const numeric = typeof before === "number" && Number.isFinite(before) && typeof after === "number" && Number.isFinite(after);
  if (!numeric) {
    return text ? (
      <p className="text-sm text-ink-soft" title={note ?? ""}>
        {label && `${label}：`}
        {text}
      </p>
    ) : null;
  }
  const format = (n: number) => n.toLocaleString("ja-JP", { maximumFractionDigits: 6 });
  const direction = after > before ? "増加" : after < before ? "減少" : "変化なし";
  const improved = after === before || (better !== "up" && better !== "down") ? null : better === "up" ? after > before : after < before;
  return (
    <p className="rounded border border-line bg-paper px-3 py-2 text-sm text-ink" title={note ?? ""}>
      <span className="font-medium">{label || "指標"}：</span>
      <span className="tabular-nums">
        {format(before)}
        {unit} → {format(after)}
        {unit}
      </span>
      <span className="ml-2 text-ink-soft">数値は{direction}</span>
      {improved !== null && (
        <span className="ml-2 font-semibold" style={{ color: improved ? "#0a7d0a" : "#b3352e" }}>
          {improved ? "▼改善" : "▲悪化"}
        </span>
      )}
      {note && <span className="ml-2 text-xs text-ink-faint">（{note}）</span>}
    </p>
  );
}

function TaskRowView({
  task,
  runs,
  latest,
  derived,
  staffOptions,
  pjLabel,
  roleLabel,
  wbsInfo,
  onChanged,
}: {
  task: TaskRow;
  runs: RunRow[];
  latest: RunRow | undefined;
  derived: Derived;
  staffOptions: StaffRow[];
  pjLabel: string;
  roleLabel: (id: string | null | undefined) => string;
  wbsInfo?: WbsInfo;
  onChanged: () => Promise<void>;
}) {
  const rowId = useId();
  // 明示された担当を優先し、未割当なら案件リーダーを初期候補にする
  const [staff, setStaff] = useState(() => staffOptions.find((s) => s.id === task.owner_staff)?.id ?? staffOptions.find((s) => s.role === "leader")?.id ?? "");
  const staffEdited = useRef(false);
  const [prompt, setPrompt] = useState(task.prompt ?? "");
  const [redoPrompt, setRedoPrompt] = useState("");
  const [composing, setComposing] = useState(false);
  const [requestKind, setRequestKind] = useState<"first" | "redo" | "more">("first");
  const [sourceId, setSourceId] = useState("measure");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState(task.state ?? "");
  const [next, setNext] = useState(task.next ?? "");
  const [due, setDue] = useState(task.due ?? "");
  const [dueLabel, setDueLabel] = useState(task.due_label ?? "");
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const actionLock = useRef(false);

  // サーバー側の更新（派遣係の書き戻し）を反映。編集中は上書きしない
  useEffect(() => {
    if (editing) return;
    setState(task.state ?? "");
    setNext(task.next ?? "");
    setDue(task.due ?? "");
    setDueLabel(task.due_label ?? "");
  }, [editing, task.state, task.next, task.due, task.due_label]);
  useEffect(() => {
    if (!staffEdited.current && task.owner_staff && staffOptions.some((s) => s.id === task.owner_staff)) setStaff(task.owner_staff);
  }, [task.owner_staff, staffOptions]);
  useEffect(() => {
    if (composing) promptRef.current?.focus();
  }, [composing, requestKind]);

  const meta = parseJson<Record<string, unknown>>(task.meta, {});
  const metric = parseJson<Metric>(latest?.metric, null);
  const links = parseJson<Link[]>(latest?.links, []);
  const overdue = !!task.due && task.status !== "done" && task.due < todayIso();
  const bodyOpen = derived === "review" || expanded || editing;
  // done/waiting が derive で優先されても、実行中の run は別に検出する
  const activeRun = !!latest && ["queued", "claimed", "running"].includes(latest.status);
  const canRequest = !activeRun && busy === null && task.status !== "done" && task.status !== "waiting";
  const canRedo = !!latest && ["done", "failed"].includes(latest.status) && task.status !== "done" && task.status !== "waiting";
  const requestText = requestKind === "redo" ? redoPrompt : prompt;
  const setRequestText = requestKind === "redo" ? setRedoPrompt : setPrompt;

  async function act(name: string, body: Record<string, unknown>): Promise<boolean> {
    if (actionLock.current) return false;
    actionLock.current = true;
    setBusy(name);
    setErr(null);
    try {
      const res = await post(body);
      if (!res.ok) throw new Error(res.error || "失敗しました。");
      await onChanged();
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "失敗しました。");
      return false;
    } finally {
      actionLock.current = false;
      setBusy(null);
    }
  }
  function begin(kind: "first" | "redo" | "more") {
    setRequestKind(kind);
    setExpanded(true);
    setComposing(true);
  }
  function insertSource() {
    const preset = PRESETS.find((p) => p.id === sourceId);
    const text = sourceId === "previous" ? latest?.prompt : preset?.text;
    if (!text) return;
    // 入力中の文章を消さず、末尾へ挿入
    setRequestText((value) => (value.trim() ? `${value}\n\n${text}` : text));
    if (!task.owner_staff && !staffEdited.current) {
      const candidate = sourceId === "previous" ? staffOptions.find((s) => s.id === latest?.staff) : staffOptions.find((s) => s.role === preset?.role);
      if (candidate) setStaff(candidate.id);
    }
  }
  async function run(kind: "first" | "redo" | "more") {
    if (!canRequest) return;
    if (!requestText.trim()) {
      setErr("指示を書いてください。");
      promptRef.current?.focus();
      return;
    }
    if (!staffOptions.some((s) => s.id === staff)) {
      setErr("担当のAI社員を選んでください。");
      return;
    }
    const ok = await act(kind, { action: "run", taskId: task.id, prompt: requestText.trim(), kind, staff, route: task.route === "cloud" ? "cloud" : "local" });
    if (ok) {
      setComposing(false);
      if (kind === "redo") setRedoPrompt("");
    }
  }
  async function saveEdit() {
    const ok = await act("update", { action: "update", taskId: task.id, patch: { state, next, due, dueLabel, ownerStaff: staff } });
    if (ok) setEditing(false);
  }

  const showDetails = !!(latest && (latest.result || latest.files?.length || links.length || latest.prompt));

  return (
    <li className="rounded-lg border border-line bg-white/70 p-4 text-ink" style={{ borderLeft: `4px solid ${DERIVED_META[derived].color}` }}>
      <header className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
            <span>{pjLabel}</span>
            <span className="font-mono">{shortId(task)}</span>
            <Chip label={DERIVED_META[derived].label} color={DERIVED_META[derived].color} />
          </div>
          <h3 id={`${rowId}-title`} className="mt-1 text-base font-semibold leading-snug">
            {task.title}
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-1 text-sm text-ink-soft">
            担当：
            {task.owner_staff && <RoleBust role={task.owner_staff.split("-").pop() ?? ""} size={22} />}
            {roleLabel(task.owner_staff)}
            {task.due && (
              <span className={overdue ? "ml-3 font-semibold text-[#b3352e]" : "ml-3"}>
                {overdue ? "期限超過：" : `${task.due_label || "期限"}：`}
                {task.due}
              </span>
            )}
          </p>
          {derived === "working" && <p className="mt-1 text-sm text-ink-soft">いま：{latest?.progress || RUN_STATUS_LABEL[latest?.status ?? "queued"]}</p>}
          {derived !== "review" && !bodyOpen && latest?.summary && <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{latest.summary}</p>}
        </div>
        {derived !== "review" && (
          <button type="button" aria-expanded={bodyOpen} aria-controls={`${rowId}-body`} onClick={() => setExpanded((v) => !v)} className="action-secondary self-start">
            {bodyOpen ? "閉じる" : "開く"}
          </button>
        )}
      </header>

      <div id={`${rowId}-body`} hidden={!bodyOpen} className="mt-4 space-y-4">
        {/* 返答（日時・AI判定 → 要約 → 確認事項 → 指標 → 詳細・履歴）→ 確認操作 */}
        <section aria-labelledby={`${rowId}-title`} className="space-y-3 text-sm">
          {!latest ? (
            <p className="text-ink-faint">まだ返答はありません。</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-ink-soft">
                <span>{RUN_STATUS_LABEL[latest.status] ?? latest.status}</span>
                {latest.verdict && VERDICT_META[latest.verdict] && <Chip label={`AI判定：${VERDICT_META[latest.verdict].label}`} color={VERDICT_META[latest.verdict].color} />}
                {latest.kind && latest.kind !== "first" && (
                  <span className="rounded border border-line px-1.5 text-xs">{latest.kind === "redo" ? "修正" : latest.kind === "scheduled" ? "定常" : "追加"}</span>
                )}
                <span>{fmtTs(latest.finished_at ?? latest.started_at ?? latest.created_at)}</span>
                {latest.executed_by && <span className="text-xs text-ink-faint">{latest.executed_by}</span>}
              </div>
              {latest.status === "failed" && <p className="text-[#b3352e]">失敗: {latest.error ?? "理由不明"}</p>}
              {activeRun && latest.progress && (
                <p className="text-ink-soft">
                  いま: {latest.progress} <span className="text-ink-faint">{fmtTs(latest.progress_at)}</span>
                </p>
              )}
              {latest.summary && <p className="whitespace-pre-wrap text-base leading-relaxed text-ink">{latest.summary}</p>}
              {!!latest.asks?.length && (
                <div className="rounded border border-line bg-paper p-3">
                  <p className="font-semibold text-ink">確認してほしいこと</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-ink">
                    {latest.asks.map((ask, i) => (
                      <li key={i}>{ask}</li>
                    ))}
                  </ul>
                </div>
              )}
              {metric && <MetricPill metric={metric} />}
              {showDetails && (
                <details className="rounded border border-line bg-paper/60 px-3 py-2">
                  <summary className="cursor-pointer text-ink-soft">詳しい内容</summary>
                  {latest.result && <p className="mt-2 whitespace-pre-wrap leading-relaxed">{latest.result}</p>}
                  {latest.files && latest.files.length > 0 && (
                    <ul className="mt-2 space-y-0.5 font-mono text-xs text-ink-soft">
                      {latest.files.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  )}
                  {links.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {links.map((l, i) => (
                        <li key={i}>
                          <a href={l.url} target="_blank" rel="noreferrer" className="text-bronze-deep underline">
                            {l.label || l.url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  {latest.prompt && <p className="mt-2 whitespace-pre-wrap text-xs text-ink-faint">依頼文: {latest.prompt}</p>}
                </details>
              )}
              {runs.length > 1 && (
                <details className="text-ink-soft">
                  <summary className="cursor-pointer">過去の返答 {runs.length - 1} 件</summary>
                  <ul className="mt-1 space-y-1">
                    {runs.slice(1).map((r) => (
                      <li key={r.id} className="border-l-2 border-line pl-2">
                        <span className="mr-1">{fmtTs(r.finished_at ?? r.created_at)}</span>
                        {r.verdict && VERDICT_META[r.verdict] && <span className="mr-1">[AI判定：{VERDICT_META[r.verdict].label}]</span>}
                        {r.summary ?? r.error ?? RUN_STATUS_LABEL[r.status]}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}

          {/* 確認操作（返答の直下） */}
          <div className="flex flex-wrap gap-2">
            {derived === "review" && latest?.status === "done" && (
              <button type="button" className="action-primary" disabled={busy !== null || activeRun} onClick={() => void act("done", { action: "done", taskId: task.id })}>
                {busy === "done" ? "更新中…" : "OK・完了にする"}
              </button>
            )}
            {canRedo && (
              <button type="button" className="action-secondary" disabled={!canRequest} onClick={() => begin("redo")}>
                {latest?.status === "failed" ? "再依頼を書く" : "修正内容を書く"}
              </button>
            )}
            {task.status !== "done" && task.status !== "waiting" && (
              <button type="button" className="action-secondary" disabled={!canRequest} onClick={() => begin(latest ? "more" : "first")}>
                {latest ? "追加の指示を書く" : "指示を書く"}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {task.status === "done" && (
              <button type="button" className="action-secondary" disabled={busy !== null || activeRun} onClick={() => void act("reopen", { action: "reopen", taskId: task.id })}>
                再開する
              </button>
            )}
            {task.status === "waiting" && (
              <button type="button" className="action-secondary" disabled={busy !== null || activeRun} onClick={() => void act("reopen", { action: "reopen", taskId: task.id })}>
                受領して再開
              </button>
            )}
            {task.status !== "done" && task.status !== "waiting" && (
              <button type="button" className="action-secondary" disabled={busy !== null || activeRun} onClick={() => void act("waiting", { action: "waiting", taskId: task.id })}>
                先方待ちにする
              </button>
            )}
          </div>
        </section>

        {/* 指示の入力（書いてから送る） */}
        <div hidden={!composing} className="rounded border border-bronze/40 bg-bronze/5 p-3">
          <p className="mb-2 text-sm font-semibold">{requestKind === "redo" ? "修正・再依頼の内容" : "今回の指示"}</p>
          <div className="mb-2 flex flex-wrap gap-2">
            <select aria-label="指示の材料" value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="min-w-0 rounded border border-line bg-paper px-2 text-sm">
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
              {latest?.prompt && <option value="previous">前回の依頼文</option>}
            </select>
            <button type="button" className="action-secondary" onClick={insertSource}>
              {requestText.trim() ? "指示の末尾に挿入" : "指示に入れる"}
            </button>
          </div>
          <label className="mb-1 block text-xs text-ink-soft" htmlFor={`${rowId}-staff`}>
            担当の AI社員
          </label>
          <select
            id={`${rowId}-staff`}
            value={staff}
            onChange={(e) => {
              staffEdited.current = true;
              setStaff(e.target.value);
            }}
            className="mb-2 w-full rounded border border-line bg-paper px-2 text-sm"
          >
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name.split("／")[1] ?? s.role}
              </option>
            ))}
          </select>
          <label className="mb-1 block text-xs text-ink-soft" htmlFor={`${rowId}-prompt`}>
            指示（何を・どの材料で・どこまで）
          </label>
          <textarea
            id={`${rowId}-prompt`}
            ref={promptRef}
            value={requestText}
            onChange={(e) => setRequestText(e.target.value)}
            rows={4}
            className="w-full rounded border border-line bg-paper px-2 py-1.5 text-sm leading-relaxed"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="action-primary" disabled={!canRequest} onClick={() => void run(requestKind)}>
              {busy === requestKind ? "登録中…" : requestKind === "redo" ? "修正・再依頼を送る" : "この指示で実行"}
            </button>
            <button type="button" className="action-secondary" onClick={() => setComposing(false)}>
              入力欄を閉じる
            </button>
          </div>
        </div>

        {/* タスクの背景・状況 */}
        <details className="rounded border border-line px-3 py-2 text-sm" open={editing || undefined}>
          <summary className="cursor-pointer text-ink-soft">タスクの背景・状況を編集</summary>
          <div className="mt-2 space-y-2">
            <p className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
              {task.task_group && <span>区分 {task.task_group}（{GROUP_LABEL[task.task_group] ?? ""}）</span>}
              {task.wbs_id && (
                <a href={`/rank-tracker/wbs#${encodeURIComponent(task.wbs_id)}`} className="font-mono underline decoration-dotted underline-offset-2 hover:text-bronze-deep" title={wbsInfo ? `${wbsInfo.task}（期限 ${wbsInfo.due}）` : "WBS で開く"}>
                  WBS {task.wbs_id}
                  {wbsInfo ? `・${WBS_ST_LABEL[wbsInfo.st] ?? wbsInfo.st}` : ""}
                </a>
              )}
              {task.route === "cloud" && <span className="rounded border border-line px-1">cloud</span>}
            </p>
            {!editing ? (
              <>
                {task.state && <p className="leading-relaxed">現在地: {task.state}</p>}
                {task.next && <p className="leading-relaxed">次: {task.next}</p>}
                {typeof meta.goal === "string" && <p className="text-ink-soft leading-relaxed">目的: {meta.goal}</p>}
                {typeof meta.promised === "string" && <p className="text-ink-soft leading-relaxed">約束: {meta.promised}</p>}
                {typeof meta.dep === "string" && <p className="text-ink-faint leading-relaxed">WBS メモ: {meta.dep}</p>}
                <button type="button" className="action-secondary" onClick={() => setEditing(true)}>
                  状況を編集
                </button>
              </>
            ) : (
              <div className="space-y-2">
                <label className="block text-xs text-ink-soft" htmlFor={`${rowId}-state`}>
                  現在地
                </label>
                <input id={`${rowId}-state`} value={state} onChange={(e) => setState(e.target.value)} className="w-full rounded border border-line bg-paper px-2" />
                <label className="block text-xs text-ink-soft" htmlFor={`${rowId}-next`}>
                  次にやること
                </label>
                <input id={`${rowId}-next`} value={next} onChange={(e) => setNext(e.target.value)} className="w-full rounded border border-line bg-paper px-2" />
                <div className="flex flex-wrap gap-2">
                  <label className="text-xs text-ink-soft">
                    期限
                    <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="ml-1 rounded border border-line bg-paper px-2" />
                  </label>
                  <label className="text-xs text-ink-soft">
                    期限の名前（8字）
                    <input value={dueLabel} onChange={(e) => setDueLabel(e.target.value.slice(0, 8))} className="ml-1 rounded border border-line bg-paper px-2" />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="action-primary" disabled={busy !== null} onClick={() => void saveEdit()}>
                    {busy === "update" ? "保存中…" : "保存"}
                  </button>
                  <button type="button" className="action-secondary" onClick={() => setEditing(false)}>
                    やめる
                  </button>
                </div>
              </div>
            )}
          </div>
        </details>
      </div>

      {err && (
        <p role="alert" className="mt-3 text-sm text-[#b3352e]">
          {err}
        </p>
      )}
    </li>
  );
}

function AddTaskForm({
  pjs,
  pjLabel,
  staffByPj,
  initialPj,
  onDone,
}: {
  pjs: string[];
  pjLabel: (p: string) => string;
  staffByPj: Record<string, StaffRow[]>;
  initialPj?: string;
  onDone: () => void;
}) {
  const first = initialPj && pjs.includes(initialPj) ? initialPj : pjs[0] ?? "";
  const [pj, setPj] = useState(first);
  const [staff, setStaff] = useState(staffByPj[first]?.find((s) => s.role === "leader")?.id ?? staffByPj[first]?.[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [due, setDue] = useState("");
  const [dueLabel, setDueLabel] = useState("");
  const [wbsId, setWbsId] = useState("");
  const [runNow, setRunNow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const changePj = (p: string) => {
    setPj(p);
    setStaff(staffByPj[p]?.find((s) => s.role === "leader")?.id ?? staffByPj[p]?.[0]?.id ?? "");
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setErr("題名を入れてください。");
      return;
    }
    if (runNow && !prompt.trim()) {
      setErr("すぐ実行するには指示が必要です。");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await post({ action: "addTask", pj, title: title.trim(), staff, prompt: prompt.trim(), due, dueLabel, wbsId: wbsId.trim(), runNow });
      if (!res.ok) throw new Error(res.error || "追加に失敗しました。");
      onDone();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "追加に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-sm">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs text-ink-soft">
          案件
          <select value={pj} onChange={(e) => changePj(e.target.value)} className="mt-1 w-full rounded border border-line bg-paper px-2">
            {pjs.map((p) => (
              <option key={p} value={p}>
                {pjLabel(p)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-ink-soft">
          担当
          <select value={staff} onChange={(e) => setStaff(e.target.value)} className="mt-1 w-full rounded border border-line bg-paper px-2">
            {(staffByPj[pj] ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name.split("／")[1] ?? s.role}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-xs text-ink-soft">
        題名
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded border border-line bg-paper px-2" required />
      </label>
      <label className="block text-xs text-ink-soft">
        指示（何を・どの材料で・どこまで）
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} className="mt-1 w-full rounded border border-line bg-paper px-2 py-1.5 leading-relaxed" />
      </label>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block text-xs text-ink-soft">
          期限
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="mt-1 w-full rounded border border-line bg-paper px-2" />
        </label>
        <label className="block text-xs text-ink-soft">
          期限の名前（8字）
          <input value={dueLabel} onChange={(e) => setDueLabel(e.target.value.slice(0, 8))} className="mt-1 w-full rounded border border-line bg-paper px-2" />
        </label>
        <label className="block text-xs text-ink-soft">
          WBS ID（任意）
          <input value={wbsId} onChange={(e) => setWbsId(e.target.value)} className="mt-1 w-full rounded border border-line bg-paper px-2" />
        </label>
      </div>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={runNow} onChange={(e) => setRunNow(e.target.checked)} />
        すぐ実行する（指示を派遣係に渡す）
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="action-primary">
          {busy ? "追加中…" : runNow ? "追加して実行" : "追加"}
        </button>
      </div>
      {err && (
        <p role="alert" className="text-[#b3352e]">
          {err}
        </p>
      )}
    </form>
  );
}
