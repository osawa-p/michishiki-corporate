// 定期自動計測API（Vercel Cronが毎日叩く）。
// tracked_keywords から「停止以外かつ next_run_at が期限切れ」のキーワードを読み、
// 期限の古い順に計測して serp_results へ蓄積し、計測分の next_run_at を頻度に応じて先送りする。
// Vercel Cron は CRON_SECRET 設定時に Authorization: Bearer を自動付与するため、
// それを検証して外部からの無断実行を弾く。
import { NextResponse } from "next/server";
import { searchJina } from "@/lib/rank-tracker/jina";
import { insertResults, listTrackedKeywords, markMeasured } from "@/lib/rank-tracker/bigquery";
import { invalidateRankTrackerCache } from "@/lib/rank-tracker/cached";

export const runtime = "nodejs";
// 複数KWを順に計測する。VercelはProプランなので300秒まで延長できる。
export const maxDuration = 300;

// 1回のcron実行で計測するキーワード数の上限。超過分は翌日の実行に回る
// （期限の古い順に処理するため取り残しは発生しない）。
const MAX_KEYWORDS_PER_RUN = Number(process.env.CRON_MAX_KEYWORDS ?? 15);
// 新しいキーワードの計測を開始しない残り時間のしきい値（maxDuration に対する余白）
const TIME_BUDGET_MS = 240_000;

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

  // 期限切れの追跡キーワードを取得。取得自体が失敗したら計測せず500。
  let due;
  try {
    due = await listTrackedKeywords({ dueOnly: true });
  } catch (err) {
    console.error("[rank-tracker] 追跡キーワードの取得に失敗しました（cron）:", err);
    return NextResponse.json(
      { ok: false, error: "追跡キーワードの取得に失敗しました。" },
      { status: 500 }
    );
  }

  // 同じキーワードは複数サイトで登録されていても JINA は1回だけ叩く（SERPはKW依存・サイト非依存）。
  // domain は is_target 計算用の代表値でよい（読み取り時は @target で再判定するため）。
  const byKeyword = new Map<string, string>();
  for (const t of due) {
    if (!byKeyword.has(t.keyword)) byKeyword.set(t.keyword, t.target_domain);
  }
  const queue = [...byKeyword].slice(0, MAX_KEYWORDS_PER_RUN);

  const startedAt = Date.now();
  const checkedAt = new Date().toISOString();
  const summary: Array<{ keyword: string; count: number; inserted: number; error?: string }> = [];
  const measured: string[] = [];
  let timedOut = false;

  for (const [keyword, domain] of queue) {
    // 実行時間の残りが少なければ新しい計測を始めない（途中殺しを防ぐ）。
    // 未計測分は next_run_at が動かないため翌日の実行で最優先になる。
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      timedOut = true;
      break;
    }
    try {
      const results = await searchJina(keyword, apiKey, { num: 100 });
      const inserted =
        results.length > 0 ? await insertResults(results, keyword, domain, checkedAt) : 0;
      summary.push({ keyword, count: results.length, inserted });
      measured.push(keyword);
    } catch (err) {
      console.error(`[rank-tracker] cron計測に失敗しました (${keyword}):`, err);
      summary.push({
        keyword,
        count: 0,
        inserted: 0,
        error: err instanceof Error ? err.message : "failed",
      });
    }
  }

  // 計測できたキーワードだけ次回取得日時を先送りする（失敗分は翌日再試行）
  try {
    if (measured.length > 0) await markMeasured(measured);
  } catch (err) {
    console.error("[rank-tracker] next_run_at の更新に失敗しました（cron）:", err);
  }

  // 読み取りキャッシュを無効化して新しい計測結果を反映
  invalidateRankTrackerCache();

  // 期限対象があったのに1件も計測できなかった場合は失敗として返す
  // （JINAキー失効などを「静かな成功」にしない）。
  const failed = summary.filter((s) => s.error).length;
  const ok = queue.length === 0 || measured.length > 0;
  return NextResponse.json(
    {
      ok,
      checkedAt,
      due: byKeyword.size,
      attempted: summary.length,
      measured: measured.length,
      failed,
      deferred: byKeyword.size - summary.length,
      timedOut,
      summary,
    },
    { status: ok ? 200 : 500 }
  );
}
