// BigQuery クライアント層。rank_tracking.serp_results への書き込みと履歴読み取り。
//
// 認証の切り替え:
//   - 本番(Vercel): 環境変数 GCP_SA_KEY_BASE64（SA鍵JSONのbase64）があれば credentials で初期化
//   - ローカル: 上記が無ければ ADC（gcloud auth application-default login）で初期化
// base64経由なので private_key の改行崩れは起きない。
//
// 注意: テーブルは事前に作成済み前提で、ここでは作成しない
// （本番SAは書き込みのみの最小権限に保つため）。

import { BigQuery } from "@google-cloud/bigquery";
import type { SerpResult, SerpRow } from "./types";

const GCP_PROJECT = process.env.GCP_PROJECT ?? "tidal-fusion-439015-e8";
const BQ_DATASET = process.env.BQ_DATASET ?? "rank_tracking";
const BQ_TABLE = process.env.BQ_TABLE ?? "serp_results";
const BQ_LOCATION = process.env.BQ_LOCATION ?? "asia-northeast1";

const TABLE_FQN = `\`${GCP_PROJECT}.${BQ_DATASET}.${BQ_TABLE}\``;

let cached: BigQuery | null = null;

export function getBigQuery(): BigQuery {
  if (cached) return cached;

  const base = { projectId: GCP_PROJECT, location: BQ_LOCATION };
  const b64 = process.env.GCP_SA_KEY_BASE64;

  if (b64 && b64.trim() !== "") {
    const creds = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    cached = new BigQuery({
      ...base,
      credentials: {
        client_email: creds.client_email,
        private_key: creds.private_key,
      },
    });
  } else {
    // ローカル: ADC
    cached = new BigQuery(base);
  }
  return cached;
}

// ターゲットドメインの正規化（www. 除去・小文字化）
export function targetKey(domain: string): string {
  return domain.toLowerCase().replace(/^www\./, "");
}

// SERP結果を serp_results に追記する。書き込んだ行数を返す。
export async function insertResults(
  results: SerpResult[],
  keyword: string,
  targetDomain: string,
  checkedAt: string
): Promise<number> {
  if (results.length === 0) return 0;

  const target = targetKey(targetDomain);
  const rows: SerpRow[] = results.map((r) => ({
    checked_at: checkedAt,
    keyword,
    rank: r.rank,
    url: r.url,
    domain: r.domain,
    title: r.title || null,
    is_target: r.domain === target,
  }));

  await getBigQuery().dataset(BQ_DATASET).table(BQ_TABLE).insert(rows);
  return rows.length;
}

// 各キーワードの「最新計測」における自社ドメインの順位サマリ
export type LatestRank = {
  keyword: string;
  checked_at: string;
  total: number; // その計測での取得件数
  rank: number | null; // 圏外なら null
  url: string | null;
};

export async function fetchLatestRanks(targetDomain: string): Promise<LatestRank[]> {
  const target = targetKey(targetDomain);
  const sql = `
    WITH latest AS (
      SELECT keyword, MAX(checked_at) AS checked_at
      FROM ${TABLE_FQN}
      GROUP BY keyword
    ),
    batch AS (
      SELECT s.keyword, s.checked_at, s.rank, s.url, s.domain
      FROM ${TABLE_FQN} s
      JOIN latest l ON s.keyword = l.keyword AND s.checked_at = l.checked_at
    )
    SELECT
      keyword,
      FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', ANY_VALUE(checked_at), 'Asia/Tokyo') AS checked_at,
      COUNT(*) AS total,
      MIN(IF(domain = @target, rank, NULL)) AS rank,
      ARRAY_AGG(IF(domain = @target, url, NULL) IGNORE NULLS ORDER BY rank LIMIT 1)[SAFE_OFFSET(0)] AS url
    FROM batch
    GROUP BY keyword
    ORDER BY keyword
  `;
  const [rows] = await getBigQuery().query({
    query: sql,
    location: BQ_LOCATION,
    params: { target },
  });
  return rows as LatestRank[];
}

// 特定キーワードの順位推移（計測日時ごとの自社ドメイン順位）
export type RankTrendPoint = {
  checked_at: string;
  total: number;
  rank: number | null;
};

export async function fetchRankTrend(
  keyword: string,
  targetDomain: string,
  limit = 60
): Promise<RankTrendPoint[]> {
  const target = targetKey(targetDomain);
  const sql = `
    SELECT
      FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', checked_at, 'Asia/Tokyo') AS checked_at,
      COUNT(*) AS total,
      MIN(IF(domain = @target, rank, NULL)) AS rank
    FROM ${TABLE_FQN}
    WHERE keyword = @keyword
    GROUP BY checked_at
    ORDER BY checked_at DESC
    LIMIT ${Math.max(1, Math.trunc(limit))}
  `;
  const [rows] = await getBigQuery().query({
    query: sql,
    location: BQ_LOCATION,
    params: { keyword, target },
  });
  return rows as RankTrendPoint[];
}
