// JINA順位計測ツールの共通型。
// BigQuery テーブル rank_tracking.serp_results のスキーマと対応する。

// JINA検索APIから取得したSERP1件（通し順位つき）
export type SerpResult = {
  rank: number;
  url: string;
  domain: string;
  title: string;
};

// BigQuery serp_results テーブルの1行
// （既存のPython版 rank_tracker/bigquery.py と同一スキーマ）
export type SerpRow = {
  checked_at: string; // ISO8601（TIMESTAMP）
  keyword: string;
  rank: number;
  url: string;
  domain: string;
  title: string | null;
  is_target: boolean;
};
