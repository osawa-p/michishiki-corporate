// 週次AI提案の対応記録API。
//   GET  ?site= → 提案一覧
//   PATCH {id, status, memo} → ステータス・メモの更新（提案の生成はPhase 2のcronが担う）
// 閲覧・更新とも管理者のみ（当面は運用者専用機能のため）。
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/rank-tracker/auth";
import { listProposals, updateProposal } from "@/lib/seo-monitor/bigquery";
import { invalidateSeoCache } from "@/lib/seo-monitor/cached";
import { isProposalStatus } from "@/lib/seo-monitor/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { error } = await requireAdminApi();
  if (error) return error;
  const site = new URL(request.url).searchParams.get("site") ?? undefined;
  try {
    const items = await listProposals(site || undefined);
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    console.error("[seo-monitor] 提案一覧の取得に失敗:", err);
    return NextResponse.json({ ok: false, error: "取得に失敗しました。" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const { error } = await requireAdminApi();
  if (error) return error;
  let body: { id?: unknown; status?: unknown; memo?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const id = typeof body.id === "string" && body.id.length > 0 && body.id.length <= 100 ? body.id : null;
  const memo =
    body.memo == null || body.memo === ""
      ? null
      : typeof body.memo === "string" && body.memo.length <= 2000
        ? body.memo.trim()
        : undefined;
  if (!id || !isProposalStatus(body.status) || memo === undefined) {
    return NextResponse.json(
      { ok: false, error: "id・status・memo のいずれかが不正です（メモは2000文字まで）。" },
      { status: 400 }
    );
  }

  try {
    const updated = await updateProposal(id, body.status, memo);
    if (!updated) {
      return NextResponse.json({ ok: false, error: "対象の提案が見つかりません。" }, { status: 404 });
    }
    invalidateSeoCache();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[seo-monitor] 提案の更新に失敗:", err);
    return NextResponse.json({ ok: false, error: "更新に失敗しました。" }, { status: 500 });
  }
}
