// 読み取り系のサーバーキャッシュ。BigQuery への往復を減らして体感速度を上げる。
// 更新系API（keywords CRUD / cron / measure）は revalidateTag("rank-tracker") で即時無効化する。
import { unstable_cache, revalidateTag } from "next/cache";
import {
  listTrackedKeywords,
  listTrackedDomains,
  fetchLatestRanks,
  fetchAllRecentTrends,
  type TrackedKeyword,
  type TrackedDomain,
  type LatestRank,
  type KeywordTrendRow,
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

// 左ペインのミニスパークライン用（直近35日・サイト内全キーワードを1クエリで）
export function getRecentTrendsCached(domain: string): Promise<KeywordTrendRow[]> {
  return unstable_cache(
    () => fetchAllRecentTrends(domain, { fromDays: 35 }),
    ["rt-trends", domain],
    { revalidate: 300, tags: [CACHE_TAG] }
  )();
}
