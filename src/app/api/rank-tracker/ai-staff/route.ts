// AI社員ボード API（管理者専用）。
//   GET  → ボード全体（staff / tasks / runs）
//   POST {action, ...} →
//     run      {taskId, prompt, kind, staff, route}  依頼を queued で登録（派遣係が処理）
//     addTask  {pj, title, staff, prompt, due, dueLabel, wbsId, runNow}
//     done / reopen / waiting {taskId}               確認列の操作
//     update   {taskId, patch}                       タスク欄の編集
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/rank-tracker/auth";
import {
  loadBoard,
  createRun,
  createTask,
  setTaskStatus,
  updateTask,
  type RunKind,
  type TaskPatch,
} from "@/lib/rank-tracker/ai-staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PJ_RE = /^[a-z0-9-]{1,40}$/;
const ID_RE = /^[A-Za-z0-9_.-]{1,80}$/;
const KINDS = new Set<RunKind>(["first", "redo", "more"]);

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function GET() {
  const { error } = await requireAdminApi();
  if (error) return error;
  try {
    const data = await loadBoard();
    return NextResponse.json({ ok: true, ...data });
  } catch (err) {
    console.error("[ai-staff] ボードの取得に失敗:", err);
    return bad("ボードの取得に失敗しました。", 500);
  }
}

export async function POST(request: Request) {
  const { error } = await requireAdminApi();
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return bad("Invalid JSON body");
  }
  const action = str(body.action, 20);

  try {
    if (action === "run") {
      const taskId = str(body.taskId, 80);
      const prompt = str(body.prompt, 6000);
      const kind = str(body.kind, 10) as RunKind;
      const staff = str(body.staff, 80);
      const route = str(body.route, 10) === "cloud" ? "cloud" : "local";
      if (!ID_RE.test(taskId) || !prompt || !KINDS.has(kind) || (staff && !ID_RE.test(staff))) {
        return bad("taskId / prompt / kind / staff の形式が正しくありません。");
      }
      const runId = await createRun({ taskId, prompt, kind, staff, route });
      return NextResponse.json({ ok: true, runId });
    }

    if (action === "addTask") {
      const pj = str(body.pj, 40);
      const title = str(body.title, 200);
      const staff = str(body.staff, 80);
      const prompt = str(body.prompt, 6000);
      const due = str(body.due, 10);
      const dueLabel = str(body.dueLabel, 8);
      const wbsId = str(body.wbsId, 20);
      const runNow = body.runNow === true;
      if (!PJ_RE.test(pj) || !title || (staff && !ID_RE.test(staff)) || (due && !/^\d{4}-\d{2}-\d{2}$/.test(due))) {
        return bad("pj / title / staff / due の形式が正しくありません。");
      }
      const res = await createTask({ pj, title, staff, prompt, due, dueLabel, wbsId, runNow });
      return NextResponse.json({ ok: true, ...res });
    }

    if (action === "done" || action === "reopen" || action === "waiting") {
      const taskId = str(body.taskId, 80);
      if (!ID_RE.test(taskId)) return bad("taskId の形式が正しくありません。");
      await setTaskStatus(taskId, action === "done" ? "done" : action === "waiting" ? "waiting" : "open");
      return NextResponse.json({ ok: true });
    }

    if (action === "update") {
      const taskId = str(body.taskId, 80);
      const raw = (body.patch && typeof body.patch === "object" ? body.patch : {}) as Record<string, unknown>;
      if (!ID_RE.test(taskId)) return bad("taskId の形式が正しくありません。");
      const patch: TaskPatch = {};
      if (raw.title !== undefined) patch.title = str(raw.title, 200);
      if (raw.state !== undefined) patch.state = str(raw.state, 400);
      if (raw.next !== undefined) patch.next = str(raw.next, 400);
      if (raw.due !== undefined) {
        const d = str(raw.due, 10);
        if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return bad("due は YYYY-MM-DD で指定してください。");
        patch.due = d;
      }
      if (raw.dueLabel !== undefined) patch.dueLabel = str(raw.dueLabel, 8);
      if (raw.ownerStaff !== undefined) {
        const s = str(raw.ownerStaff, 80);
        if (s && !ID_RE.test(s)) return bad("ownerStaff の形式が正しくありません。");
        patch.ownerStaff = s;
      }
      if (raw.route !== undefined) patch.route = str(raw.route, 10) === "cloud" ? "cloud" : "local";
      if (raw.prompt !== undefined) patch.prompt = str(raw.prompt, 6000);
      if (patch.title === "") return bad("title は空にできません。");
      await updateTask(taskId, patch);
      return NextResponse.json({ ok: true });
    }

    return bad("不明な action です。");
  } catch (err) {
    console.error(`[ai-staff] ${action} に失敗:`, err);
    return bad("処理に失敗しました。", 500);
  }
}
