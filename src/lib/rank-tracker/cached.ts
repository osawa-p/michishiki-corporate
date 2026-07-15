// 読み取り系のサーバーキャッシュ。BigQuery への往復を減らして体感速度を上げる。
// 更新系API（keywords CRUD / cron / measure）は revalidateTag("rank-tracker") で即時無効化する。
import { unstable_cache, revalidateTag } from "next/cache";
import {
  listTrackedKeywords,
  listTrackedDomains,
  fetchLatestRanks,
  fetchSiteSeriesRows,
  fetchSiteCandidates,
  type TrackedKeyword,
  type TrackedDomain,
  type LatestRank,
  type SiteSeriesRow,
  type SiteCandidateRow,
} from "./bigquery";

export const CACHE_TAG = "rank-tracker";

// 更新系APIから呼ぶキャッシュ無効化（Next 16 は profile 引数が必須。"max" = 即時破棄）
export function invalidateRankTrackerCache(): void {
  revalidateTag(CACHE_TAG, "max");
}

export function getTrackedKeywordsCached(domain?: string): Promise<TrackedKeyword[]> {
  return unstable_cache(
    () => listTrackedKeywords(domain ? { domain } : {}),
    ["rt-keywords", domain ?? "__all__"],
    { revalidate: 60, tags: [CACHE_TAG] }
  )();
}

export function getTrackedDomainsCached(): Promise<TrackedDomain[]> {
  return unstable_cache(() => listTrackedDomains(), ["rt-domains"], {
    revalidate: 300,
    tags: [CACHE_TAG],
  })();
}

export function getLatestRanksCached(domain: string): Promise<LatestRank[]> {
  return unstable_cache(
    () => fetchLatestRanks(domain, { onlyTracked: true }),
    ["rt-latest", domain],
    { revalidate: 300, tags: [CACHE_TAG] }
  )();
}

// ダッシュボードの一括プリロード（直近90日の全キーワード推移＋競合）。
// キーワード切替・競合ON/OFF・期間切替をクライアント側で即時に行うための土台。
export function getSiteSeriesCached(domain: string): Promise<SiteSeriesRow[]> {
  return unstable_cache(
    () => fetchSiteSeriesRows(domain, { fromDays: 90 }),
    ["rt-site-series", domain],
    { revalidate: 300, tags: [CACHE_TAG] }
  )();
}

export function getSiteCandidatesCached(domain: string): Promise<SiteCandidateRow[]> {
  return unstable_cache(
    () => fetchSiteCandidates(domain, { fromDays: 90 }),
    ["rt-site-candidates", domain],
    { revalidate: 300, tags: [CACHE_TAG] }
  )();
}
