// ユーザー単位レポートの経路ビュー用API（許可サイトのみ。admin は全サイト）。
//   GET ?site=example.com&user=<user_key> → そのユーザーのセッション履歴（時系列）
import { NextResponse } from "next/server";
import { requireAccessApi, canViewDomain } from "@/lib/rank-tracker/auth";
import { targetKey, isValidTargetDomain } from "@/lib/rank-tracker/domain";
import { fetchUserJourney } from "@/lib/seo-monitor/bigquery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { access, error } = await requireAccessApi();
  if (error) return error;

  const params = new URL(request.url).searchParams;
  const site = targetKey(params.get("site") ?? "");
  const user = params.get("user") ?? "";
  if (!isValidTargetDomain(site) || !user || user.length > 200) {
    return NextResponse.json({ ok: false, error: "site / user が不正です。" }, { status: 400 });
  }
  if (!canViewDomain(access!, site)) {
    return NextResponse.json({ ok: false, error: "このサイトの閲覧権限がありません。" }, { status: 403 });
  }

  try {
    const sessions = await fetchUserJourney(site, user);
    return NextResponse.json({ ok: true, sessions });
  } catch (err) {
    console.error("[seo-monitor] 経路の取得に失敗:", err);
    return NextResponse.json({ ok: false, error: "取得に失敗しました。" }, { status: 500 });
  }
}
