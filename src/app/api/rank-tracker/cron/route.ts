// 定期自動計測API（Vercel Cronが叩く）。
// BigQuery の tracked_keywords テーブルから enabled=true の追跡キーワードを読み、
// 順に計測して serp_results へ蓄積する。
// Vercel Cron は CRON_SECRET 設定時に Authorization: Bearer を自動付与するため、
// それを検証して外部からの無断実行を弾く。
import { NextResponse } from "next/server";
import { searchJina } from "@/lib/rank-tracker/jina";
import { insertResults, listTrackedKeywords } from "@/lib/rank-tracker/bigquery";

export const runtime = "nodejs";
// 複数KWを順に計測する。VercelはProプランなので300秒まで延長できる。
export const maxDuration = 300;

export async function GET(request: Request) {
  // middleware は cron を Basic認証の対象外にするため、この検証が cron の唯一のゲート。
  // CRON_SECRET 未設定なら fail-closed（誰も叩けない）で開放を防ぐ。Vercel Cron は
  // CRON_SECRET 設定時に Authorization: Bearer を自動付与するため、常に照合する。
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) {
    console.error("[rank-tracker] JINA_API_KEY が未設定です（cron）。");
    return NextResponse.json({ ok: false, error: "JINA未設定" }, { status: 500 });
  }

  // enabled な追跡キーワードを取得。取得自体が失敗したら計測せず500。
  let tracked;
  try {
    tracked = await listTrackedKeywords({ enabledOnly: true });
  } catch (err) {
    console.error("[rank-tracker] 追跡キーワードの取得に失敗しました（cron）:", err);
    return NextResponse.json({ ok: false, error: "追跡キーワードの取得に失敗しました。" }, { status: 500 });
  }

  // 同じキーワードは複数サイトで登録されていても JINA は1回だけ叩く（SERPはKW依存・サイト非依存）。
  // domain は is_target 計算用の代表値でよい（読み取り時は @target で再判定するため）。
  const byKeyword = new Map<string, string>();
  for (const t of tracked) {
    if (!byKeyword.has(t.keyword)) byKeyword.set(t.keyword, t.target_domain);
  }

  const checkedAt = new Date().toISOString();
  const summary: Array<{ keyword: string; count: number; inserted: number; error?: string }> = [];

  for (const [keyword, domain] of byKeyword) {
    try {
      const results = await searchJina(keyword, apiKey, { num: 100 });
      const inserted =
        results.length > 0 ? await insertResults(results, keyword, domain, checkedAt) : 0;
      summary.push({ keyword, count: results.length, inserted });
    } catch (err) {
      console.error(`[rank-tracker] cron計測に失敗しました (${keyword}):`, err);
      summary.push({ keyword, count: 0, inserted: 0, error: "failed" });
    }
  }

  return NextResponse.json({ ok: true, checkedAt, count: byKeyword.size, summary });
}
