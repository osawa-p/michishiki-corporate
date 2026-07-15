// SEO観測ツールの日次取り込みAPI（Vercel Cronが毎朝叩く）。
// seo_sites の有効サイトごとに以下を実行する:
//   1. sitemap 更新 → seo_urls 台帳へ新URLを追加
//   2. GSC 検索アナリティクス（3日前・確定分）→ gsc_query_stats（冪等）
//   3. URL検査ローテーション（1日あたり inspection_daily_limit 件、古い順に巡回）
//   4. GA4 日次（2日前）→ ga4_channel_daily / ga4_page_daily（冪等）
// middleware は本パスを認証対象外にしており、CRON_SECRET の Bearer 照合が唯一のゲート。
import { NextResponse } from "next/server";
import {
  listSeoSites,
  mergeSeoUrls,
  mergeSeoUrlsFromQueryStats,
  listInspectionTargets,
  markUrlsInspected,
  hasQueryStats,
  insertQueryStats,
  insertInspections,
  hasGa4Daily,
  insertGa4Channel,
  insertGa4Pages,
} from "@/lib/seo-monitor/bigquery";
import {
  fetchSearchAnalytics,
  inspectUrl,
  classifyIndexTarget,
  runGa4Report,
  GA4_METRICS,
} from "@/lib/seo-monitor/google";
import { fetchSitemapUrls, defaultSitemapUrl } from "@/lib/seo-monitor/sitemap";
import { invalidateSeoCache } from "@/lib/seo-monitor/cached";
import type { Ga4ChannelRow, Ga4PageRow, GscInspectionRow } from "@/lib/seo-monitor/types";

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
  inspected?: number;
  excluded?: number;
  ga4Rows?: number;
  ga4Skipped?: boolean;
  errors: string[];
};

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let sites;
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
  const summaries: SiteSummary[] = [];
  let timedOut = false;

  const timeLeft = () => TIME_BUDGET_MS - (Date.now() - startedAt);

  for (const s of sites) {
    if (timeLeft() <= 0) {
      timedOut = true;
      break;
    }
    const sum: SiteSummary = { site: s.site, errors: [] };
    summaries.push(sum);

    // ── GSC 系（gsc_enabled のサイトのみ） ──
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

      // 3) URL検査ローテーション（時間予算内で1件ずつ。失敗は打ち切って翌日に回す）
      try {
        const targets = await listInspectionTargets(s.site, s.inspection_daily_limit);
        const inspRows: GscInspectionRow[] = [];
        const marks: Array<{ url: string; indexTarget: boolean; excludeReason: string | null }> = [];
        for (const url of targets) {
          if (timeLeft() <= 30_000) {
            timedOut = true;
            break;
          }
          try {
            const r = await inspectUrl(s.gsc_site_url, url);
            const cls = classifyIndexTarget(url, r);
            inspRows.push({
              site: s.site,
              url,
              inspected_at: fetchedAt,
              verdict: r.verdict,
              coverage_state: r.coverageState,
              indexing_state: r.indexingState,
              page_fetch_state: r.pageFetchState,
              robots_txt_state: r.robotsTxtState,
              google_canonical: r.googleCanonical,
              user_canonical: r.userCanonical,
              canonical_match:
                r.googleCanonical == null
                  ? null
                  : cls.excludeReason !== "正規URLが別（canonical不一致）",
              last_crawl_time: r.lastCrawlTime,
            });
            marks.push({ url, indexTarget: cls.indexTarget, excludeReason: cls.excludeReason });
          } catch (err) {
            // クォータ超過などはサイト単位で打ち切り（残りは翌日のローテーションで先頭になる）
            console.error(`[seo-monitor] URL検査に失敗 (${s.site} ${url}):`, err);
            sum.errors.push("inspection");
            break;
          }
        }
        await insertInspections(inspRows);
        await markUrlsInspected(s.site, marks);
        sum.inspected = inspRows.length;
        sum.excluded = marks.filter((m) => !m.indexTarget).length;
      } catch (err) {
        console.error(`[seo-monitor] URL検査ローテーションに失敗 (${s.site}):`, err);
        sum.errors.push("inspection-rotation");
      }
    }

    // ── GA4 系 ──
    if (s.ga4_enabled && s.ga4_property_id && timeLeft() > 0) {
      try {
        if (await hasGa4Daily(s.site, ga4Date)) {
          sum.ga4Skipped = true;
        } else {
          const metrics = GA4_METRICS.map((name) => ({ name }));
          const dateRanges = [{ startDate: ga4Date, endDate: ga4Date }];
          const [channelRows, pageRows] = await Promise.all([
            runGa4Report(s.ga4_property_id, {
              dateRanges,
              dimensions: [
                { name: "sessionDefaultChannelGroup" },
                { name: "sessionSource" },
                { name: "sessionMedium" },
              ],
              metrics,
            }),
            runGa4Report(s.ga4_property_id, {
              dateRanges,
              dimensions: [{ name: "landingPagePlusQueryString" }],
              metrics,
            }),
          ]);
          const ch: Ga4ChannelRow[] = channelRows.map((r) => ({
            site: s.site,
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
          sum.ga4Rows = inserted;
        }
      } catch (err) {
        console.error(`[seo-monitor] GA4取得に失敗 (${s.site}):`, err);
        sum.errors.push("ga4");
      }
    }
  }

  invalidateSeoCache();

  const failed = summaries.filter((s) => s.errors.length > 0).length;
  // 全サイト失敗（かつ処理対象があった）ときのみ500（部分失敗は200で summary に残す）
  const ok = summaries.length === 0 || failed < summaries.length;
  return NextResponse.json(
    { ok, gscDate, ga4Date, sites: summaries.length, failed, timedOut, summary: summaries },
    { status: ok ? 200 : 500 }
  );
}
