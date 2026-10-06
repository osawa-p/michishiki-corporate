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

// 社員1体の「いまの状態」。優先順: 作業中 > 受付（派遣係の確保待ち）> 確認待ちを抱えている > 待機
export type SeatState = "working" | "queued" | "review" | "idle";
export type Seat = {
  staff: StaffRow;
  state: SeatState;
  current: { taskId: string; title: string; startedAt: string | null; runStatus: string } | null;
  queuedCount: number;
  reviewCount: number;
  openCount: number;
  doneCount: number;
};

export function buildSeats(staff: StaffRow[], tasks: TaskRow[], runs: RunRow[]): Seat[] {
  const taskById: Record<string, TaskRow> = Object.fromEntries(tasks.map((t) => [t.id, t]));
  const latestByTask: Record<string, RunRow> = {};
  for (const r of runs) if (!latestByTask[r.task_id]) latestByTask[r.task_id] = r; // runs は created_at 降順
  return staff.map((s) => {
    let current: Seat["current"] = null;
    let queuedCount = 0, reviewCount = 0, openCount = 0, doneCount = 0;
    for (const t of tasks) {
      const latest = latestByTask[t.id];
      const mine = (latest?.staff ?? t.owner_staff) === s.id;
      if (!mine) continue;
      const d = deriveTask(t, latest);
      if (d === "working" && latest) {
        if (latest.status === "queued") queuedCount++;
        else if (!current) current = { taskId: t.id, title: t.title, startedAt: latest.started_at, runStatus: latest.status };
      } else if (d === "review") reviewCount++;
      else if (d === "open") openCount++;
      else if (d === "done") doneCount++;
    }
    const state: SeatState = current ? "working" : queuedCount ? "queued" : reviewCount ? "review" : "idle";
    void taskById;
    return { staff: s, state, current, queuedCount, reviewCount, openCount, doneCount };
  });
}
