// AI社員ボードの表示用ロジック（純粋関数のみ。サーバー依存なし。クライアント部品から import する）
import type { RunRow, StaffRow, TaskRow } from "./ai-staff";

// タスクの表示状態。runs から決まる: 最新 run が queued/claimed/running なら作業中、done/failed なら確認待ち
export type Derived = "review" | "working" | "open" | "waiting" | "done";
export const DERIVED_META: Record<Derived, { label: string; color: string; order: number }> = {
  review: { label: "確認待ち", color: "#2a78d6", order: 0 },
  working: { label: "作業中", color: "#fab219", order: 1 },
  open: { label: "未指示", color: "#8b877c", order: 2 },
  waiting: { label: "先方待ち", color: "#b07cc6", order: 3 },
  done: { label: "完了", color: "#0ca30c", order: 4 },
};

export function deriveTask(task: TaskRow, latest: RunRow | undefined): Derived {
  if (task.status === "done") return "done";
  if (task.status === "waiting") return "waiting";
  if (latest && (latest.status === "queued" || latest.status === "claimed" || latest.status === "running")) return "working";
  if (latest && (latest.status === "done" || latest.status === "failed")) return "review";
  return "open";
}

// タスク件数（単位はタスク）。queued は working の内数（queued/claimed）、failed は review の内数
export type Counts = Record<Derived, number> & { queued: number; failed: number };

export function latestRuns(runs: RunRow[]): Map<string, RunRow> {
  const latest = new Map<string, RunRow>();
  for (const r of runs) if (!latest.has(r.task_id)) latest.set(r.task_id, r); // runs は created_at 降順
  return latest;
}

export function countTasks(tasks: TaskRow[], latest: Map<string, RunRow>): Counts {
  const c: Counts = { review: 0, working: 0, open: 0, waiting: 0, done: 0, queued: 0, failed: 0 };
  for (const t of tasks) {
    const r = latest.get(t.id);
    const d = deriveTask(t, r);
    c[d]++;
    if (d === "working" && r?.status !== "running") c.queued++;
    if (d === "review" && r?.status === "failed") c.failed++;
  }
  return c;
}

// 社員1体の「いまの状態」。稼働状態（作業中／受付／待機）と、抱えている確認待ち・失敗・先方待ちは別々に持つ
export type SeatState = "working" | "queued" | "review" | "idle";
export type Seat = {
  staff: StaffRow;
  state: SeatState;
  current: {
    taskId: string;
    title: string;
    startedAt: string | null;
    createdAt: string | null;
    runStatus: string;
    progress: string | null;
    progressAt: string | null;
  } | null;
  counts: Counts;
  reviewTitle: string | null; // 最も古い確認待ちの題名（確認候補）
  queuedCount: number;
  reviewCount: number;
  openCount: number;
  doneCount: number;
};

export function buildSeats(staff: StaffRow[], tasks: TaskRow[], runs: RunRow[]): Seat[] {
  const latest = latestRuns(runs);
  const age = (a: TaskRow, b: TaskRow) =>
    (Date.parse(latest.get(a.id)?.created_at ?? "") || 0) - (Date.parse(latest.get(b.id)?.created_at ?? "") || 0) || a.id.localeCompare(b.id);
  return staff.map((s) => {
    const own = tasks.filter((t) => t.pj === s.pj && (latest.get(t.id)?.staff ?? t.owner_staff) === s.id);
    const c = countTasks(own, latest);
    // 表示する実行は running 優先、その中では古い依頼から。確認候補も古い依頼から
    const active = own
      .filter((t) => deriveTask(t, latest.get(t.id)) === "working")
      .sort((a, b) => Number(latest.get(b.id)?.status === "running") - Number(latest.get(a.id)?.status === "running") || age(a, b));
    const review = own.filter((t) => deriveTask(t, latest.get(t.id)) === "review").sort(age)[0];
    const t = active[0];
    const r = t ? latest.get(t.id) : undefined;
    const current: Seat["current"] =
      t && r
        ? {
            taskId: t.id,
            title: t.title,
            startedAt: r.started_at ?? null,
            createdAt: r.created_at ?? null,
            runStatus: r.status,
            progress: r.progress ?? null,
            progressAt: r.progress_at ?? null,
          }
        : null;
    return {
      staff: s,
      state: r?.status === "running" ? "working" : r ? "queued" : c.review ? "review" : "idle",
      current,
      counts: c,
      reviewTitle: review?.title ?? null,
      queuedCount: c.queued,
      reviewCount: c.review,
      openCount: c.open,
      doneCount: c.done,
    };
  });
}
