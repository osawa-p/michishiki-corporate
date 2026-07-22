// SEO観測ツールの日次取り込みAPI（Vercel Cronが毎朝叩く）。
// 本関数は日次データ取り込みのみを行う:
//   URL台帳更新 → GSC検索アナリティクス（3日前・冪等）→ GA4日次（2日前・プロパティ単位で冪等）
// URL検査ローテーション（旧フェーズB）は ./inspect/route.ts へ分離した。取り込みが重い日に
// 検査へ時間が回らず1日1サイトに縮退したため、冒頭で inspect を HTTP 発火（fan-out）して
// 別インボケーションの実行時間枠で走らせる（Hobbyプランは cron 2本上限で3本目を張れない）。
// middleware は本パスを認証対象外にしており、CRON_SECRET の Bearer 照合が唯一のゲート。
import { NextResponse } from "next/server";
import {
  listSeoSites,
  mergeSeoUrls,
  mergeSeoUrlsFromQueryStats,
  hasQueryStats,
  insertQueryStats,
  hasGa4Daily,
  insertGa4Channel,
  insertGa4Pages,
  hasUserSessions,
  aggregateUserSessions,
} from "@/lib/seo-monitor/bigquery";
import {
  fetchSearchAnalytics,
  runGa4Report,
  GA4_METRICS,
} from "@/lib/seo-monitor/google";
import { fetchSitemapUrls, defaultSitemapUrl } from "@/lib/seo-monitor/sitemap";
import { invalidateSeoCache } from "@/lib/seo-monitor/cached";
import { ga4PropertyIds } from "@/lib/seo-monitor/types";
import type { Ga4ChannelRow, Ga4PageRow, SeoSite } from "@/lib/seo-monitor/types";

export const runtime = "nodejs";
export const maxDuration = 300;

// 新しい処理を始めない残り時間のしきい値（maxDuration に対する余白）
const TIME_BUDGET_MS = 240_000;

// JSTでn日前の日付（YYYY-MM-DD）
function jstDateAgo(days: number): string {
  const d = new Date(Date.now() + 9 * 3600_000 - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

type SiteSummary = {
  site: string;
  sitemapAdded?: number;
  queryRows?: number;
  querySkipped?: boolean;
  ga4Rows?: number;
  ga4Skipped?: boolean;
  userSessions?: number;
  errors: string[];
};

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // URL検査ローテーションを別インボケーションへ発火（fan-out）。
  // inspect 側は 202 を即返して応答後に処理を続けるため、この待ちは通常1秒未満。
  // 取り込みの成否と独立して検査が毎日全サイト分走るよう、取り込みの前に発火する。
  let inspectTriggered = false;
  try {
    const base = process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : new URL(request.url).origin;
    const res = await fetch(`${base}/api/rank-tracker/seo/cron/inspect`, {
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(10_000),
    });
    inspectTriggered = res.ok;
    if (!res.ok) {
      console.error("[seo-monitor] URL検査の発火に失敗しました:", res.status);
    }
  } catch (err) {
    console.error("[seo-monitor] URL検査の発火に失敗しました:", err);
  }

  let sites: SeoSite[];
  try {
    sites = await listSeoSites();
  } catch (err) {
    console.error("[seo-monitor] seo_sites の取得に失敗しました（cron）:", err);
    return NextResponse.json({ ok: false, error: "サイト設定の取得に失敗しました。" }, { status: 500 });
  }

  const startedAt = Date.now();
  const fetchedAt = new Date().toISOString();
  const gscDate = jstDateAgo(3); // GSCは約3日遅れで確定
  const ga4Date = jstDateAgo(2); // GA4は約1〜2日遅れ
  let timedOut = false;

  const timeLeft = () => TIME_BUDGET_MS - (Date.now() - startedAt);
  const summaryBy = new Map<string, SiteSummary>(
    sites.map((s) => [s.site, { site: s.site, errors: [] }])
  );

  // 全サイトの日次データ取り込み
  for (const s of sites) {
    if (timeLeft() <= 0) {
      timedOut = true;
      break;
    }
    const sum = summaryBy.get(s.site)!;

    if (s.gsc_enabled && s.gsc_site_url) {
      // 1) URL台帳の更新。sitemap取得はサイト本体へのアクセスなので crawl_enabled のサイトのみ。
      //    クロール不可サイト（例: RASIK）はGSC検索結果に出たURLから台帳を構築する。
      if (s.crawl_enabled) {
        try {
          const urls = await fetchSitemapUrls(s.sitemap_url ?? defaultSitemapUrl(s.site));
          sum.sitemapAdded = urls.length > 0 ? await mergeSeoUrls(s.site, urls, "sitemap") : 0;
        } catch (err) {
          console.error(`[seo-monitor] sitemap取得に失敗 (${s.site}):`, err);
          sum.errors.push("sitemap");
        }
      }
      try {
        const added = await mergeSeoUrlsFromQueryStats(s.site);
        sum.sitemapAdded = (sum.sitemapAdded ?? 0) + added;
      } catch (err) {
        console.error(`[seo-monitor] GSC由来URLの台帳更新に失敗 (${s.site}):`, err);
        sum.errors.push("url-ledger");
      }

      // 2) 検索アナリティクス（冪等: 同一日を二重取り込みしない）
      try {
        if (await hasQueryStats(s.site, gscDate)) {
          sum.querySkipped = true;
        } else {
          const rows = await fetchSearchAnalytics(s.gsc_site_url, gscDate);
          sum.queryRows = await insertQueryStats(
            rows.map((r) => ({
              site: s.site,
              date: gscDate,
              query: r.query,
              page: r.page,
              impressions: r.impressions,
              clicks: r.clicks,
              position: r.position,
              fetched_at: fetchedAt,
            }))
          );
        }
      } catch (err) {
        console.error(`[seo-monitor] 検索アナリティクス取得に失敗 (${s.site}):`, err);
        sum.errors.push("search-analytics");
      }
    }

    // GA4（カンマ区切りの複数プロパティをそれぞれ取得し、表示時に合算する）
    if (s.ga4_enabled && timeLeft() > 0) {
      for (const pid of ga4PropertyIds(s)) {
        // ユーザー単位セッション集約（BQエクスポートが有効なプロパティのみ）。
        // events_YYYYMMDD 未着（エクスポート未設定/遅延）は notFound になるので静かにスキップ。
        try {
          if (!(await hasUserSessions(s.site, pid, ga4Date))) {
            const n = await aggregateUserSessions(s.site, pid, ga4Date);
            if (n > 0) sum.userSessions = (sum.userSessions ?? 0) + n;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!/Not found/i.test(msg)) {
            console.error(`[seo-monitor] ユーザーセッション集約に失敗 (${s.site} ${pid}):`, err);
            sum.errors.push(`user-sessions:${pid}`);
          }
        }
        try {
          if (await hasGa4Daily(s.site, ga4Date, pid)) {
            sum.ga4Skipped = true;
            continue;
          }
          const metrics = GA4_METRICS.map((name) => ({ name }));
          const dateRanges = [{ startDate: ga4Date, endDate: ga4Date }];
          const [channelRows, pageRows] = await Promise.all([
            runGa4Report(pid, {
              dateRanges,
              dimensions: [
                { name: "sessionDefaultChannelGroup" },
                { name: "sessionSource" },
                { name: "sessionMedium" },
              ],
              metrics,
            }),
            // landingPage（クエリパラメータなし）を使う。landingPagePlusQueryString だと
            // パラメータ付きURLで行数が爆発する（rasikで1日4万行超の実績）
            runGa4Report(pid, {
              dateRanges,
              dimensions: [{ name: "landingPage" }],
              metrics,
            }),
          ]);
          const ch: Ga4ChannelRow[] = channelRows.map((r) => ({
            site: s.site,
            property_id: pid,
            date: ga4Date,
            channel: r.dims[0] ?? "",
            source: r.dims[1] ?? "",
            medium: r.dims[2] ?? "",
            sessions: r.metrics[0] ?? 0,
            active_users: r.metrics[1] ?? 0,
            views: r.metrics[2] ?? 0,
            key_events: r.metrics[3] ?? 0,
            engagement_secs: r.metrics[4] ?? 0,
            bounce_rate: r.metrics[5] ?? 0,
            fetched_at: fetchedAt,
          }));
          const pg: Ga4PageRow[] = pageRows.map((r) => ({
            site: s.site,
            property_id: pid,
            date: ga4Date,
            page: r.dims[0] ?? "",
            sessions: r.metrics[0] ?? 0,
            active_users: r.metrics[1] ?? 0,
            views: r.metrics[2] ?? 0,
            key_events: r.metrics[3] ?? 0,
            engagement_secs: r.metrics[4] ?? 0,
            bounce_rate: r.metrics[5] ?? 0,
            fetched_at: fetchedAt,
          }));
          const inserted = (await insertGa4Channel(ch)) + (await insertGa4Pages(pg));
          sum.ga4Rows = (sum.ga4Rows ?? 0) + inserted;
        } catch (err) {
          console.error(`[seo-monitor] GA4取得に失敗 (${s.site} property ${pid}):`, err);
          sum.errors.push(`ga4:${pid}`);
        }
      }
    }
  }

  invalidateSeoCache();

  const summaries = [...summaryBy.values()];
  const failed = summaries.filter((s) => s.errors.length > 0).length;
  // 全サイト失敗（かつ処理対象があった）ときのみ500（部分失敗は200で summary に残す）
  const ok = summaries.length === 0 || failed < summaries.length;
  return NextResponse.json(
    { ok, gscDate, ga4Date, sites: summaries.length, failed, timedOut, inspectTriggered, summary: summaries },
    { status: ok ? 200 : 500 }
  );
}
