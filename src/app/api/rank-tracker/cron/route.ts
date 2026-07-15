// 定期自動計測API（Vercel Cronが毎日叩く）。
// tracked_keywords から「停止以外かつ next_run_at が期限切れ」のキーワードを読み、
// 期限の古い順に計測して serp_results へ蓄積し、計測分の next_run_at を頻度に応じて先送りする。
// Vercel Cron は CRON_SECRET 設定時に Authorization: Bearer を自動付与するため、
// それを検証して外部からの無断実行を弾く。
import { NextResponse } from "next/server";
import { searchJina } from "@/lib/rank-tracker/jina";
import {
  insertResults,
  listTrackedKeywords,
  markMeasured,
  listSiteSettings,
  fetchMonthlyConsumption,
} from "@/lib/rank-tracker/bigquery";
import { DEFAULT_SITE_SETTINGS, type SiteSettings } from "@/lib/rank-tracker/limits";
import { invalidateRankTrackerCache } from "@/lib/rank-tracker/cached";

export const runtime = "nodejs";
// 複数KWを順に計測する。VercelはProプランなので300秒まで延長できる。
export const maxDuration = 300;

// 1回のcron実行で計測するキーワード数の上限。超過分は翌日の実行に回る
// （期限の古い順に処理するため取り残しは発生しない）。
// 環境変数が非数値・0以下のときは既定値15に落とす（NaN で全計測停止させない）。
const rawMax = Number(process.env.CRON_MAX_KEYWORDS ?? 15);
const MAX_KEYWORDS_PER_RUN = Number.isFinite(rawMax) && rawMax > 0 ? Math.trunc(rawMax) : 15;
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

  // 期限切れの追跡キーワード・サイト設定・当月消費を取得。失敗したら計測せず500。
  let due, settingsList, consumption;
  try {
    [due, settingsList, consumption] = await Promise.all([
      listTrackedKeywords({ dueOnly: true }),
      listSiteSettings(),
      fetchMonthlyConsumption(),
    ]);
  } catch (err) {
    console.error("[rank-tracker] 追跡キーワードの取得に失敗しました（cron）:", err);
    return NextResponse.json(
      { ok: false, error: "追跡キーワードの取得に失敗しました。" },
      { status: 500 }
    );
  }

  const settingsBy = new Map<string, SiteSettings>(settingsList.map((s) => [s.domain, s]));
  const usedBy = new Map(consumption.map((c) => [c.domain, c.tokens]));
  const settingsOf = (domain: string): SiteSettings =>
    settingsBy.get(domain) ?? { domain, ...DEFAULT_SITE_SETTINGS };
  // 月間クレジット予算に達したサイトは、そのサイトだけが必要とするキーワードを計測しない
  // （翌月に予算が戻れば期限切れ扱いで再開する）
  const isOverBudget = (domain: string): boolean => {
    const s = settingsOf(domain);
    return s.monthly_budget != null && (usedBy.get(domain) ?? 0) >= s.monthly_budget;
  };
  const eligible = due.filter((t) => !isOverBudget(t.target_domain));
  const skippedByBudget = due.length - eligible.length;

  // 同じキーワードは複数サイトで登録されていても JINA は1回だけ叩く（SERPはKW依存・サイト非依存）。
  // domain は is_target 計算用の代表値。深度は対象サイトの設定の最大値を使う。
  const byKeyword = new Map<string, { domain: string; depth: number }>();
  for (const t of eligible) {
    const depth = settingsOf(t.target_domain).max_depth;
    const cur = byKeyword.get(t.keyword);
    if (!cur) byKeyword.set(t.keyword, { domain: t.target_domain, depth });
    else cur.depth = Math.max(cur.depth, depth);
  }
  const queue = [...byKeyword].slice(0, MAX_KEYWORDS_PER_RUN);

  const startedAt = Date.now();
  const checkedAt = new Date().toISOString();
  const summary: Array<{ keyword: string; count: number; inserted: number; error?: string }> = [];
  const measured: string[] = [];
  let timedOut = false;

  for (const [keyword, { domain, depth }] of queue) {
    // 実行時間の残りが少なければ新しい計測を始めない（途中殺しを防ぐ）。
    // 未計測分は next_run_at が動かないため翌日の実行で最優先になる。
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      timedOut = true;
      break;
    }
    try {
      const results = await searchJina(keyword, apiKey, { num: depth });
      const inserted =
        results.length > 0 ? await insertResults(results, keyword, domain, checkedAt) : 0;
      // スケジュール送りは1件ずつ即時に行う。ループ後にまとめると、Vercel の
      // 300秒キルに遭ったとき計測済み分まで翌日再計測（トークン二重消費）になるため。
      try {
        await markMeasured([keyword]);
      } catch (err) {
        console.error(`[rank-tracker] next_run_at の更新に失敗しました (${keyword}):`, err);
      }
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
      skippedByBudget,
      timedOut,
      summary,
    },
    { status: ok ? 200 : 500 }
  );
}
