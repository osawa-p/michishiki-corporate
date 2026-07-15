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
// 定期取得の追跡キーワード設定テーブル（keyword, target_domain, enabled）
const BQ_KEYWORDS_TABLE = process.env.BQ_KEYWORDS_TABLE ?? "tracked_keywords";
const BQ_LOCATION = process.env.BQ_LOCATION ?? "asia-northeast1";

const TABLE_FQN = `\`${GCP_PROJECT}.${BQ_DATASET}.${BQ_TABLE}\``;
const KW_TABLE_FQN = `\`${GCP_PROJECT}.${BQ_DATASET}.${BQ_KEYWORDS_TABLE}\``;

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

export async function fetchLatestRanks(
  targetDomain: string,
  opts: { onlyTracked?: boolean } = {}
): Promise<LatestRank[]> {
  const target = targetKey(targetDomain);
  // onlyTracked=true のときは tracked_keywords に登録済みのキーワードだけに絞る
  // （サイト別ダッシュボード用）。false（既定）なら serp_results 内の全キーワード。
  const onlyTracked = opts.onlyTracked ?? false;
  const sql = `
    WITH tracked AS (
      SELECT DISTINCT keyword FROM ${KW_TABLE_FQN} WHERE target_domain = @target
    ),
    latest AS (
      SELECT keyword, MAX(checked_at) AS checked_at
      FROM ${TABLE_FQN}
      WHERE (@onlyTracked = FALSE OR keyword IN (SELECT keyword FROM tracked))
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
    params: { target, onlyTracked },
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

// ───────────────────────────────────────────────────────────
// 追跡キーワード設定（tracked_keywords）の CRUD
// 更新系はすべて DML（MERGE/UPDATE/DELETE）で行い、ストリーミング挿入は使わない
// （削除・更新のバッファ制約を避けるため）。行数は極小・低頻度なので DML で十分。
// ───────────────────────────────────────────────────────────

// 追跡キーワード1件（表示用に日時はJSTの文字列へ整形）
export type TrackedKeyword = {
  keyword: string;
  target_domain: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

// 追跡キーワード一覧。domain 指定でそのサイトのみ、enabledOnly で有効行のみに絞る。
export async function listTrackedKeywords(
  opts: { domain?: string; enabledOnly?: boolean } = {}
): Promise<TrackedKeyword[]> {
  const conds: string[] = [];
  const params: Record<string, string> = {};
  if (opts.domain) {
    conds.push("target_domain = @domain");
    params.domain = targetKey(opts.domain);
  }
  if (opts.enabledOnly) {
    conds.push("enabled = TRUE");
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const sql = `
    SELECT
      keyword,
      target_domain,
      enabled,
      FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', created_at, 'Asia/Tokyo') AS created_at,
      FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', updated_at, 'Asia/Tokyo') AS updated_at
    FROM ${KW_TABLE_FQN}
    ${where}
    ORDER BY target_domain, keyword
  `;
  const [rows] = await getBigQuery().query({ query: sql, location: BQ_LOCATION, params });
  return rows as TrackedKeyword[];
}

// 追跡サイト一覧（ダッシュボードのサイトカード用）。各サイトの登録数と有効数を返す。
export type TrackedDomain = { domain: string; total: number; enabled: number };

export async function listTrackedDomains(): Promise<TrackedDomain[]> {
  const sql = `
    SELECT target_domain AS domain, COUNT(*) AS total, COUNTIF(enabled) AS enabled
    FROM ${KW_TABLE_FQN}
    GROUP BY target_domain
    ORDER BY target_domain
  `;
  const [rows] = await getBigQuery().query({ query: sql, location: BQ_LOCATION });
  return rows as TrackedDomain[];
}

// キーワードを一括登録（MERGEで重複は無視）。正規化・batch内重複除去して処理件数を返す。
export async function addTrackedKeywords(
  items: { keyword: string; domain: string }[]
): Promise<number> {
  const seen = new Set<string>();
  const uniq: { keyword: string; target_domain: string }[] = [];
  for (const it of items) {
    const keyword = (it.keyword ?? "").trim();
    const target_domain = targetKey(it.domain ?? "");
    if (!keyword || !target_domain) continue;
    const k = `${keyword} ${target_domain}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push({ keyword, target_domain });
  }
  if (uniq.length === 0) return 0;

  const sql = `
    MERGE ${KW_TABLE_FQN} T
    USING UNNEST(@items) S
    ON T.keyword = S.keyword AND T.target_domain = S.target_domain
    WHEN NOT MATCHED THEN
      INSERT (keyword, target_domain, enabled, created_at, updated_at)
      VALUES (S.keyword, S.target_domain, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
  `;
  await getBigQuery().query({
    query: sql,
    location: BQ_LOCATION,
    params: { items: uniq },
    types: { items: [{ keyword: "STRING", target_domain: "STRING" }] },
  });
  return uniq.length;
}

// 定期取得のON/OFFトグル
export async function setKeywordEnabled(
  keyword: string,
  domain: string,
  enabled: boolean
): Promise<void> {
  const sql = `
    UPDATE ${KW_TABLE_FQN}
    SET enabled = @enabled, updated_at = CURRENT_TIMESTAMP()
    WHERE keyword = @keyword AND target_domain = @domain
  `;
  await getBigQuery().query({
    query: sql,
    location: BQ_LOCATION,
    params: { enabled, keyword: keyword.trim(), domain: targetKey(domain) },
  });
}

// 追跡キーワードの削除
export async function deleteTrackedKeyword(keyword: string, domain: string): Promise<void> {
  const sql = `
    DELETE FROM ${KW_TABLE_FQN}
    WHERE keyword = @keyword AND target_domain = @domain
  `;
  await getBigQuery().query({
    query: sql,
    location: BQ_LOCATION,
    params: { keyword: keyword.trim(), domain: targetKey(domain) },
  });
}
