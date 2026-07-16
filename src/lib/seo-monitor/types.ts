// SEO観測ツールの型定義。BigQuery テーブルのスキーマと1:1で対応する。
// テーブル作成DDLは scripts/create-seo-tables.mjs を参照。

// サイトごとの取得設定（seo_sites）。site は rank-tracker と同じ targetKey 正規化ドメイン。
export type SeoSite = {
  site: string;
  gsc_enabled: boolean;
  // Search Console のプロパティ識別子（"sc-domain:example.com" または "https://example.com/"）
  gsc_site_url: string | null;
  ga4_enabled: boolean;
  // GA4プロパティID。カンマ区切りで複数指定可（例: "391113939,507410349"）。
  // 複数の場合はプロパティ別に取得して表示時に合算する（shift-ai＝本体＋serviceサブドメイン等）。
  ga4_property_id: string | null;
  // 省略時は https://{site}/sitemap.xml
  sitemap_url: string | null;
  // サイト本体へのアクセス（sitemap取得等）を許可するか。
  // クライアント要件でクロール不可のサイト（例: RASIK＝ブロック対策で高頻度アクセス禁止）は false。
  // false の場合、URL台帳はGSC検索結果に出たURLから構築する（GSC APIはGoogle側のデータなので使用可）。
  crawl_enabled: boolean;
  // URL検査ローテーションの1日あたり件数（APIクォータはサイトあたり2,000件/日）
  inspection_daily_limit: number;
  // 「長期未クロール」と判定する経過日数のしきい値
  stale_days: number;
  updated_at?: string;
};

export const DEFAULT_SEO_SITE: Omit<SeoSite, "site"> = {
  gsc_enabled: false,
  gsc_site_url: null,
  ga4_enabled: false,
  ga4_property_id: null,
  sitemap_url: null,
  crawl_enabled: true,
  inspection_daily_limit: 60,
  stale_days: 40,
};

// URL検査ローテーションの対象URL台帳（seo_urls）
export type SeoUrl = {
  site: string;
  url: string;
  source: string; // "sitemap" | "manual" | "coverage"
  index_target: boolean;
  active: boolean;
  exclude_reason: string | null;
  discovered_at: string;
  last_inspected_at: string | null;
};

// GSC 検索アナリティクス（gsc_query_stats: date × query × page）
export type GscQueryStatRow = {
  site: string;
  date: string; // YYYY-MM-DD
  query: string;
  page: string;
  impressions: number;
  clicks: number;
  position: number;
  fetched_at: string;
};

// URL検査結果ログ（gsc_url_inspections: 検査1回につき1行の追記）
export type GscInspectionRow = {
  site: string;
  url: string;
  inspected_at: string;
  verdict: string | null; // PASS / NEUTRAL / FAIL
  coverage_state: string | null; // 例: "Submitted and indexed"
  indexing_state: string | null; // INDEXING_ALLOWED / BLOCKED_BY_META_TAG など
  page_fetch_state: string | null; // SUCCESSFUL / NOT_FOUND など
  robots_txt_state: string | null;
  google_canonical: string | null;
  user_canonical: string | null;
  canonical_match: boolean | null;
  last_crawl_time: string | null;
};

// カバレッジレポートのスナップショット（gsc_coverage_snapshots: スクレイパーが将来書き込む）
export type CoverageSnapshotRow = {
  site: string;
  snapshot_date: string;
  bucket: string; // "indexed" | "not_indexed" | "error"
  reason: string; // 例: "クロール済み - インデックス未登録"
  count: number;
  fetched_at: string;
};

// SeoSite の ga4_property_id（カンマ区切り）を配列へ展開する
export function ga4PropertyIds(s: Pick<SeoSite, "ga4_property_id">): string[] {
  return (s.ga4_property_id ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => /^\d{4,}$/.test(v));
}

// GA4 チャネル×ソース/メディア 日次（ga4_channel_daily）
export type Ga4ChannelRow = {
  site: string;
  property_id: string;
  date: string;
  channel: string;
  source: string;
  medium: string;
  sessions: number;
  active_users: number;
  views: number;
  key_events: number;
  engagement_secs: number;
  bounce_rate: number;
  fetched_at: string;
};

// GA4 ランディングページ 日次（ga4_page_daily）
export type Ga4PageRow = {
  site: string;
  property_id: string;
  date: string;
  page: string;
  sessions: number;
  active_users: number;
  views: number;
  key_events: number;
  engagement_secs: number;
  bounce_rate: number;
  fetched_at: string;
};

// 週次AI提案（seo_proposals）。生成はPhase 2、Phase 1ではテーブル＋閲覧/更新UIのみ。
export type SeoProposal = {
  id: string;
  site: string;
  week: string; // 生成週の月曜（DATE）
  kind: "seo" | "ux";
  title: string;
  body: string;
  basis: string | null;
  status: ProposalStatus;
  memo: string | null;
  effect_note: string | null;
  created_at: string;
  updated_at: string;
};

export const PROPOSAL_STATUSES = [
  "未対応",
  "実装する",
  "一部対応",
  "実装しない",
  "実装済み",
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export function isProposalStatus(v: unknown): v is ProposalStatus {
  return typeof v === "string" && (PROPOSAL_STATUSES as readonly string[]).includes(v);
}
