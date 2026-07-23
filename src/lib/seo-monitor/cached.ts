// SEO観測ツールの読み取りキャッシュ層。rank-tracker/cached.ts と同じ方針で、
// BigQuery への往復を減らす。更新系（cron・設定・提案の更新）は invalidateSeoCache() で
// 即時無効化する。
import { unstable_cache, revalidateTag } from "next/cache";
import {
  listSeoSites,
  fetchRotationProgress,
  fetchLatestInspections,
  fetchLatestCoverage,
  fetchQuerySummary,
  fetchQueryPages,
  fetchOpportunityQueries,
  fetchCtrGapQueries,
  fetchMovingQueries,
  fetchCvQueries,
  fetchFirstTouchCvr,
  fetchCvChannelCombos,
  fetchSessionCountCvr,
  fetchCvPageLift,
  fetchGa4Summary,
  fetchTrafficSeries,
  fetchGa4Channels,
  fetchGa4SourceMedium,
  fetchGa4PageStats,
  listProposals,
  type RotationProgress,
  type LatestInspection,
  type QuerySummary,
  type QueryPageRow,
  type OpportunityQuery,
  type CtrGapQuery,
  type MovingQuery,
  type CvQueryRow,
  type FirstTouchCvr,
  type CvChannelCombo,
  type SessionCountCvr,
  type CvPageLift,
  type Ga4Summary,
  type TrafficPoint,
  type ChannelStat,
  type SourceMediumStat,
  type PageStat,
} from "./bigquery";
import type { CoverageSnapshotRow, SeoProposal, SeoSite } from "./types";

export const SEO_CACHE_TAG = "seo-monitor";

export function invalidateSeoCache(): void {
  revalidateTag(SEO_CACHE_TAG, "max");
}

const opts = { revalidate: 300, tags: [SEO_CACHE_TAG] };

export function getSeoSitesCached(): Promise<SeoSite[]> {
  return unstable_cache(() => listSeoSites(), ["seo-sites"], { revalidate: 60, tags: [SEO_CACHE_TAG] })();
}

export function getRotationProgressCached(site: string): Promise<RotationProgress> {
  return unstable_cache(() => fetchRotationProgress(site), ["seo-rotation", site], opts)();
}

export function getLatestInspectionsCached(site: string): Promise<LatestInspection[]> {
  return unstable_cache(
    () => fetchLatestInspections(site, { limit: 100 }),
    ["seo-inspections", site],
    opts
  )();
}

export function getStaleUrlsCached(site: string, staleDays: number): Promise<LatestInspection[]> {
  return unstable_cache(
    () => fetchLatestInspections(site, { limit: 200, staleDaysOnly: staleDays }),
    ["seo-stale", site, String(staleDays)],
    opts
  )();
}

export function getCoverageCached(site: string): Promise<CoverageSnapshotRow[]> {
  return unstable_cache(() => fetchLatestCoverage(site), ["seo-coverage", site], opts)();
}

export function getQuerySummaryCached(site: string, days: number): Promise<QuerySummary[]> {
  return unstable_cache(
    () => fetchQuerySummary(site, days),
    ["seo-queries", site, String(days)],
    opts
  )();
}

export function getQueryPagesCached(site: string, days: number): Promise<QueryPageRow[]> {
  return unstable_cache(
    () => fetchQueryPages(site, days),
    ["seo-query-pages", site, String(days)],
    opts
  )();
}

export function getOpportunityQueriesCached(site: string, days: number): Promise<OpportunityQuery[]> {
  return unstable_cache(
    () => fetchOpportunityQueries(site, days),
    ["seo-opportunity", site, String(days)],
    opts
  )();
}

export function getCtrGapQueriesCached(site: string, days: number): Promise<CtrGapQuery[]> {
  return unstable_cache(
    () => fetchCtrGapQueries(site, days),
    ["seo-ctr-gap", site, String(days)],
    opts
  )();
}

export function getMovingQueriesCached(site: string): Promise<MovingQuery[]> {
  return unstable_cache(() => fetchMovingQueries(site), ["seo-moving", site], opts)();
}

export function getCvQueriesCached(site: string, days: number): Promise<CvQueryRow[]> {
  return unstable_cache(
    () => fetchCvQueries(site, days),
    ["seo-cv-queries", site, String(days)],
    opts
  )();
}

export function getFirstTouchCvrCached(site: string, days: number): Promise<FirstTouchCvr[]> {
  return unstable_cache(
    () => fetchFirstTouchCvr(site, days),
    ["seo-first-touch", site, String(days)],
    opts
  )();
}

export function getCvChannelCombosCached(site: string, days: number): Promise<CvChannelCombo[]> {
  return unstable_cache(
    () => fetchCvChannelCombos(site, days),
    ["seo-cv-combos", site, String(days)],
    opts
  )();
}

export function getSessionCountCvrCached(site: string, days: number): Promise<SessionCountCvr[]> {
  return unstable_cache(
    () => fetchSessionCountCvr(site, days),
    ["seo-session-cvr", site, String(days)],
    opts
  )();
}

export function getCvPageLiftCached(site: string, days: number): Promise<CvPageLift[]> {
  return unstable_cache(
    () => fetchCvPageLift(site, days),
    ["seo-cv-lift", site, String(days)],
    opts
  )();
}

export function getGa4SummaryCached(site: string, days: number): Promise<Ga4Summary> {
  return unstable_cache(
    () => fetchGa4Summary(site, days),
    ["seo-ga4-summary", site, String(days)],
    opts
  )();
}

export function getTrafficSeriesCached(site: string, days: number): Promise<TrafficPoint[]> {
  return unstable_cache(
    () => fetchTrafficSeries(site, days),
    ["seo-ga4-series", site, String(days)],
    opts
  )();
}

export function getGa4ChannelsCached(site: string, days: number): Promise<ChannelStat[]> {
  return unstable_cache(
    () => fetchGa4Channels(site, days),
    ["seo-ga4-channels", site, String(days)],
    opts
  )();
}

export function getGa4SourceMediumCached(site: string, days: number): Promise<SourceMediumStat[]> {
  return unstable_cache(
    () => fetchGa4SourceMedium(site, days),
    ["seo-ga4-sm", site, String(days)],
    opts
  )();
}

export function getGa4PageStatsCached(site: string, days: number): Promise<PageStat[]> {
  return unstable_cache(
    () => fetchGa4PageStats(site, days),
    ["seo-ga4-pages", site, String(days)],
    opts
  )();
}

export function getProposalsCached(site?: string): Promise<SeoProposal[]> {
  return unstable_cache(() => listProposals(site), ["seo-proposals", site ?? "__all__"], {
    revalidate: 60,
    tags: [SEO_CACHE_TAG],
  })();
}

// ── ユーザー単位レポート（GA4 BQエクスポート由来） ──
import {
  fetchTopUsers,
  fetchCvPaths,
  type UserSummary,
  type CvPath,
  type CvStats,
} from "./bigquery";

export function getTopUsersCached(site: string, days: number): Promise<UserSummary[]> {
  return unstable_cache(
    () => fetchTopUsers(site, days),
    ["seo-top-users", site, String(days)],
    { revalidate: 300, tags: [SEO_CACHE_TAG] }
  )();
}

export function getCvPathsCached(
  site: string,
  days: number
): Promise<{ paths: CvPath[]; stats: CvStats }> {
  return unstable_cache(() => fetchCvPaths(site, days), ["seo-cv-paths", site, String(days)], {
    revalidate: 300,
    tags: [SEO_CACHE_TAG],
  })();
}
