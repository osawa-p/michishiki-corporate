// SEO観測ツールの日次取り込みAPI（Vercel Cronが毎朝叩く）。
// 実行は2フェーズ構成:
//   フェーズA（全サイト・必ず実行）: URL台帳更新 → GSC検索アナリティクス（3日前・冪等）
//     → GA4日次（2日前・プロパティ単位で冪等）
//   フェーズB（残り時間で実行）: URL検査ローテーション。日替わりでサイトの処理順を回し、
//     並列4リクエストで検査する（時間切れでも翌日は別のサイトから始まるため飢餓しない）
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
import { ga4PropertyIds } from "@/lib/seo-monitor/types";
import type { Ga4ChannelRow, Ga4PageRow, GscInspectionRow, SeoSite } from "@/lib/seo-monitor/types";

export const runtime = "nodejs";
export const maxDuration = 300;

// 新しい処理を始めない残り時間のしきい値（maxDuration に対する余白）
const TIME_BUDGET_MS = 240_000;
// URL検査の並列数（クォータは600件/分なので余裕を残して並列4）
const INSPECT_CONCURRENCY = 4;

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

  // ───────────────────────────────────────────────────────────
  // フェーズA: 全サイトの日次データ（軽い処理を先に確実に終わらせる）
  // ───────────────────────────────────────────────────────────
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

  // ───────────────────────────────────────────────────────────
  // フェーズB: URL検査ローテーション（残り時間で実行）
  // 処理順を日替わりで回すことで、時間切れでも特定サイトが飢餓しないようにする。
  // ───────────────────────────────────────────────────────────
  const gscSites = sites.filter((s) => s.gsc_enabled && s.gsc_site_url);
  const offset = gscSites.length > 0 ? new Date().getUTCDate() % gscSites.length : 0;
  const rotated = [...gscSites.slice(offset), ...gscSites.slice(0, offset)];

  for (const s of rotated) {
    if (timeLeft() <= 30_000) {
      timedOut = true;
      break;
    }
    const sum = summaryBy.get(s.site)!;
    try {
      const targets = await listInspectionTargets(s.site, s.inspection_daily_limit);
      const inspRows: GscInspectionRow[] = [];
      const marks: Array<{ url: string; indexTarget: boolean; excludeReason: string | null }> = [];
      let aborted = false;

      for (let i = 0; i < targets.length && !aborted; i += INSPECT_CONCURRENCY) {
        if (timeLeft() <= 30_000) {
          timedOut = true;
          break;
        }
        const batch = targets.slice(i, i + INSPECT_CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map((url) => inspectUrl(s.gsc_site_url!, url))
        );
        for (let j = 0; j < results.length; j++) {
          const res = results[j];
          const url = batch[j];
          if (res.status === "rejected") {
            // クォータ超過などはサイト単位で打ち切り（残りは翌日のローテーションで先頭になる）
            console.error(`[seo-monitor] URL検査に失敗 (${s.site} ${url}):`, res.reason);
            sum.errors.push("inspection");
            aborted = true;
            break;
          }
          const r = res.value;
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

  invalidateSeoCache();

  const summaries = [...summaryBy.values()];
  const failed = summaries.filter((s) => s.errors.length > 0).length;
  // 全サイト失敗（かつ処理対象があった）ときのみ500（部分失敗は200で summary に残す）
  const ok = summaries.length === 0 || failed < summaries.length;
  return NextResponse.json(
    { ok, gscDate, ga4Date, sites: summaries.length, failed, timedOut, summary: summaries },
    { status: ok ? 200 : 500 }
  );
}
