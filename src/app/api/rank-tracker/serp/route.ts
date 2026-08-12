// SERP詳細API: 指定キーワードの最新計測1回分のSERP全件（順位×URL×ドメイン×タイトル）を返す。
//   ?domain=...&keyword=...
// ダッシュボード個別分析の「SERP詳細」がキーワード選択時にオンデマンドで呼ぶ。
// 読み取りはタグ付きキャッシュ（新しい計測・編集で即時無効化）。
import { NextResponse } from "next/server";
import { getLatestSerpCached, getTrackedKeywordsCached } from "@/lib/rank-tracker/cached";
import { requireAccessApi, canViewDomain } from "@/lib/rank-tracker/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { access, error } = await requireAccessApi();
  if (error) return error;
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get("domain")?.trim() ?? "";
  const keyword = searchParams.get("keyword")?.trim() ?? "";
  if (!domain || !keyword) {
    return NextResponse.json(
      { ok: false, error: "domain と keyword を指定してください。" },
      { status: 400 }
    );
  }
  // 閲覧のみメンバーは許可されたサイトのデータしか読めない
  if (!canViewDomain(access!, domain)) {
    return NextResponse.json(
      { ok: false, error: "このサイトの閲覧権限がありません。" },
      { status: 403 }
    );
  }

  try {
    // そのサイトに登録済みのキーワードに限定する（他サイトのキーワード探りを防ぐ）
    const tracked = await getTrackedKeywordsCached(domain);
    if (!tracked.some((t) => t.keyword === keyword)) {
      return NextResponse.json(
        { ok: false, error: "このサイトに登録されていないキーワードです。" },
        { status: 404 }
      );
    }
    const serp = await getLatestSerpCached(keyword);
    return NextResponse.json({ ok: true, domain, keyword, serp });
  } catch (err) {
    console.error("[rank-tracker] SERP詳細の取得に失敗しました:", err);
    return NextResponse.json(
      { ok: false, error: "SERP詳細の取得に失敗しました。" },
      { status: 500 }
    );
  }
}
