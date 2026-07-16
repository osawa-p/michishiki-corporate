// 週次AI提案の生成API（Vercel Cronが毎週月曜 JST 7:00 に叩く）。
// seo_sites の有効サイトごとに、GSC/GA4の蓄積データからClaudeで提案を生成し
// seo_proposals へ保存する。同一週の二重生成は冪等ガードでスキップ。
// middleware は本パスを認証対象外にしており、CRON_SECRET の Bearer 照合が唯一のゲート。
import { NextResponse } from "next/server";
import { listSeoSites, hasProposalsForWeek } from "@/lib/seo-monitor/bigquery";
import {
  generateProposalsForSite,
  currentWeekMonday,
  type GenerationResult,
} from "@/lib/seo-monitor/proposals-gen";
import { invalidateSeoCache } from "@/lib/seo-monitor/cached";

export const runtime = "nodejs";
export const maxDuration = 300;

const TIME_BUDGET_MS = 240_000;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[seo-monitor] ANTHROPIC_API_KEY が未設定です（proposals-cron）。");
    return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY 未設定" }, { status: 500 });
  }

  let sites;
  try {
    sites = (await listSeoSites()).filter((s) => s.gsc_enabled || s.ga4_enabled);
  } catch (err) {
    console.error("[seo-monitor] seo_sites の取得に失敗しました（proposals-cron）:", err);
    return NextResponse.json({ ok: false, error: "サイト設定の取得に失敗しました。" }, { status: 500 });
  }

  const week = currentWeekMonday();
  const startedAt = Date.now();
  const results: GenerationResult[] = [];
  let timedOut = false;

  for (const s of sites) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      timedOut = true;
      break;
    }
    try {
      if (await hasProposalsForWeek(s.site, week)) {
        results.push({ site: s.site, generated: 0, skipped: true });
        continue;
      }
      results.push(await generateProposalsForSite(s, week));
    } catch (err) {
      console.error(`[seo-monitor] 提案生成に失敗 (${s.site}):`, err);
      results.push({
        site: s.site,
        generated: 0,
        error: err instanceof Error ? err.message : "failed",
      });
    }
  }

  invalidateSeoCache();

  const failed = results.filter((r) => r.error).length;
  const ok = results.length === 0 || failed < results.length;
  return NextResponse.json(
    { ok, week, sites: results.length, failed, timedOut, results },
    { status: ok ? 200 : 500 }
  );
}
