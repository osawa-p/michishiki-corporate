// SEO観測ツールのBigQueryテーブルを作成する（存在すればスキップ）。
// 実行: node scripts/create-seo-tables.mjs
// 認証: GCP_SA_KEY_BASE64 があればSA鍵、無ければ ADC（gcloud auth application-default login）。
// リポジトリ規約により、アプリ側コードはテーブルを作成しない（事前作成前提）。
import { BigQuery } from "@google-cloud/bigquery";

const GCP_PROJECT = process.env.GCP_PROJECT ?? "tidal-fusion-439015-e8";
const BQ_DATASET = process.env.BQ_DATASET ?? "rank_tracking";
const BQ_LOCATION = process.env.BQ_LOCATION ?? "asia-northeast1";

const b64 = process.env.GCP_SA_KEY_BASE64;
const bq = new BigQuery({
  projectId: GCP_PROJECT,
  location: BQ_LOCATION,
  ...(b64 && b64.trim() !== ""
    ? (() => {
        const creds = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
        return { credentials: { client_email: creds.client_email, private_key: creds.private_key } };
      })()
    : {}),
});

const TABLES = [
  {
    name: "seo_sites",
    schema: [
      { name: "site", type: "STRING", mode: "REQUIRED" },
      { name: "gsc_enabled", type: "BOOL" },
      { name: "gsc_site_url", type: "STRING" },
      { name: "ga4_enabled", type: "BOOL" },
      { name: "ga4_property_id", type: "STRING" },
      { name: "sitemap_url", type: "STRING" },
      { name: "crawl_enabled", type: "BOOL" },
      { name: "inspection_daily_limit", type: "INT64" },
      { name: "stale_days", type: "INT64" },
      { name: "updated_at", type: "TIMESTAMP" },
    ],
  },
  {
    name: "seo_urls",
    schema: [
      { name: "site", type: "STRING", mode: "REQUIRED" },
      { name: "url", type: "STRING", mode: "REQUIRED" },
      { name: "source", type: "STRING" },
      { name: "index_target", type: "BOOL" },
      { name: "active", type: "BOOL" },
      { name: "exclude_reason", type: "STRING" },
      { name: "discovered_at", type: "TIMESTAMP" },
      { name: "last_inspected_at", type: "TIMESTAMP" },
    ],
  },
  {
    name: "gsc_query_stats",
    schema: [
      { name: "site", type: "STRING", mode: "REQUIRED" },
      { name: "date", type: "DATE", mode: "REQUIRED" },
      { name: "query", type: "STRING" },
      { name: "page", type: "STRING" },
      { name: "impressions", type: "INT64" },
      { name: "clicks", type: "INT64" },
      { name: "position", type: "FLOAT64" },
      { name: "fetched_at", type: "TIMESTAMP" },
    ],
    timePartitioning: { type: "DAY", field: "date" },
  },
  {
    name: "gsc_url_inspections",
    schema: [
      { name: "site", type: "STRING", mode: "REQUIRED" },
      { name: "url", type: "STRING", mode: "REQUIRED" },
      { name: "inspected_at", type: "TIMESTAMP", mode: "REQUIRED" },
      { name: "verdict", type: "STRING" },
      { name: "coverage_state", type: "STRING" },
      { name: "indexing_state", type: "STRING" },
      { name: "page_fetch_state", type: "STRING" },
      { name: "robots_txt_state", type: "STRING" },
      { name: "google_canonical", type: "STRING" },
      { name: "user_canonical", type: "STRING" },
      { name: "canonical_match", type: "BOOL" },
      { name: "last_crawl_time", type: "TIMESTAMP" },
    ],
  },
  {
    name: "gsc_coverage_snapshots",
    schema: [
      { name: "site", type: "STRING", mode: "REQUIRED" },
      { name: "snapshot_date", type: "DATE", mode: "REQUIRED" },
      { name: "bucket", type: "STRING" },
      { name: "reason", type: "STRING" },
      { name: "count", type: "INT64" },
      { name: "fetched_at", type: "TIMESTAMP" },
    ],
  },
  {
    name: "ga4_channel_daily",
    schema: [
      { name: "site", type: "STRING", mode: "REQUIRED" },
      { name: "date", type: "DATE", mode: "REQUIRED" },
      { name: "channel", type: "STRING" },
      { name: "source", type: "STRING" },
      { name: "medium", type: "STRING" },
      { name: "sessions", type: "INT64" },
      { name: "active_users", type: "INT64" },
      { name: "views", type: "INT64" },
      { name: "key_events", type: "INT64" },
      { name: "engagement_secs", type: "FLOAT64" },
      { name: "bounce_rate", type: "FLOAT64" },
      { name: "fetched_at", type: "TIMESTAMP" },
    ],
    timePartitioning: { type: "DAY", field: "date" },
  },
  {
    name: "ga4_page_daily",
    schema: [
      { name: "site", type: "STRING", mode: "REQUIRED" },
      { name: "date", type: "DATE", mode: "REQUIRED" },
      { name: "page", type: "STRING" },
      { name: "sessions", type: "INT64" },
      { name: "active_users", type: "INT64" },
      { name: "views", type: "INT64" },
      { name: "key_events", type: "INT64" },
      { name: "engagement_secs", type: "FLOAT64" },
      { name: "bounce_rate", type: "FLOAT64" },
      { name: "fetched_at", type: "TIMESTAMP" },
    ],
    timePartitioning: { type: "DAY", field: "date" },
  },
  {
    name: "seo_proposals",
    schema: [
      { name: "id", type: "STRING", mode: "REQUIRED" },
      { name: "site", type: "STRING", mode: "REQUIRED" },
      { name: "week", type: "DATE", mode: "REQUIRED" },
      { name: "kind", type: "STRING", mode: "REQUIRED" },
      { name: "title", type: "STRING", mode: "REQUIRED" },
      { name: "body", type: "STRING" },
      { name: "basis", type: "STRING" },
      { name: "status", type: "STRING" },
      { name: "memo", type: "STRING" },
      { name: "effect_note", type: "STRING" },
      { name: "created_at", type: "TIMESTAMP" },
      { name: "updated_at", type: "TIMESTAMP" },
    ],
  },
];

const dataset = bq.dataset(BQ_DATASET);
for (const t of TABLES) {
  const table = dataset.table(t.name);
  const [exists] = await table.exists();
  if (exists) {
    console.log(`skip: ${BQ_DATASET}.${t.name}（既存）`);
    continue;
  }
  await dataset.createTable(t.name, {
    schema: t.schema,
    location: BQ_LOCATION,
    ...(t.timePartitioning ? { timePartitioning: t.timePartitioning } : {}),
  });
  console.log(`created: ${BQ_DATASET}.${t.name}`);
}
console.log("done");
