// AI社員ボードのデータ層（BigQuery ai_staff）。管理者専用。
// 仕様の正: F:\michi\ops\ai-shain\要件定義_AI社員システム_2026-10-06.md 第10章。
// 書き込みは全て DML。ここで queued にした run を、手元 PC の派遣係
// （michi 側 scripts/ai-staff-dispatch.mjs・5分間隔）が確保して Claude Code で処理し、結果を書き戻す。
// 読み取りはキャッシュしない（rank-tracker の24時間キャッシュとは分ける）。

import { runQuery } from "./bigquery";

const GCP_PROJECT = process.env.GCP_PROJECT ?? "tidal-fusion-439015-e8";
const DS = process.env.AI_STAFF_DATASET ?? "ai_staff";
const T = (name: string) => `\`${GCP_PROJECT}.${DS}.${name}\``;
const TS = (col: string) => `FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', ${col})`;

export type StaffRow = {
  id: string;
  pj: string;
  role: string;
  name: string; // 「案件名／役割名」
  scope: string | null;
};

export type TaskStatus = "open" | "queued" | "running" | "review" | "done" | "waiting";
export type TaskRow = {
  id: string;
  pj: string;
  task_group: string | null;
  ord: number | null;
  title: string;
  state: string | null;
  next: string | null;
  owner_staff: string | null;
  due: string | null; // YYYY-MM-DD
  due_label: string | null;
  status: TaskStatus;
  self_done: boolean | null;
  route: string | null;
  wbs_id: string | null;
  prompt: string | null;
  meta: string | null; // JSON 文字列（goal/promised/theme/area など）
  created_at: string | null;
  updated_at: string | null;
  version: number | null;
};

export type RunStatus = "queued" | "claimed" | "running" | "done" | "failed";
export type RunRow = {
  id: string;
  task_id: string;
  staff: string | null;
  kind: string | null;
  prompt: string | null;
  status: RunStatus;
  route: string | null;
  created_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  summary: string | null;
  verdict: string | null;
  asks: string[] | null;
  metric: string | null; // JSON 文字列
  result: string | null;
  files: string[] | null;
  links: string | null; // JSON 文字列
  executed_by: string | null;
  error: string | null;
  progress: string | null; // 派遣係が書く最新の工程（例: GA4 を取得中）
  progress_at: string | null;
};

export type BoardData = { staff: StaffRow[]; tasks: TaskRow[]; runs: RunRow[]; generatedAt: string };

const RUN_LIMIT = 800;

export async function loadBoard(): Promise<BoardData> {
  const [staff, tasks, runs] = await Promise.all([
    runQuery<StaffRow>({
      query: `SELECT id, pj, role, name, scope FROM ${T("staff")} WHERE enabled ORDER BY pj, role`,
    }),
    runQuery<TaskRow>({
      query: `SELECT id, pj, task_group, ord, title, state, next, owner_staff, CAST(due AS STRING) AS due, due_label,
  status, self_done, route, wbs_id, prompt, TO_JSON_STRING(meta) AS meta,
  ${TS("created_at")} AS created_at, ${TS("updated_at")} AS updated_at, version
FROM ${T("tasks")}
ORDER BY pj, task_group, ord, id`,
    }),
    runQuery<RunRow>({
      query: `SELECT id, task_id, staff, kind, prompt, status, route,
  ${TS("created_at")} AS created_at, ${TS("started_at")} AS started_at, ${TS("finished_at")} AS finished_at,
  summary, verdict, asks, TO_JSON_STRING(metric) AS metric, result, files, TO_JSON_STRING(links) AS links,
  executed_by, error, progress, ${TS("progress_at")} AS progress_at
FROM ${T("runs")}
ORDER BY created_at DESC
LIMIT ${RUN_LIMIT}`,
    }),
  ]);
  return {
    staff: staff.rows,
    tasks: tasks.rows.map((t) => ({ ...t, ord: t.ord == null ? null : Number(t.ord), version: t.version == null ? null : Number(t.version) })),
    runs: runs.rows,
    generatedAt: new Date().toISOString(),
  };
}

// WBS ID ごとの最新返答（WBS ページに出す）。同じ WBS ID を複数タスクが持つときは最新の run を採る
export type WbsAiLatestRow = {
  wbs_id: string;
  task_id: string;
  task_status: string;
  summary: string | null;
  verdict: string | null;
  run_status: string;
  finished_at: string | null;
  created_at: string | null;
};
export async function loadLatestByWbs(): Promise<Record<string, WbsAiLatestRow>> {
  const { rows } = await runQuery<WbsAiLatestRow>({
    query: `SELECT t.wbs_id, t.id AS task_id, t.status AS task_status, r.summary, r.verdict, r.status AS run_status,
  ${TS("r.finished_at")} AS finished_at, ${TS("r.created_at")} AS created_at
FROM ${T("tasks")} t JOIN ${T("runs")} r ON r.task_id = t.id
WHERE t.wbs_id IS NOT NULL
QUALIFY ROW_NUMBER() OVER (PARTITION BY t.wbs_id ORDER BY r.created_at DESC) = 1`,
  });
  return Object.fromEntries(rows.map((r) => [r.wbs_id, r]));
}

function newRunId(): string {
  return `run_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export type RunKind = "first" | "redo" | "more";

// 依頼を queued で登録する。派遣係が拾う。
export async function createRun(input: { taskId: string; prompt: string; kind: RunKind; staff: string; route: "local" | "cloud" }): Promise<string> {
  const id = newRunId();
  await runQuery({
    query: `INSERT INTO ${T("runs")} (id, task_id, staff, kind, prompt, status, route, created_at, version)
VALUES (@id, @taskId, NULLIF(@staff, ''), @kind, @prompt, 'queued', @route, CURRENT_TIMESTAMP(), 1)`,
    params: { id, taskId: input.taskId, staff: input.staff, kind: input.kind, prompt: input.prompt, route: input.route },
  });
  await runQuery({
    query: `UPDATE ${T("tasks")} SET status = 'queued', owner_staff = IF(@staff = '', owner_staff, @staff),
  updated_at = CURRENT_TIMESTAMP(), version = IFNULL(version, 0) + 1 WHERE id = @taskId`,
    params: { taskId: input.taskId, staff: input.staff },
  });
  await runQuery({
    query: `INSERT INTO ${T("events")} (run_id, ts, type, note) VALUES (@id, CURRENT_TIMESTAMP(), 'queued', @note)`,
    params: { id, note: `board:${input.kind}:${input.route}` },
  });
  return id;
}

// ボードからの追加タスク（区分 X）。prompt があれば同時に依頼も登録する。
export async function createTask(input: {
  pj: string;
  title: string;
  staff: string;
  prompt: string;
  due: string;
  dueLabel: string;
  wbsId: string;
  runNow: boolean;
}): Promise<{ taskId: string; runId: string | null }> {
  const { rows } = await runQuery<{ n: number | string }>({
    query: `SELECT IFNULL(MAX(ord), 0) + 1 AS n FROM ${T("tasks")} WHERE pj = @pj AND task_group = 'X'`,
    params: { pj: input.pj },
  });
  const n = Number(rows[0]?.n ?? 1);
  const taskId = `${input.pj}-X${n}`;
  await runQuery({
    query: `INSERT INTO ${T("tasks")} (id, pj, task_group, ord, title, state, next, owner_staff, due, due_label, status, self_done, route, wbs_id, prompt, created_at, updated_at, version)
VALUES (@id, @pj, 'X', @ord, @title, '未着手', '', NULLIF(@staff, ''), SAFE.PARSE_DATE('%F', NULLIF(@due, '')), NULLIF(@dueLabel, ''), 'open', FALSE, 'local', NULLIF(@wbsId, ''), NULLIF(@prompt, ''), CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), 1)`,
    params: { id: taskId, pj: input.pj, ord: n, title: input.title, staff: input.staff, due: input.due, dueLabel: input.dueLabel, wbsId: input.wbsId, prompt: input.prompt },
  });
  let runId: string | null = null;
  if (input.runNow && input.prompt) {
    runId = await createRun({ taskId, prompt: input.prompt, kind: "first", staff: input.staff, route: "local" });
  }
  return { taskId, runId };
}

// 確認列の操作: done（OK・完了にする）／open（再開・受領済みにする）／waiting（先方待ちにする）
export async function setTaskStatus(id: string, status: "done" | "open" | "waiting"): Promise<void> {
  await runQuery({
    query: `UPDATE ${T("tasks")} SET status = @status, updated_at = CURRENT_TIMESTAMP(), version = IFNULL(version, 0) + 1 WHERE id = @id`,
    params: { id, status },
  });
}

export type TaskPatch = { title?: string; state?: string; next?: string; due?: string; dueLabel?: string; ownerStaff?: string; route?: string; prompt?: string };

export async function updateTask(id: string, patch: TaskPatch): Promise<void> {
  const sets: string[] = ["updated_at = CURRENT_TIMESTAMP()", "version = IFNULL(version, 0) + 1"];
  const params: Record<string, unknown> = { id };
  if (patch.title !== undefined) { sets.push("title = @title"); params.title = patch.title; }
  if (patch.state !== undefined) { sets.push("state = @state"); params.state = patch.state; }
  if (patch.next !== undefined) { sets.push("next = @next"); params.next = patch.next; }
  if (patch.due !== undefined) { sets.push("due = SAFE.PARSE_DATE('%F', NULLIF(@due, ''))"); params.due = patch.due; }
  if (patch.dueLabel !== undefined) { sets.push("due_label = NULLIF(@dueLabel, '')"); params.dueLabel = patch.dueLabel; }
  if (patch.ownerStaff !== undefined) { sets.push("owner_staff = NULLIF(@ownerStaff, '')"); params.ownerStaff = patch.ownerStaff; }
  if (patch.route !== undefined) { sets.push("route = @route"); params.route = patch.route; }
  if (patch.prompt !== undefined) { sets.push("prompt = NULLIF(@prompt, '')"); params.prompt = patch.prompt; }
  await runQuery({ query: `UPDATE ${T("tasks")} SET ${sets.join(", ")} WHERE id = @id`, params });
}
