// SEO観測ツールの BigQuery アクセス層。
// クライアント初期化と runQuery は rank-tracker の実装を再利用する。
// テーブルは scripts/create-seo-tables.mjs で事前作成済み前提（ここでは作成しない）。
// 追記はストリーミングinsert、更新は DML（MERGE/UPDATE）を使う。

import { getBigQuery, runQuery } from "@/lib/rank-tracker/bigquery";
import type {
  SeoSite,
  GscQueryStatRow,
  GscInspectionRow,
  CoverageSnapshotRow,
  Ga4ChannelRow,
  Ga4PageRow,
  SeoProposal,
  ProposalStatus,
} from "./types";
import { DEFAULT_SEO_SITE } from "./types";

const GCP_PROJECT = process.env.GCP_PROJECT ?? "tidal-fusion-439015-e8";
const BQ_DATASET = process.env.BQ_DATASET ?? "rank_tracking";

const T_SITES = `\`${GCP_PROJECT}.${BQ_DATASET}.seo_sites\``;
const T_URLS = `\`${GCP_PROJECT}.${BQ_DATASET}.seo_urls\``;
const T_QUERY = `\`${GCP_PROJECT}.${BQ_DATASET}.gsc_query_stats\``;
const T_INSPECT = `\`${GCP_PROJECT}.${BQ_DATASET}.gsc_url_inspections\``;
const T_COVERAGE = `\`${GCP_PROJECT}.${BQ_DATASET}.gsc_coverage_snapshots\``;
const T_GA4_CH = `\`${GCP_PROJECT}.${BQ_DATASET}.ga4_channel_daily\``;
const T_GA4_PAGE = `\`${GCP_PROJECT}.${BQ_DATASET}.ga4_page_daily\``;
const T_PROPOSALS = `\`${GCP_PROJECT}.${BQ_DATASET}.seo_proposals\``;

// ストリーミングinsertは1リクエスト10MB上限があるため、大きな配列は分割して送る。
// 大規模サイト（rasik/shift-ai）は1日のクエリ行が4〜7万行になり、一括insertだと
// 「Request Entity Too Large」で失敗する。
const INSERT_CHUNK_ROWS = 2000;

async function insertChunked(table: string, rows: object[]): Promise<number> {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK_ROWS) {
    await getBigQuery()
      .dataset(BQ_DATASET)
      .table(table)
      .insert(rows.slice(i, i + INSERT_CHUNK_ROWS));
  }
  return rows.length;
}

// BQ の DATE/TIMESTAMP は {value: string} で返ることがあるため文字列へ正規化する
function bqString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object" && "value" in (v as Record<string, unknown>)) {
    return String((v as { value: unknown }).value);
  }
  return String(v);
}

// ───────────────────────────────────────────────────────────
// seo_sites（サイトごとの取得設定）
// ───────────────────────────────────────────────────────────

export async function listSeoSites(): Promise<SeoSite[]> {
  const { rows } = await runQuery<Record<string, unknown>>({
    query: `SELECT * FROM ${T_SITES} ORDER BY site`,
  });
  return rows.map((r) => ({
    site: String(r.site),
    gsc_enabled: Boolean(r.gsc_enabled),
    gsc_site_url: (r.gsc_site_url as string) ?? null,
    ga4_enabled: Boolean(r.ga4_enabled),
    ga4_property_id: (r.ga4_property_id as string) ?? null,
    sitemap_url: (r.sitemap_url as string) ?? null,
    crawl_enabled: r.crawl_enabled == null ? true : Boolean(r.crawl_enabled),
    inspection_daily_limit:
      Number(r.inspection_daily_limit) > 0
        ? Number(r.inspection_daily_limit)
        : DEFAULT_SEO_SITE.inspection_daily_limit,
    stale_days: Number(r.stale_days) > 0 ? Number(r.stale_days) : DEFAULT_SEO_SITE.stale_days,
    updated_at: bqString(r.updated_at) ?? undefined,
  }));
}

export async function upsertSeoSite(s: SeoSite): Promise<void> {
  await runQuery({
    query: `
      MERGE ${T_SITES} t
      USING (SELECT @site AS site) s ON t.site = s.site
      WHEN MATCHED THEN UPDATE SET
        gsc_enabled = @gsc_enabled,
        gsc_site_url = @gsc_site_url,
        ga4_enabled = @ga4_enabled,
        ga4_property_id = @ga4_property_id,
        sitemap_url = @sitemap_url,
        crawl_enabled = @crawl_enabled,
        inspection_daily_limit = @inspection_daily_limit,
        stale_days = @stale_days,
        updated_at = CURRENT_TIMESTAMP()
      WHEN NOT MATCHED THEN INSERT
        (site, gsc_enabled, gsc_site_url, ga4_enabled, ga4_property_id, sitemap_url,
         crawl_enabled, inspection_daily_limit, stale_days, updated_at)
      VALUES (@site, @gsc_enabled, @gsc_site_url, @ga4_enabled, @ga4_property_id, @sitemap_url,
        @crawl_enabled, @inspection_daily_limit, @stale_days, CURRENT_TIMESTAMP())`,
    params: {
      site: s.site,
      gsc_enabled: s.gsc_enabled,
      gsc_site_url: s.gsc_site_url,
      ga4_enabled: s.ga4_enabled,
      ga4_property_id: s.ga4_property_id,
      sitemap_url: s.sitemap_url,
      crawl_enabled: s.crawl_enabled,
      inspection_daily_limit: s.inspection_daily_limit,
      stale_days: s.stale_days,
    },
    types: { gsc_site_url: "STRING", ga4_property_id: "STRING", sitemap_url: "STRING" },
  });
}

// ───────────────────────────────────────────────────────────
// seo_urls（URL検査ローテーションの対象台帳）
// ───────────────────────────────────────────────────────────

// sitemap 等で発見したURLを台帳へ追加（既存URLは触らない = 検査結果による除外を上書きしない）
export async function mergeSeoUrls(site: string, urls: string[], source: string): Promise<number> {
  if (urls.length === 0) return 0;
  const { affected } = await runQuery({
    query: `
      MERGE ${T_URLS} t
      USING (SELECT url FROM UNNEST(@urls) AS url) s ON t.site = @site AND t.url = s.url
      WHEN NOT MATCHED THEN INSERT
        (site, url, source, index_target, active, exclude_reason, discovered_at, last_inspected_at)
      VALUES (@site, s.url, @source, TRUE, TRUE, NULL, CURRENT_TIMESTAMP(), NULL)`,
    params: { site, urls, source },
    types: { urls: ["STRING"] },
  });
  return affected;
}

// GSC検索結果に出たURLを台帳へ追加する（クロール不可サイトのsitemap代替。
// Google側のデータのみで構築するため、サイト本体へのアクセスは発生しない）
export async function mergeSeoUrlsFromQueryStats(site: string, days = 28): Promise<number> {
  const { affected } = await runQuery({
    query: `
      MERGE ${T_URLS} t
      USING (
        SELECT DISTINCT page AS url FROM ${T_QUERY}
        WHERE site = @site
          AND date >= DATE_SUB(CURRENT_DATE('Asia/Tokyo'), INTERVAL @days DAY)
          AND STARTS_WITH(page, 'http')
      ) s ON t.site = @site AND t.url = s.url
      WHEN NOT MATCHED THEN INSERT
        (site, url, source, index_target, active, exclude_reason, discovered_at, last_inspected_at)
      VALUES (@site, s.url, 'gsc', TRUE, TRUE, NULL, CURRENT_TIMESTAMP(), NULL)`,
    params: { site, days },
  });
  return affected;
}

// 次に検査すべきURL（未検査 → 検査が古い順）
export async function listInspectionTargets(site: string, limit: number): Promise<string[]> {
  const { rows } = await runQuery<{ url: string }>({
    query: `
      SELECT url FROM ${T_URLS}
      WHERE site = @site AND active AND index_target
      ORDER BY last_inspected_at IS NOT NULL, last_inspected_at, url
      LIMIT @lim`,
    params: { site, lim: limit },
  });
  return rows.map((r) => r.url);
}

// 検査済みURLの台帳更新（検査日時と、検査結果によるインデックス対象外化）
export async function markUrlsInspected(
  site: string,
  results: Array<{ url: string; indexTarget: boolean; excludeReason: string | null }>
): Promise<void> {
  if (results.length === 0) return;
  await runQuery({
    query: `
      MERGE ${T_URLS} t
      USING UNNEST(@rows) s ON t.site = @site AND t.url = s.url
      WHEN MATCHED THEN UPDATE SET
        last_inspected_at = CURRENT_TIMESTAMP(),
        index_target = s.index_target,
        exclude_reason = s.exclude_reason`,
    params: {
      site,
      rows: results.map((r) => ({
        url: r.url,
        index_target: r.indexTarget,
        exclude_reason: r.excludeReason,
      })),
    },
    types: {
      rows: [{ url: "STRING", index_target: "BOOL", exclude_reason: "STRING" }],
    },
  });
}

export type RotationProgress = {
  total: number; // インデックス対象URL数
  inspected: number; // うち検査済み（1回以上）
  excluded: number; // 検査の結果 対象外化された数
};

export async function fetchRotationProgress(site: string): Promise<RotationProgress> {
  const { rows } = await runQuery<{ total: number; inspected: number; excluded: number }>({
    query: `
      SELECT
        COUNTIF(index_target) AS total,
        COUNTIF(index_target AND last_inspected_at IS NOT NULL) AS inspected,
        COUNTIF(NOT index_target) AS excluded
      FROM ${T_URLS} WHERE site = @site AND active`,
    params: { site },
  });
  const r = rows[0];
  return {
    total: Number(r?.total ?? 0),
    inspected: Number(r?.inspected ?? 0),
    excluded: Number(r?.excluded ?? 0),
  };
}

// ───────────────────────────────────────────────────────────
// gsc_query_stats（検索アナリティクス）
// ───────────────────────────────────────────────────────────

// 同一日の二重取り込みを防ぐ冪等ガード
export async function hasQueryStats(site: string, date: string): Promise<boolean> {
  const { rows } = await runQuery<{ n: number }>({
    query: `SELECT COUNT(*) AS n FROM ${T_QUERY} WHERE site = @site AND date = @date`,
    params: { site, date },
  });
  return Number(rows[0]?.n ?? 0) > 0;
}

export async function insertQueryStats(rows: GscQueryStatRow[]): Promise<number> {
  return insertChunked("gsc_query_stats", rows);
}

export type QuerySummary = {
  query: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
  pages: number; // 着地URLの数（2以上ならカニバリ疑い）
};

export async function fetchQuerySummary(site: string, days: number): Promise<QuerySummary[]> {
  const { rows } = await runQuery<QuerySummary>({
    query: `
      SELECT
        query,
        SUM(impressions) AS impressions,
        SUM(clicks) AS clicks,
        SAFE_DIVIDE(SUM(clicks), SUM(impressions)) AS ctr,
        SAFE_DIVIDE(SUM(position * impressions), SUM(impressions)) AS position,
        COUNT(DISTINCT page) AS pages
      FROM ${T_QUERY}
      WHERE site = @site AND date >= DATE_SUB(CURRENT_DATE('Asia/Tokyo'), INTERVAL @days DAY)
      GROUP BY query
      ORDER BY impressions DESC
      LIMIT 200`,
    params: { site, days },
  });
  return rows.map((r) => ({
    query: r.query,
    impressions: Number(r.impressions),
    clicks: Number(r.clicks),
    ctr: Number(r.ctr ?? 0),
    position: Number(r.position ?? 0),
    pages: Number(r.pages),
  }));
}

export type QueryPageRow = {
  query: string;
  page: string;
  impressions: number;
  clicks: number;
  position: number;
};

// クエリ×URL（表示回数上位クエリのみ）。カニバリ判定は呼び出し側で pages>=2 を見る。
export async function fetchQueryPages(site: string, days: number): Promise<QueryPageRow[]> {
  const { rows } = await runQuery<QueryPageRow>({
    query: `
      WITH top_queries AS (
        SELECT query FROM ${T_QUERY}
        WHERE site = @site AND date >= DATE_SUB(CURRENT_DATE('Asia/Tokyo'), INTERVAL @days DAY)
        GROUP BY query ORDER BY SUM(impressions) DESC LIMIT 50
      )
      SELECT
        q.query, q.page,
        SUM(q.impressions) AS impressions,
        SUM(q.clicks) AS clicks,
        SAFE_DIVIDE(SUM(q.position * q.impressions), SUM(q.impressions)) AS position
      FROM ${T_QUERY} q
      JOIN top_queries USING (query)
      WHERE q.site = @site AND q.date >= DATE_SUB(CURRENT_DATE('Asia/Tokyo'), INTERVAL @days DAY)
      GROUP BY q.query, q.page
      HAVING SUM(q.impressions) >= 10
      ORDER BY MAX(SUM(q.impressions)) OVER (PARTITION BY q.query) DESC, q.query, impressions DESC`,
    params: { site, days },
  });
  return rows.map((r) => ({
    query: r.query,
    page: r.page,
    impressions: Number(r.impressions),
    clicks: Number(r.clicks),
    position: Number(r.position ?? 0),
  }));
}

// ───────────────────────────────────────────────────────────
// gsc_url_inspections（URL検査ログ）
// ───────────────────────────────────────────────────────────

export async function insertInspections(rows: GscInspectionRow[]): Promise<number> {
  return insertChunked("gsc_url_inspections", rows);
}

export type LatestInspection = {
  url: string;
  inspected_at: string;
  verdict: string | null;
  coverage_state: string | null;
  page_fetch_state: string | null;
  google_canonical: string | null;
  canonical_match: boolean | null;
  last_crawl_time: string | null;
  days_since_crawl: number | null; // 検査日 − 最終クロール日
};

// URLごとの最新検査結果（検査日時の降順）
export async function fetchLatestInspections(
  site: string,
  opts: { limit?: number; staleDaysOnly?: number } = {}
): Promise<LatestInspection[]> {
  const staleOnly = opts.staleDaysOnly != null;
  const { rows } = await runQuery<Record<string, unknown>>({
    query: `
      WITH latest AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY url ORDER BY inspected_at DESC) AS rn
        FROM ${T_INSPECT} WHERE site = @site
      )
      SELECT
        url, inspected_at, verdict, coverage_state, page_fetch_state,
        google_canonical, canonical_match, last_crawl_time,
        DATE_DIFF(DATE(inspected_at, 'Asia/Tokyo'), DATE(last_crawl_time, 'Asia/Tokyo'), DAY)
          AS days_since_crawl
      FROM latest
      WHERE rn = 1
        ${staleOnly ? "AND last_crawl_time IS NOT NULL AND DATE_DIFF(DATE(inspected_at, 'Asia/Tokyo'), DATE(last_crawl_time, 'Asia/Tokyo'), DAY) >= @staleDays" : ""}
      ORDER BY ${staleOnly ? "days_since_crawl DESC" : "inspected_at DESC"}
      LIMIT @lim`,
    params: {
      site,
      lim: opts.limit ?? 100,
      ...(staleOnly ? { staleDays: opts.staleDaysOnly } : {}),
    },
  });
  return rows.map((r) => ({
    url: String(r.url),
    inspected_at: bqString(r.inspected_at) ?? "",
    verdict: (r.verdict as string) ?? null,
    coverage_state: (r.coverage_state as string) ?? null,
    page_fetch_state: (r.page_fetch_state as string) ?? null,
    google_canonical: (r.google_canonical as string) ?? null,
    canonical_match: r.canonical_match == null ? null : Boolean(r.canonical_match),
    last_crawl_time: bqString(r.last_crawl_time),
    days_since_crawl: r.days_since_crawl == null ? null : Number(r.days_since_crawl),
  }));
}

// ───────────────────────────────────────────────────────────
// gsc_coverage_snapshots（カバレッジ集計・スクレイパー連携用）
// ───────────────────────────────────────────────────────────

export async function fetchLatestCoverage(site: string): Promise<CoverageSnapshotRow[]> {
  const { rows } = await runQuery<Record<string, unknown>>({
    query: `
      SELECT * FROM ${T_COVERAGE}
      WHERE site = @site
        AND snapshot_date = (SELECT MAX(snapshot_date) FROM ${T_COVERAGE} WHERE site = @site)
      ORDER BY count DESC`,
    params: { site },
  });
  return rows.map((r) => ({
    site: String(r.site),
    snapshot_date: bqString(r.snapshot_date) ?? "",
    bucket: String(r.bucket ?? ""),
    reason: String(r.reason ?? ""),
    count: Number(r.count ?? 0),
    fetched_at: bqString(r.fetched_at) ?? "",
  }));
}

// ───────────────────────────────────────────────────────────
// GA4（チャネル日次・ページ日次）
// ───────────────────────────────────────────────────────────

// 冪等ガード（プロパティ単位）。複数プロパティ対応前のNULL行は移行時に
// property_id を埋めてある前提（scripts/backfill-seo.mjs 冒頭の移行処理）。
export async function hasGa4Daily(site: string, date: string, propertyId: string): Promise<boolean> {
  const { rows } = await runQuery<{ n: number }>({
    query: `SELECT COUNT(*) AS n FROM ${T_GA4_CH}
      WHERE site = @site AND date = @date AND property_id = @pid`,
    params: { site, date, pid: propertyId },
  });
  return Number(rows[0]?.n ?? 0) > 0;
}

export async function insertGa4Channel(rows: Ga4ChannelRow[]): Promise<number> {
  return insertChunked("ga4_channel_daily", rows);
}

export async function insertGa4Pages(rows: Ga4PageRow[]): Promise<number> {
  return insertChunked("ga4_page_daily", rows);
}

export type Ga4Summary = {
  sessions: number;
  active_users: number;
  views: number;
  key_events: number;
  organic_sessions: number;
  avg_engagement_secs: number;
  bounce_rate: number;
  prev_sessions: number;
  prev_organic_sessions: number;
  prev_key_events: number;
};

export async function fetchGa4Summary(site: string, days: number): Promise<Ga4Summary> {
  const { rows } = await runQuery<Record<string, unknown>>({
    query: `
      WITH cur AS (
        SELECT * FROM ${T_GA4_CH}
        WHERE site = @site AND date >= DATE_SUB(CURRENT_DATE('Asia/Tokyo'), INTERVAL @days DAY)
      ), prev AS (
        SELECT * FROM ${T_GA4_CH}
        WHERE site = @site
          AND date >= DATE_SUB(CURRENT_DATE('Asia/Tokyo'), INTERVAL @days2 DAY)
          AND date < DATE_SUB(CURRENT_DATE('Asia/Tokyo'), INTERVAL @days DAY)
      )
      SELECT
        (SELECT IFNULL(SUM(sessions), 0) FROM cur) AS sessions,
        (SELECT IFNULL(SUM(active_users), 0) FROM cur) AS active_users,
        (SELECT IFNULL(SUM(views), 0) FROM cur) AS views,
        (SELECT IFNULL(SUM(key_events), 0) FROM cur) AS key_events,
        (SELECT IFNULL(SUM(IF(channel = 'Organic Search', sessions, 0)), 0) FROM cur)
          AS organic_sessions,
        (SELECT SAFE_DIVIDE(SUM(engagement_secs), SUM(sessions)) FROM cur) AS avg_engagement_secs,
        (SELECT SAFE_DIVIDE(SUM(bounce_rate * sessions), SUM(sessions)) FROM cur) AS bounce_rate,
        (SELECT IFNULL(SUM(sessions), 0) FROM prev) AS prev_sessions,
        (SELECT IFNULL(SUM(IF(channel = 'Organic Search', sessions, 0)), 0) FROM prev)
          AS prev_organic_sessions,
        (SELECT IFNULL(SUM(key_events), 0) FROM prev) AS prev_key_events`,
    params: { site, days, days2: days * 2 },
  });
  const r = rows[0] ?? {};
  const n = (v: unknown) => Number(v ?? 0);
  return {
    sessions: n(r.sessions),
    active_users: n(r.active_users),
    views: n(r.views),
    key_events: n(r.key_events),
    organic_sessions: n(r.organic_sessions),
    avg_engagement_secs: n(r.avg_engagement_secs),
    bounce_rate: n(r.bounce_rate),
    prev_sessions: n(r.prev_sessions),
    prev_organic_sessions: n(r.prev_organic_sessions),
    prev_key_events: n(r.prev_key_events),
  };
}

export type TrafficPoint = { date: string; sessions: number; organic_sessions: number };

export async function fetchTrafficSeries(site: string, days: number): Promise<TrafficPoint[]> {
  const { rows } = await runQuery<Record<string, unknown>>({
    query: `
      SELECT
        date,
        SUM(sessions) AS sessions,
        SUM(IF(channel = 'Organic Search', sessions, 0)) AS organic_sessions
      FROM ${T_GA4_CH}
      WHERE site = @site AND date >= DATE_SUB(CURRENT_DATE('Asia/Tokyo'), INTERVAL @days DAY)
      GROUP BY date ORDER BY date`,
    params: { site, days },
  });
  return rows.map((r) => ({
    date: bqString(r.date) ?? "",
    sessions: Number(r.sessions ?? 0),
    organic_sessions: Number(r.organic_sessions ?? 0),
  }));
}

export type ChannelStat = {
  channel: string;
  sessions: number;
  active_users: number;
  key_events: number;
};

export async function fetchGa4Channels(site: string, days: number): Promise<ChannelStat[]> {
  const { rows } = await runQuery<Record<string, unknown>>({
    query: `
      SELECT channel, SUM(sessions) AS sessions, SUM(active_users) AS active_users,
        SUM(key_events) AS key_events
      FROM ${T_GA4_CH}
      WHERE site = @site AND date >= DATE_SUB(CURRENT_DATE('Asia/Tokyo'), INTERVAL @days DAY)
      GROUP BY channel ORDER BY sessions DESC`,
    params: { site, days },
  });
  return rows.map((r) => ({
    channel: String(r.channel ?? "(不明)"),
    sessions: Number(r.sessions ?? 0),
    active_users: Number(r.active_users ?? 0),
    key_events: Number(r.key_events ?? 0),
  }));
}

export type SourceMediumStat = {
  source: string;
  medium: string;
  sessions: number;
  active_users: number;
  key_events: number;
  avg_engagement_secs: number;
};

export async function fetchGa4SourceMedium(site: string, days: number): Promise<SourceMediumStat[]> {
  const { rows } = await runQuery<Record<string, unknown>>({
    query: `
      SELECT source, medium, SUM(sessions) AS sessions, SUM(active_users) AS active_users,
        SUM(key_events) AS key_events,
        SAFE_DIVIDE(SUM(engagement_secs), SUM(sessions)) AS avg_engagement_secs
      FROM ${T_GA4_CH}
      WHERE site = @site AND date >= DATE_SUB(CURRENT_DATE('Asia/Tokyo'), INTERVAL @days DAY)
      GROUP BY source, medium ORDER BY sessions DESC LIMIT 50`,
    params: { site, days },
  });
  return rows.map((r) => ({
    source: String(r.source ?? "(direct)"),
    medium: String(r.medium ?? "(none)"),
    sessions: Number(r.sessions ?? 0),
    active_users: Number(r.active_users ?? 0),
    key_events: Number(r.key_events ?? 0),
    avg_engagement_secs: Number(r.avg_engagement_secs ?? 0),
  }));
}

export type PageStat = {
  page: string;
  views: number;
  sessions: number;
  active_users: number;
  key_events: number;
  cvr: number;
  avg_engagement_secs: number;
  bounce_rate: number;
};

export async function fetchGa4PageStats(site: string, days: number): Promise<PageStat[]> {
  const { rows } = await runQuery<Record<string, unknown>>({
    query: `
      SELECT page, SUM(views) AS views, SUM(sessions) AS sessions,
        SUM(active_users) AS active_users, SUM(key_events) AS key_events,
        SAFE_DIVIDE(SUM(key_events), SUM(sessions)) AS cvr,
        SAFE_DIVIDE(SUM(engagement_secs), SUM(sessions)) AS avg_engagement_secs,
        SAFE_DIVIDE(SUM(bounce_rate * sessions), SUM(sessions)) AS bounce_rate
      FROM ${T_GA4_PAGE}
      WHERE site = @site AND date >= DATE_SUB(CURRENT_DATE('Asia/Tokyo'), INTERVAL @days DAY)
      GROUP BY page ORDER BY sessions DESC LIMIT 100`,
    params: { site, days },
  });
  return rows.map((r) => ({
    page: String(r.page ?? ""),
    views: Number(r.views ?? 0),
    sessions: Number(r.sessions ?? 0),
    active_users: Number(r.active_users ?? 0),
    key_events: Number(r.key_events ?? 0),
    cvr: Number(r.cvr ?? 0),
    avg_engagement_secs: Number(r.avg_engagement_secs ?? 0),
    bounce_rate: Number(r.bounce_rate ?? 0),
  }));
}

// ───────────────────────────────────────────────────────────
// seo_proposals（週次AI提案。生成はPhase 2、閲覧・対応記録はPhase 1から）
// ───────────────────────────────────────────────────────────

export async function listProposals(site?: string): Promise<SeoProposal[]> {
  const { rows } = await runQuery<Record<string, unknown>>({
    query: `
      SELECT * FROM ${T_PROPOSALS}
      ${site ? "WHERE site = @site" : ""}
      ORDER BY week DESC, kind, created_at
      LIMIT 500`,
    params: site ? { site } : undefined,
  });
  return rows.map((r) => ({
    id: String(r.id),
    site: String(r.site),
    week: bqString(r.week) ?? "",
    kind: (r.kind === "ux" ? "ux" : "seo") as SeoProposal["kind"],
    title: String(r.title ?? ""),
    body: String(r.body ?? ""),
    basis: (r.basis as string) ?? null,
    status: (r.status as ProposalStatus) ?? "未対応",
    memo: (r.memo as string) ?? null,
    effect_note: (r.effect_note as string) ?? null,
    created_at: bqString(r.created_at) ?? "",
    updated_at: bqString(r.updated_at) ?? "",
  }));
}

export async function updateProposal(
  id: string,
  status: ProposalStatus,
  memo: string | null
): Promise<boolean> {
  const { affected } = await runQuery({
    query: `
      UPDATE ${T_PROPOSALS}
      SET status = @status, memo = @memo, updated_at = CURRENT_TIMESTAMP()
      WHERE id = @id`,
    params: { id, status, memo },
    types: { memo: "STRING" },
  });
  return affected > 0;
}

// ───────────────────────────────────────────────────────────
// ga4_user_sessions（GA4 BigQueryエクスポートからのユーザー単位集約）
// エクスポート（analytics_{property}.events_YYYYMMDD）が有効なプロパティのみ対象。
// ───────────────────────────────────────────────────────────

const T_USER_SESSIONS = `\`${GCP_PROJECT}.${BQ_DATASET}.ga4_user_sessions\``;

// キーイベントとして数えるイベント名（サイト別設定は将来の拡張）
const KEY_EVENT_NAMES = ["generate_lead", "file_download", "form_submit", "click_tel", "purchase"];

export async function hasUserSessions(site: string, propertyId: string, date: string): Promise<boolean> {
  const { rows } = await runQuery<{ n: number }>({
    query: `SELECT COUNT(*) AS n FROM ${T_USER_SESSIONS}
      WHERE site = @site AND property_id = @pid AND date = @date`,
    params: { site, pid: propertyId, date },
  });
  return Number(rows[0]?.n ?? 0) > 0;
}

// events_YYYYMMDD をセッション単位に集約して取り込む。テーブル未着（エクスポート遅延）は
// 呼び出し側で notFound を握りつぶして翌日に回す。
export async function aggregateUserSessions(
  site: string,
  propertyId: string,
  date: string // YYYY-MM-DD
): Promise<number> {
  if (!/^\d{4,}$/.test(propertyId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 0;
  const suffix = date.replaceAll("-", "");
  const eventsTable = `\`${GCP_PROJECT}.analytics_${propertyId}.events_${suffix}\``;
  const { affected } = await runQuery({
    query: `
      INSERT INTO ${T_USER_SESSIONS}
        (site, property_id, date, user_key, user_id, is_identified, session_id, started_at,
         source, medium, channel, landing_page, pages, page_count, key_events, key_event_detail,
         engagement_secs, fetched_at)
      WITH ev AS (
        SELECT
          user_pseudo_id,
          user_id,
          (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS sid,
          event_name,
          event_timestamp,
          (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS page_location,
          (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec') AS engagement_ms,
          collected_traffic_source.manual_source AS src,
          collected_traffic_source.manual_medium AS med
        FROM ${eventsTable}
      )
      SELECT
        @site,
        @pid,
        DATE(@date),
        COALESCE(ANY_VALUE(user_id), user_pseudo_id) AS user_key,
        ANY_VALUE(user_id) AS user_id,
        ANY_VALUE(user_id) IS NOT NULL AS is_identified,
        CAST(sid AS STRING) AS session_id,
        TIMESTAMP_MICROS(MIN(event_timestamp)) AS started_at,
        ARRAY_AGG(src IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)] AS source,
        ARRAY_AGG(med IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)] AS medium,
        CASE
          WHEN ARRAY_AGG(med IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)] = 'organic'
            THEN 'Organic Search'
          WHEN ARRAY_AGG(med IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)] IN ('cpc', 'ppc', 'paid')
            THEN 'Paid Search'
          WHEN ARRAY_AGG(med IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)] = 'referral'
            THEN 'Referral'
          WHEN ARRAY_AGG(med IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)] = 'email'
            THEN 'Email'
          WHEN ARRAY_AGG(src IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)] IS NULL
            THEN 'Direct'
          ELSE 'その他'
        END AS channel,
        SPLIT(REGEXP_REPLACE(
          ARRAY_AGG(IF(event_name = 'page_view', page_location, NULL) IGNORE NULLS
            ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)],
          r'^https?://[^/]+', ''), '?')[SAFE_OFFSET(0)] AS landing_page,
        STRING_AGG(
          IF(event_name = 'page_view',
            SPLIT(REGEXP_REPLACE(page_location, r'^https?://[^/]+', ''), '?')[SAFE_OFFSET(0)],
            NULL),
          ' → ' ORDER BY event_timestamp LIMIT 20) AS pages,
        COUNTIF(event_name = 'page_view') AS page_count,
        COUNTIF(event_name IN UNNEST(@keyEvents)) AS key_events,
        -- CVの発生タイミング: 「イベント名（ページ・時刻）」を発生順に連結
        STRING_AGG(
          IF(event_name IN UNNEST(@keyEvents),
            CONCAT(event_name, '（',
              IFNULL(SPLIT(REGEXP_REPLACE(page_location, r'^https?://[^/]+', ''), '?')[SAFE_OFFSET(0)], '-'),
              '・', FORMAT_TIMESTAMP('%H:%M', TIMESTAMP_MICROS(event_timestamp), 'Asia/Tokyo'), '）'),
            NULL),
          ' / ' ORDER BY event_timestamp) AS key_event_detail,
        IFNULL(SUM(engagement_ms), 0) / 1000 AS engagement_secs,
        CURRENT_TIMESTAMP() AS fetched_at
      FROM ev
      WHERE sid IS NOT NULL
      GROUP BY user_pseudo_id, sid`,
    params: { site, pid: propertyId, date, keyEvents: KEY_EVENT_NAMES },
    types: { keyEvents: ["STRING"] },
  });
  return affected;
}

export type UserSummary = {
  user_key: string;
  is_identified: boolean;
  first_channel: string;
  sessions: number;
  pages: number;
  key_events: number;
  avg_engagement_secs: number;
  last_date: string;
};

export async function fetchTopUsers(site: string, days: number, limit = 50): Promise<UserSummary[]> {
  const { rows } = await runQuery<Record<string, unknown>>({
    query: `
      SELECT
        user_key,
        LOGICAL_OR(is_identified) AS is_identified,
        ARRAY_AGG(channel ORDER BY started_at LIMIT 1)[SAFE_OFFSET(0)] AS first_channel,
        COUNT(*) AS sessions,
        IFNULL(SUM(page_count), 0) AS pages,
        IFNULL(SUM(key_events), 0) AS key_events,
        SAFE_DIVIDE(SUM(engagement_secs), COUNT(*)) AS avg_engagement_secs,
        CAST(MAX(date) AS STRING) AS last_date
      FROM ${T_USER_SESSIONS}
      WHERE site = @site AND date >= DATE_SUB(CURRENT_DATE('Asia/Tokyo'), INTERVAL @days DAY)
      GROUP BY user_key
      ORDER BY key_events DESC, sessions DESC, pages DESC
      LIMIT @lim`,
    params: { site, days, lim: limit },
  });
  return rows.map((r) => ({
    user_key: String(r.user_key),
    is_identified: Boolean(r.is_identified),
    first_channel: String(r.first_channel ?? "—"),
    sessions: Number(r.sessions ?? 0),
    pages: Number(r.pages ?? 0),
    key_events: Number(r.key_events ?? 0),
    avg_engagement_secs: Number(r.avg_engagement_secs ?? 0),
    last_date: String(r.last_date ?? ""),
  }));
}

export type JourneySession = {
  date: string;
  start_time: string; // セッション開始時刻（JST HH:MM）
  channel: string;
  source: string | null;
  medium: string | null;
  landing_page: string | null;
  pages: string | null;
  page_count: number;
  key_events: number;
  key_event_detail: string | null; // 例: "file_download（/seminar/・18:23）"
  engagement_secs: number;
};

export async function fetchUserJourney(site: string, userKey: string): Promise<JourneySession[]> {
  const { rows } = await runQuery<Record<string, unknown>>({
    query: `
      SELECT CAST(date AS STRING) AS date,
        FORMAT_TIMESTAMP('%H:%M', started_at, 'Asia/Tokyo') AS start_time,
        channel, source, medium, landing_page, pages,
        page_count, key_events, key_event_detail, engagement_secs
      FROM ${T_USER_SESSIONS}
      WHERE site = @site AND user_key = @userKey
      ORDER BY started_at
      LIMIT 30`,
    params: { site, userKey },
  });
  return rows.map((r) => ({
    date: String(r.date),
    start_time: String(r.start_time ?? ""),
    channel: String(r.channel ?? "—"),
    source: (r.source as string) ?? null,
    medium: (r.medium as string) ?? null,
    landing_page: (r.landing_page as string) ?? null,
    pages: (r.pages as string) ?? null,
    page_count: Number(r.page_count ?? 0),
    key_events: Number(r.key_events ?? 0),
    key_event_detail: (r.key_event_detail as string) ?? null,
    engagement_secs: Number(r.engagement_secs ?? 0),
  }));
}

export type CvPath = { pattern: string; users: number; avg_sessions: number };
export type CvStats = { cv_users: number; avg_sessions: number; avg_days_to_cv: number };

// CVしたユーザーの「チャネル遷移パターン」を集計する（王道経路）。
// セッションごとのチャネルを → で連結し、CVが発生したセッションに ✓ を付ける。
export async function fetchCvPaths(
  site: string,
  days: number
): Promise<{ paths: CvPath[]; stats: CvStats }> {
  const { rows } = await runQuery<Record<string, unknown>>({
    query: `
      WITH sess AS (
        SELECT * FROM ${T_USER_SESSIONS}
        WHERE site = @site AND date >= DATE_SUB(CURRENT_DATE('Asia/Tokyo'), INTERVAL @days DAY)
      ), per_user AS (
        SELECT
          user_key,
          COUNT(*) AS sessions,
          MIN(started_at) AS first_seen,
          MIN(IF(key_events > 0, started_at, NULL)) AS first_cv,
          STRING_AGG(CONCAT(channel, IF(key_events > 0, '✓', '')), '→' ORDER BY started_at LIMIT 8)
            AS pattern
        FROM sess GROUP BY user_key
      )
      SELECT pattern, COUNT(*) AS users, AVG(sessions) AS avg_sessions,
        (SELECT COUNT(*) FROM per_user WHERE first_cv IS NOT NULL) AS cv_users,
        (SELECT AVG(sessions) FROM per_user WHERE first_cv IS NOT NULL) AS cv_avg_sessions,
        (SELECT AVG(TIMESTAMP_DIFF(first_cv, first_seen, HOUR) / 24)
          FROM per_user WHERE first_cv IS NOT NULL) AS avg_days_to_cv
      FROM per_user
      WHERE first_cv IS NOT NULL
      GROUP BY pattern
      ORDER BY users DESC
      LIMIT 10`,
    params: { site, days },
  });
  const first = rows[0] ?? {};
  return {
    paths: rows.map((r) => ({
      pattern: String(r.pattern ?? ""),
      users: Number(r.users ?? 0),
      avg_sessions: Number(r.avg_sessions ?? 0),
    })),
    stats: {
      cv_users: Number(first.cv_users ?? 0),
      avg_sessions: Number(first.cv_avg_sessions ?? 0),
      avg_days_to_cv: Number(first.avg_days_to_cv ?? 0),
    },
  };
}
