// 履歴読み取りAPI。
//   ?domain=...            → 各キーワードの最新順位サマリ
//   ?domain=...&keyword=.. → そのキーワードの順位推移
import { NextResponse } from "next/server";
import { fetchLatestRanks, fetchRankTrend } from "@/lib/rank-tracker/bigquery";
import { DEFAULT_TARGET_DOMAIN } from "@/lib/rank-tracker/keywords";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get("domain")?.trim() || DEFAULT_TARGET_DOMAIN;
  const keyword = searchParams.get("keyword")?.trim();

  try {
    if (keyword) {
      const trend = await fetchRankTrend(keyword, domain);
      return NextResponse.json({ ok: true, domain, keyword, trend });
    }
    const latest = await fetchLatestRanks(domain);
    return NextResponse.json({ ok: true, domain, latest });
  } catch (err) {
    console.error("[rank-tracker] 履歴取得に失敗しました:", err);
    return NextResponse.json({ ok: false, error: "履歴取得に失敗しました。" }, { status: 500 });
  }
}
