// 履歴読み取りAPI。
//   ?domain=...                                  → 各キーワードの最新順位サマリ（前回差付き）
//   ?domain=...&keyword=..&range=30              → そのキーワードの順位推移（rangeは日数、0=全期間）
//   ?domain=...&keyword=..&competitors=a,b       → 競合込みの推移（最大3ドメイン）
//   ?domain=...&keyword=..&withCandidates=1      → 競合候補リストも同時に返す
import { NextResponse } from "next/server";
import {
  fetchLatestRanks,
  fetchTrendWithCompetitors,
  listCompetitorCandidates,
} from "@/lib/rank-tracker/bigquery";
import { DEFAULT_TARGET_DOMAIN } from "@/lib/rank-tracker/keywords";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get("domain")?.trim() || DEFAULT_TARGET_DOMAIN;
  const keyword = searchParams.get("keyword")?.trim();
  // onlyTracked=1 で tracked_keywords に登録済みのキーワードのみに絞る（サイト別ダッシュボード用）
  const onlyTracked = searchParams.get("onlyTracked") === "1";
  // range: 取得期間（日数）。0または未指定は全期間
  const rawRange = Number(searchParams.get("range") ?? 0);
  const fromDays = Number.isFinite(rawRange) ? Math.max(0, Math.trunc(rawRange)) : 0;
  const competitors = (searchParams.get("competitors") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  const withCandidates = searchParams.get("withCandidates") === "1";

  try {
    if (keyword) {
      // series は競合なしでも常に同じ形（ranks に自社ドメインのみ）で返す
      const [series, candidates] = await Promise.all([
        fetchTrendWithCompetitors(keyword, domain, competitors, { fromDays }),
        withCandidates ? listCompetitorCandidates(keyword, domain, { fromDays }) : null,
      ]);
      return NextResponse.json({
        ok: true,
        domain,
        keyword,
        series,
        ...(candidates !== null ? { candidates } : {}),
      });
    }
    const latest = await fetchLatestRanks(domain, { onlyTracked });
    return NextResponse.json({ ok: true, domain, latest });
  } catch (err) {
    console.error("[rank-tracker] 履歴取得に失敗しました:", err);
    return NextResponse.json({ ok: false, error: "履歴取得に失敗しました。" }, { status: 500 });
  }
}
