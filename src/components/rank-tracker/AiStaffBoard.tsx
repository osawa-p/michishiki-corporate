"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BoardData, RunRow, StaffRow, TaskRow } from "@/lib/rank-tracker/ai-staff";
import { DERIVED_META, deriveTask as derive, type Derived } from "@/lib/rank-tracker/ai-staff-view";
import AiStaffOffice from "./AiStaffOffice";

// AI社員ボード（管理者専用・クライアント部品）。
// 画面の状態は runs から決まる: 最新 run が queued/claimed/running なら「作業中」、done/failed なら「確認待ち」。
// 大沢が「OK・完了にする」を押すと tasks.status=done。「修正を頼む」は kind=redo の新しい run になる。
// データの読み書きは /api/rank-tracker/ai-staff（管理者専用）。

const API = "/api/rank-tracker/ai-staff";
// オフィスの動きが追えるよう15秒ごとに更新（タブが見えているときだけ）
const POLL_MS = 15_000;

const VERDICT_META: Record<string, { label: string; color: string }> = {
  done: { label: "完了", color: "#0ca30c" },
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

type Metric =
  | { label?: string; before?: number; after?: number; unit?: string; better?: string; note?: string; text?: string }
  | null;
type Link = { label?: string; url?: string };

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
const WBS_ST_LABEL: Record<string, string> = { todo: "未着手", doing: "進行中", wait: "待ち", done: "完了" };

export default function AiStaffBoard({ initial, loadError, wbs }: { initial: BoardData | null; loadError: boolean; wbs?: Record<string, WbsInfo> }) {
  const [data, setData] = useState<BoardData | null>(initial);
  const [error, setError] = useState<string | null>(loadError ? "ボードの取得に失敗しました。BigQuery の接続を確認してください。" : null);
  const [refreshing, setRefreshing] = useState(false);
  const [pj, setPj] = useState<string>("all");
  const [role, setRole] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<Derived | "all">("all");
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const timer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(API, { cache: "no-store" });
      const json = (await res.json()) as { ok: boolean; error?: string } & Partial<BoardData>;
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData({ staff: json.staff ?? [], tasks: json.tasks ?? [], runs: json.runs ?? [], generatedAt: json.generatedAt ?? new Date().toISOString() });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新に失敗しました。");
    } finally {
      setRefreshing(false);
    }
  }, []);

  const [showOffice, setShowOffice] = useState(true);

  // WBS ページからのリンク（?q=M-37）で検索欄を初期化
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("q");
    if (p) setQ(p);
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

  const runsByTask = useMemo(() => {
    const m: Record<string, RunRow[]> = {};
    for (const r of data?.runs ?? []) (m[r.task_id] ||= []).push(r); // runs は created_at 降順
    return m;
  }, [data]);

  const rows = useMemo(() => {
    const list = (data?.tasks ?? []).map((t) => {
      const runs = runsByTask[t.id] ?? [];
      return { task: t, runs, latest: runs[0], derived: derive(t, runs[0]) };
    });
    const ql = q.trim().toLowerCase();
    return list
      .filter((r) => pj === "all" || r.task.pj === pj)
      .filter((r) => role === "all" || (r.task.owner_staff ?? "").endsWith(`-${role}`))
      .filter((r) => stateFilter === "all" || r.derived === stateFilter)
      .filter((r) => !ql || `${r.task.id} ${r.task.wbs_id ?? ""} ${r.task.title} ${r.task.state ?? ""} ${r.task.next ?? ""} ${r.latest?.summary ?? ""}`.toLowerCase().includes(ql))
      .sort((a, b) => {
        const d = DERIVED_META[a.derived].order - DERIVED_META[b.derived].order;
        if (d) return d;
        if (a.task.pj !== b.task.pj) return a.task.pj.localeCompare(b.task.pj);
        const g = (a.task.task_group ?? "").localeCompare(b.task.task_group ?? "");
        if (g) return g;
        return (a.task.ord ?? 0) - (b.task.ord ?? 0);
      });
  }, [data, runsByTask, pj, role, stateFilter, q]);

  const counts = useMemo(() => {
    const c: Record<Derived, number> = { review: 0, working: 0, open: 0, waiting: 0, done: 0 };
    for (const t of data?.tasks ?? []) c[derive(t, (runsByTask[t.id] ?? [])[0])]++;
    return c;
  }, [data, runsByTask]);

  const pjs = useMemo(() => Object.keys(staffByPj).sort(), [staffByPj]);

  return (
    <div className="space-y-6">
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

      {/* 件数と絞り込み */}
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(DERIVED_META) as Derived[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setStateFilter(stateFilter === k ? "all" : k)}
            aria-pressed={stateFilter === k}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors ${
              stateFilter === k ? "border-bronze bg-bronze/10 text-bronze-deep font-semibold" : "border-line text-ink-soft hover:border-bronze"
            }`}
          >
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: DERIVED_META[k].color }} aria-hidden />
            {DERIVED_META[k].label}
            <span className="font-mono">{counts[k]}</span>
          </button>
        ))}
        <span className="ml-auto flex items-center gap-2 text-xs text-ink-faint">
          {data && <span>更新 {fmtTs(data.generatedAt)}</span>}
          <button type="button" onClick={() => setShowOffice((v) => !v)} className="rounded border border-line px-3 py-1 hover:border-bronze" aria-pressed={showOffice}>
            {showOffice ? "オフィスを隠す" : "オフィスを表示"}
          </button>
          <button type="button" onClick={() => void refresh()} disabled={refreshing} className="rounded border border-line px-3 py-1 hover:border-bronze disabled:opacity-50">
            {refreshing ? "更新中…" : "更新"}
          </button>
          <button type="button" onClick={() => setShowAdd((v) => !v)} className="rounded border border-bronze px-3 py-1 text-bronze-deep hover:bg-bronze/10">
            {showAdd ? "追加を閉じる" : "＋ タスクを追加"}
          </button>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select value={pj} onChange={(e) => setPj(e.target.value)} className="rounded border border-line bg-paper px-2 py-1" aria-label="案件で絞り込み">
          <option value="all">全案件</option>
          {pjs.map((p) => (
            <option key={p} value={p}>
              {pjLabel(p)}
            </option>
          ))}
        </select>
        <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded border border-line bg-paper px-2 py-1" aria-label="担当で絞り込み">
          <option value="all">全担当</option>
          {roles.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="検索（ID・題名・状況・返答）" className="min-w-[220px] flex-1 rounded border border-line bg-paper px-2 py-1" aria-label="検索" />
        <span className="text-xs text-ink-faint">{rows.length} 件</span>
      </div>

      {showAdd && data && (
        <AddTaskForm
          pjs={pjs}
          pjLabel={pjLabel}
          staffByPj={staffByPj}
          onDone={() => {
            setShowAdd(false);
            void refresh();
          }}
        />
      )}

      {/* 一覧（タスクと担当｜指示｜返答｜確認） */}
      <div className="hidden lg:grid grid-cols-[1.1fr_1.2fr_1.5fr_0.7fr] gap-4 border-b border-line pb-2 text-[11px] tracking-[0.2em] uppercase text-ink-faint">
        <div>タスクと担当</div>
        <div>指示</div>
        <div>返答</div>
        <div>確認</div>
      </div>
      {rows.length === 0 && <p className="text-sm text-ink-faint">該当するタスクがありません。</p>}
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
    </div>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-soft">
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} aria-hidden />
      {label}
    </span>
  );
}

function MetricPill({ metric }: { metric: Metric }) {
  if (!metric || typeof metric !== "object") return null;
  if (typeof metric.text === "string" && metric.before === undefined) {
    return (
      <span className="inline-block rounded border border-line bg-paper px-2 py-0.5 text-[11px]" title={metric.note ?? ""}>
        {metric.label ? `${metric.label}: ` : ""}
        {metric.text}
      </span>
    );
  }
  const b = Number(metric.before), a = Number(metric.after);
  if (!Number.isFinite(b) || !Number.isFinite(a)) return null;
  const up = a > b, same = a === b;
  const improved = same ? null : metric.better === "down" ? !up : up;
  const mark = same ? "→" : improved ? "▼改善" : "▲悪化";
  const color = same ? "#8b877c" : improved ? "#0ca30c" : "#b3352e";
  return (
    <span className="inline-flex items-center gap-1 rounded border border-line bg-paper px-2 py-0.5 text-[11px]" title={metric.note ?? ""}>
      {metric.label && <span className="text-ink-faint">{metric.label}</span>}
      <span className="font-mono">
        {b}
        {metric.unit ?? ""} → {a}
        {metric.unit ?? ""}
      </span>
      <span style={{ color }} className="font-semibold">
        {mark}
      </span>
    </span>
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
  const [staff, setStaff] = useState(task.owner_staff ?? staffOptions[0]?.id ?? "");
  const [prompt, setPrompt] = useState(task.prompt ?? latest?.prompt ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState(task.state ?? "");
  const [next, setNext] = useState(task.next ?? "");
  const [due, setDue] = useState(task.due ?? "");
  const [dueLabel, setDueLabel] = useState(task.due_label ?? "");
  const promptRef = useRef<HTMLTextAreaElement | null>(null);

  // サーバー側の更新（派遣係の書き戻し）を反映
  useEffect(() => {
    setState(task.state ?? "");
    setNext(task.next ?? "");
    setDue(task.due ?? "");
    setDueLabel(task.due_label ?? "");
    if (task.owner_staff) setStaff(task.owner_staff);
  }, [task.state, task.next, task.due, task.due_label, task.owner_staff]);

  const meta = parseJson<Record<string, unknown>>(task.meta, {});
  const metric = parseJson<Metric>(latest?.metric, null);
  const links = parseJson<Link[]>(latest?.links, []);
  const working = derived === "working";
  const canRedo = !!latest && (latest.status === "done" || latest.status === "failed") && task.status !== "done";
  const overdue = !!task.due && task.status !== "done" && task.due < todayIso();

  async function act(name: string, body: Record<string, unknown>) {
    setBusy(name);
    setErr(null);
    try {
      const res = await post(body);
      if (!res.ok) throw new Error(res.error || "失敗しました。");
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "失敗しました。");
    } finally {
      setBusy(null);
    }
  }
  const run = (kind: "first" | "redo" | "more") => {
    if (!prompt.trim()) {
      setErr("指示を書いてください。");
      promptRef.current?.focus();
      return;
    }
    return act(kind, { action: "run", taskId: task.id, prompt: prompt.trim(), kind, staff, route: task.route === "cloud" ? "cloud" : "local" });
  };
  const saveEdit = () => act("update", { action: "update", taskId: task.id, patch: { state, next, due, dueLabel, ownerStaff: staff } }).then(() => setEditing(false));

  return (
    <li className="rounded-lg border border-line bg-white/60 p-4 lg:grid lg:grid-cols-[1.1fr_1.2fr_1.5fr_0.7fr] lg:gap-4 space-y-4 lg:space-y-0" style={{ borderLeft: `4px solid ${DERIVED_META[derived].color}` }}>
      {/* タスクと担当 */}
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-faint">
          <span className="rounded bg-ink/5 px-1.5 py-0.5 font-semibold text-ink-soft">{pjLabel}</span>
          <span className="font-mono">{shortId(task)}</span>
          {task.task_group && <span title={GROUP_LABEL[task.task_group] ?? ""}>区分 {task.task_group}</span>}
          {task.wbs_id && (
            <a
              href={`/rank-tracker/wbs#${encodeURIComponent(task.wbs_id)}`}
              className="font-mono underline decoration-dotted underline-offset-2 hover:text-bronze-deep"
              title={wbsInfo ? `${wbsInfo.task}（期限 ${wbsInfo.due}）` : "WBS で開く"}
            >
              WBS {task.wbs_id}
              {wbsInfo ? `・${WBS_ST_LABEL[wbsInfo.st] ?? wbsInfo.st}` : ""}
            </a>
          )}
          <Chip label={DERIVED_META[derived].label} color={DERIVED_META[derived].color} />
        </div>
        <p className="text-sm font-semibold leading-snug">{task.title}</p>
        <p className="text-xs text-ink-soft">
          担当: <span className="font-medium">{roleLabel(task.owner_staff)}</span>
          {task.route === "cloud" && <span className="ml-2 rounded border border-line px-1 text-[10px]">cloud</span>}
        </p>
        {!editing ? (
          <>
            {task.state && <p className="text-xs text-ink-soft leading-relaxed">現在地: {task.state}</p>}
            {task.next && <p className="text-xs text-ink-soft leading-relaxed">次: {task.next}</p>}
            {task.due && (
              <p className={`text-xs ${overdue ? "text-[#b3352e] font-semibold" : "text-ink-faint"}`}>
                {task.due_label ? `${task.due_label} ` : "期限 "}
                {task.due}
                {overdue ? "（超過）" : ""}
              </p>
            )}
            {typeof meta.goal === "string" && <p className="text-[11px] text-ink-faint leading-relaxed">目的: {meta.goal}</p>}
            {typeof meta.promised === "string" && <p className="text-[11px] text-ink-faint leading-relaxed">約束: {meta.promised}</p>}
            <button type="button" onClick={() => setEditing(true)} className="text-[11px] text-ink-faint underline hover:text-bronze-deep">
              状況を編集
            </button>
          </>
        ) : (
          <div className="space-y-1.5 text-xs">
            <input value={state} onChange={(e) => setState(e.target.value)} placeholder="現在地" className="w-full rounded border border-line bg-paper px-2 py-1" aria-label="現在地" />
            <input value={next} onChange={(e) => setNext(e.target.value)} placeholder="次にやること" className="w-full rounded border border-line bg-paper px-2 py-1" aria-label="次にやること" />
            <div className="flex gap-1.5">
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="rounded border border-line bg-paper px-2 py-1" aria-label="期限" />
              <input value={dueLabel} onChange={(e) => setDueLabel(e.target.value.slice(0, 8))} placeholder="期限の名前（8字）" className="flex-1 rounded border border-line bg-paper px-2 py-1" aria-label="期限の名前" />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void saveEdit()} disabled={busy !== null} className="rounded bg-bronze px-3 py-1 text-white disabled:opacity-50">
                保存
              </button>
              <button type="button" onClick={() => setEditing(false)} className="rounded border border-line px-3 py-1">
                やめる
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 指示 */}
      <div className="min-w-0 space-y-2">
        <select value={staff} onChange={(e) => setStaff(e.target.value)} className="w-full rounded border border-line bg-paper px-2 py-1 text-xs" aria-label="担当の AI社員">
          {staffOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name.split("／")[1] ?? s.role}
            </option>
          ))}
        </select>
        <textarea
          ref={promptRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={5}
          placeholder="この AI社員への指示。何を・どの材料で・どこまで。"
          className="w-full rounded border border-line bg-paper px-2 py-1.5 text-xs leading-relaxed"
          aria-label="指示"
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void run(latest ? "more" : "first")} disabled={busy !== null || working || task.status === "done"} className="rounded bg-bronze px-3 py-1 text-xs font-semibold text-white hover:bg-bronze-deep disabled:opacity-50">
            {busy === "first" || busy === "more" ? "登録中…" : working ? "作業中" : latest ? "追加で頼む" : "実行"}
          </button>
          {canRedo && (
            <button type="button" onClick={() => void run("redo")} disabled={busy !== null} className="rounded border border-bronze px-3 py-1 text-xs text-bronze-deep hover:bg-bronze/10 disabled:opacity-50">
              {busy === "redo" ? "登録中…" : "修正を頼む"}
            </button>
          )}
        </div>
        {err && (
          <p role="alert" className="text-[11px] text-[#b3352e]">
            {err}
          </p>
        )}
      </div>

      {/* 返答 */}
      <div className="min-w-0 space-y-2 text-xs">
        {!latest ? (
          <p className="text-ink-faint">まだ返答はありません。</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-ink-faint">{RUN_STATUS_LABEL[latest.status] ?? latest.status}</span>
              {latest.verdict && VERDICT_META[latest.verdict] && <Chip label={VERDICT_META[latest.verdict].label} color={VERDICT_META[latest.verdict].color} />}
              {latest.kind && latest.kind !== "first" && (
                <span className="rounded border border-line px-1 text-[10px]">{latest.kind === "redo" ? "修正" : latest.kind === "scheduled" ? "定常" : "追加"}</span>
              )}
              <span className="text-ink-faint">{fmtTs(latest.finished_at ?? latest.started_at ?? latest.created_at)}</span>
              {latest.executed_by && <span className="text-[10px] text-ink-faint">{latest.executed_by}</span>}
            </div>
            {latest.status === "failed" && <p className="text-[#b3352e]">失敗: {latest.error ?? "理由不明"}</p>}
            {(latest.status === "running" || latest.status === "claimed") && latest.progress && (
              <p className="text-ink-soft">
                いま: {latest.progress} <span className="text-ink-faint">{fmtTs(latest.progress_at)}</span>
              </p>
            )}
            {latest.summary && <p className="leading-relaxed">{latest.summary}</p>}
            {metric && <MetricPill metric={metric} />}
            {latest.asks && latest.asks.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-4 text-ink-soft">
                {latest.asks.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            )}
            {(latest.result || (latest.files && latest.files.length) || links.length > 0) && (
              <details className="rounded border border-line bg-paper/60 px-2 py-1">
                <summary className="cursor-pointer text-ink-faint">詳しい内容</summary>
                {latest.result && <p className="mt-1 whitespace-pre-wrap leading-relaxed">{latest.result}</p>}
                {latest.files && latest.files.length > 0 && (
                  <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-ink-soft">
                    {latest.files.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                )}
                {links.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {links.map((l, i) => (
                      <li key={i}>
                        <a href={l.url} target="_blank" rel="noreferrer" className="text-bronze-deep underline">
                          {l.label || l.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {latest.prompt && <p className="mt-2 text-[11px] text-ink-faint whitespace-pre-wrap">依頼文: {latest.prompt}</p>}
              </details>
            )}
            {runs.length > 1 && (
              <details className="text-ink-faint">
                <summary className="cursor-pointer">過去の返答 {runs.length - 1} 件</summary>
                <ul className="mt-1 space-y-1">
                  {runs.slice(1).map((r) => (
                    <li key={r.id} className="border-l-2 border-line pl-2">
                      <span className="mr-1">{fmtTs(r.finished_at ?? r.created_at)}</span>
                      {r.verdict && VERDICT_META[r.verdict] && <span className="mr-1">[{VERDICT_META[r.verdict].label}]</span>}
                      {r.summary ?? r.error ?? RUN_STATUS_LABEL[r.status]}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>

      {/* 確認 */}
      <div className="flex flex-wrap gap-2 lg:flex-col lg:items-stretch">
        {task.status !== "done" && (
          <button type="button" onClick={() => void act("done", { action: "done", taskId: task.id })} disabled={busy !== null} className="rounded border border-[#0ca30c]/50 px-3 py-1 text-xs text-[#0a7d0a] hover:bg-[#0ca30c]/10 disabled:opacity-50">
            {busy === "done" ? "更新中…" : "OK・完了にする"}
          </button>
        )}
        {task.status === "done" && (
          <button type="button" onClick={() => void act("reopen", { action: "reopen", taskId: task.id })} disabled={busy !== null} className="rounded border border-line px-3 py-1 text-xs hover:border-bronze disabled:opacity-50">
            再開する
          </button>
        )}
        {task.status === "waiting" ? (
          <button type="button" onClick={() => void act("reopen", { action: "reopen", taskId: task.id })} disabled={busy !== null} className="rounded border border-line px-3 py-1 text-xs hover:border-bronze disabled:opacity-50">
            受領済みにする
          </button>
        ) : (
          task.status !== "done" && (
            <button type="button" onClick={() => void act("waiting", { action: "waiting", taskId: task.id })} disabled={busy !== null} className="rounded border border-line px-3 py-1 text-xs text-ink-soft hover:border-bronze disabled:opacity-50">
              先方待ちにする
            </button>
          )
        )}
      </div>
    </li>
  );
}

function AddTaskForm({
  pjs,
  pjLabel,
  staffByPj,
  onDone,
}: {
  pjs: string[];
  pjLabel: (p: string) => string;
  staffByPj: Record<string, StaffRow[]>;
  onDone: () => void;
}) {
  const [pj, setPj] = useState(pjs[0] ?? "");
  const [staff, setStaff] = useState(staffByPj[pjs[0] ?? ""]?.[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [due, setDue] = useState("");
  const [dueLabel, setDueLabel] = useState("");
  const [wbsId, setWbsId] = useState("");
  const [runNow, setRunNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const changePj = (p: string) => {
    setPj(p);
    setStaff(staffByPj[p]?.[0]?.id ?? "");
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
    <form onSubmit={submit} className="rounded-lg border border-bronze/40 bg-bronze/5 p-4 space-y-2 text-xs">
      <p className="text-sm font-semibold">タスクを追加（区分 X）</p>
      <div className="grid gap-2 md:grid-cols-[160px_160px_1fr]">
        <select value={pj} onChange={(e) => changePj(e.target.value)} className="rounded border border-line bg-paper px-2 py-1" aria-label="案件">
          {pjs.map((p) => (
            <option key={p} value={p}>
              {pjLabel(p)}
            </option>
          ))}
        </select>
        <select value={staff} onChange={(e) => setStaff(e.target.value)} className="rounded border border-line bg-paper px-2 py-1" aria-label="担当">
          {(staffByPj[pj] ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name.split("／")[1] ?? s.role}
            </option>
          ))}
        </select>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="題名" className="rounded border border-line bg-paper px-2 py-1" aria-label="題名" required />
      </div>
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} placeholder="指示（何を・どの材料で・どこまで）" className="w-full rounded border border-line bg-paper px-2 py-1.5 leading-relaxed" aria-label="指示" />
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="rounded border border-line bg-paper px-2 py-1" aria-label="期限" />
        <input value={dueLabel} onChange={(e) => setDueLabel(e.target.value.slice(0, 8))} placeholder="期限の名前（8字）" className="rounded border border-line bg-paper px-2 py-1" aria-label="期限の名前" />
        <input value={wbsId} onChange={(e) => setWbsId(e.target.value)} placeholder="WBS ID（任意）" className="w-28 rounded border border-line bg-paper px-2 py-1" aria-label="WBS ID" />
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={runNow} onChange={(e) => setRunNow(e.target.checked)} />
          すぐ実行する
        </label>
        <button type="submit" disabled={busy} className="ml-auto rounded bg-bronze px-4 py-1.5 font-semibold text-white hover:bg-bronze-deep disabled:opacity-50">
          {busy ? "追加中…" : "追加"}
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
