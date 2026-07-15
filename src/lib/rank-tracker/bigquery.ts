// BigQuery クライアント層。rank_tracking.serp_results への書き込みと履歴読み取り、
// および追跡キーワード設定（tracked_keywords）の CRUD。
//
// 認証の切り替え:
//   - 本番(Vercel): 環境変数 GCP_SA_KEY_BASE64（SA鍵JSONのbase64）があれば credentials で初期化
//   - ローカル: 上記が無ければ ADC（gcloud auth application-default login）で初期化
// base64経由なので private_key の改行崩れは起きない。
//
// 注意: テーブルは事前に作成済み前提で、ここでは作成しない。

import { BigQuery, type Query } from "@google-cloud/bigquery";
import type { SerpResult, SerpRow } from "./types";
import { CADENCES, type Cadence } from "./cadence";
import { targetKey } from "./domain";

// 互換のため再エクスポート（正規化ロジック本体は ./domain に移動）
export { targetKey, isValidTargetDomain } from "./domain";

const GCP_PROJECT = process.env.GCP_PROJECT ?? "tidal-fusion-439015-e8";
const BQ_DATASET = process.env.BQ_DATASET ?? "rank_tracking";
const BQ_TABLE = process.env.BQ_TABLE ?? "serp_results";
// 定期取得の追跡キーワード設定テーブル（keyword, target_domain, cadence, tags, next_run_at）
const BQ_KEYWORDS_TABLE = process.env.BQ_KEYWORDS_TABLE ?? "tracked_keywords";
const BQ_LOCATION = process.env.BQ_LOCATION ?? "asia-northeast1";

const TABLE_FQN = `\`${GCP_PROJECT}.${BQ_DATASET}.${BQ_TABLE}\``;
const KW_TABLE_FQN = `\`${GCP_PROJECT}.${BQ_DATASET}.${BQ_KEYWORDS_TABLE}\``;

// cadence 値は CADENCES 由来のコード定数のみ（SQLへ直接埋め込んで安全）
const CADENCE_DAYS_CASE = CADENCES.filter((c) => c.days != null)
  .map((c) => `WHEN '${c.value}' THEN ${c.days}`)
  .join(" ");

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

type QueryJobOptions = {
  query: string;
  params?: Record<string, unknown>;
  types?: Record<string, unknown>;
};

// クエリジョブを実行し、行と DML 影響行数を返す共通ヘルパー（members.ts からも利用）
export async function runQuery<T>(opts: QueryJobOptions): Promise<{ rows: T[]; affected: number }> {
  const q: Query = { query: opts.query, location: BQ_LOCATION, params: opts.params };
  // types はパラメータ型の明示（NULL/空配列を含むstruct・配列で必要）
  if (opts.types) q.types = opts.types as Query["types"];
  const [job] = await getBigQuery().createQueryJob(q);
  const [rows] = await job.getQueryResults();
  const [meta] = await job.getMetadata();
  const affected = Number(meta?.statistics?.query?.numDmlAffectedRows ?? NaN);
  return { rows: rows as T[], affected: Number.isFinite(affected) ? affected : 0 };
}

// ───────────────────────────────────────────────────────────
// SERP 結果（serp_results）
// ───────────────────────────────────────────────────────────

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

// 各キーワードの「最新計測」における自社ドメインの順位サマリ（前回計測との差分付き）
export type LatestRank = {
  keyword: string;
  checked_at: string;
  total: number; // その計測での取得件数
  rank: number | null; // 未検出なら null
  url: string | null;
  prev_rank: number | null; // 前回計測の順位（未検出なら null）
  has_prev: boolean; // 前回計測が存在するか
};

export async function fetchLatestRanks(
  targetDomain: string,
  opts: { onlyTracked?: boolean } = {}
): Promise<LatestRank[]> {
  const target = targetKey(targetDomain);
  const onlyTracked = opts.onlyTracked ?? false;
  const sql = `
    WITH tracked AS (
      SELECT DISTINCT keyword FROM ${KW_TABLE_FQN} WHERE target_domain = @target
    ),
    recent AS (
      SELECT keyword, checked_at,
             ROW_NUMBER() OVER (PARTITION BY keyword ORDER BY checked_at DESC) AS rn
      FROM (
        SELECT DISTINCT keyword, checked_at FROM ${TABLE_FQN}
        WHERE (@onlyTracked = FALSE OR keyword IN (SELECT keyword FROM tracked))
      )
      QUALIFY rn <= 2
    ),
    agg AS (
      SELECT s.keyword, r.rn, r.checked_at,
             COUNT(*) AS total,
             MIN(IF(s.domain = @target, s.rank, NULL)) AS rank,
             ARRAY_AGG(IF(s.domain = @target, s.url, NULL) IGNORE NULLS ORDER BY s.rank LIMIT 1)[SAFE_OFFSET(0)] AS url
      FROM ${TABLE_FQN} s
      JOIN recent r ON s.keyword = r.keyword AND s.checked_at = r.checked_at
      GROUP BY s.keyword, r.rn, r.checked_at
    )
    SELECT cur.keyword,
           FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', cur.checked_at, 'Asia/Tokyo') AS checked_at,
           cur.total, cur.rank, cur.url,
           prev.rank AS prev_rank,
           (prev.keyword IS NOT NULL) AS has_prev
    FROM agg cur
    LEFT JOIN agg prev ON prev.keyword = cur.keyword AND prev.rn = 2
    WHERE cur.rn = 1
    ORDER BY cur.keyword
  `;
  const { rows } = await runQuery<LatestRank>({
    query: sql,
    params: { target, onlyTracked },
  });
  return rows;
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
  opts: { fromDays?: number; limit?: number } = {}
): Promise<RankTrendPoint[]> {
  const target = targetKey(targetDomain);
  const fromDays = Math.max(0, Math.trunc(opts.fromDays ?? 0)); // 0 = 全期間
  const limit = Math.max(1, Math.trunc(opts.limit ?? 120));
  const sql = `
    SELECT
      FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', checked_at, 'Asia/Tokyo') AS checked_at,
      COUNT(*) AS total,
      MIN(IF(domain = @target, rank, NULL)) AS rank
    FROM ${TABLE_FQN}
    WHERE keyword = @keyword
      AND (@fromDays = 0 OR checked_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @fromDays DAY))
    GROUP BY checked_at
    ORDER BY checked_at DESC
    LIMIT ${limit}
  `;
  const { rows } = await runQuery<RankTrendPoint>({
    query: sql,
    params: { keyword, target, fromDays },
  });
  return rows;
}

// 競合込みの推移。checked_at ごとに 対象ドメイン群の順位マップを返す（古い順）。
export type TrendSeriesPoint = {
  checked_at: string;
  total: number;
  ranks: Record<string, number | null>; // domain -> その計測での最良順位
};

export async function fetchTrendWithCompetitors(
  keyword: string,
  targetDomain: string,
  competitors: string[],
  opts: { fromDays?: number } = {}
): Promise<TrendSeriesPoint[]> {
  const target = targetKey(targetDomain);
  const comps = [...new Set(competitors.map(targetKey).filter((d) => d && d !== target))].slice(0, 3);
  const fromDays = Math.max(0, Math.trunc(opts.fromDays ?? 0));
  const sql = `
    WITH scope AS (
      SELECT checked_at, domain, rank FROM ${TABLE_FQN}
      WHERE keyword = @keyword
        AND (@fromDays = 0 OR checked_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @fromDays DAY))
    ),
    totals AS (SELECT checked_at, COUNT(*) AS total FROM scope GROUP BY checked_at),
    ranks AS (
      SELECT checked_at, domain, MIN(rank) AS rank
      FROM scope
      WHERE domain = @target OR domain IN UNNEST(@comps)
      GROUP BY checked_at, domain
    )
    SELECT FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', t.checked_at, 'Asia/Tokyo') AS checked_at,
           t.total, r.domain, r.rank
    FROM totals t
    LEFT JOIN ranks r USING (checked_at)
    ORDER BY t.checked_at
  `;
  const { rows } = await runQuery<{
    checked_at: string;
    total: number;
    domain: string | null;
    rank: number | null;
  }>({
    query: sql,
    params: { keyword, target, comps, fromDays },
    types: { comps: ["STRING"] },
  });

  // checked_at ごとにピボット
  const byTime = new Map<string, TrendSeriesPoint>();
  for (const r of rows) {
    let p = byTime.get(r.checked_at);
    if (!p) {
      p = { checked_at: r.checked_at, total: r.total, ranks: {} };
      byTime.set(r.checked_at, p);
    }
    if (r.domain) p.ranks[r.domain] = r.rank;
  }
  return [...byTime.values()];
}

// 競合候補（そのキーワードのSERPで自社以外に安定して上位に出るドメイン）
export type CompetitorCandidate = {
  domain: string;
  appearances: number; // 出現した計測回数
  batches: number; // 期間内の計測回数
  avg_rank: number;
  best_rank: number;
  latest_rank: number;
};

export async function listCompetitorCandidates(
  keyword: string,
  targetDomain: string,
  opts: { fromDays?: number } = {}
): Promise<CompetitorCandidate[]> {
  const target = targetKey(targetDomain);
  const fromDays = Math.max(0, Math.trunc(opts.fromDays ?? 0));
  const sql = `
    WITH scope AS (
      SELECT checked_at, domain, MIN(rank) AS rank
      FROM ${TABLE_FQN}
      WHERE keyword = @keyword
        AND (@fromDays = 0 OR checked_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @fromDays DAY))
      GROUP BY checked_at, domain
    ),
    n AS (SELECT COUNT(DISTINCT checked_at) AS batches FROM scope)
    SELECT domain,
           COUNT(*) AS appearances,
           (SELECT batches FROM n) AS batches,
           ROUND(AVG(rank), 1) AS avg_rank,
           MIN(rank) AS best_rank,
           ARRAY_AGG(rank ORDER BY checked_at DESC LIMIT 1)[SAFE_OFFSET(0)] AS latest_rank
    FROM scope
    WHERE domain != @target
    GROUP BY domain
    HAVING AVG(rank) <= 30
    ORDER BY appearances DESC, avg_rank ASC
    LIMIT 8
  `;
  const { rows } = await runQuery<CompetitorCandidate>({
    query: sql,
    params: { keyword, target, fromDays },
  });
  return rows;
}

// サイト内全キーワードの推移＋競合を一括で返す行（ダッシュボードのプリロード用）。
// domain は自社または競合候補のみ。自社がその計測に不在の場合 domain は NULL になる。
export type SiteSeriesRow = {
  keyword: string;
  checked_at: string;
  total: number;
  domain: string | null;
  rank: number | null;
};

// サイト内全キーワードの推移＋競合候補の順位を1クエリで取得する。
// キーワード切替・競合ON/OFFのたびにBigQueryへ往復しないための一括プリロード。
export async function fetchSiteSeriesRows(
  targetDomain: string,
  opts: { fromDays?: number } = {}
): Promise<SiteSeriesRow[]> {
  const target = targetKey(targetDomain);
  const fromDays = Math.max(1, Math.trunc(opts.fromDays ?? 90));
  const sql = `
    WITH tracked AS (
      SELECT DISTINCT keyword FROM ${KW_TABLE_FQN} WHERE target_domain = @target
    ),
    scope AS (
      SELECT keyword, checked_at, domain, MIN(rank) AS rank
      FROM ${TABLE_FQN}
      WHERE keyword IN (SELECT keyword FROM tracked)
        AND checked_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @fromDays DAY)
      GROUP BY keyword, checked_at, domain
    ),
    totals AS (
      SELECT keyword, checked_at, COUNT(*) AS total
      FROM ${TABLE_FQN}
      WHERE keyword IN (SELECT keyword FROM tracked)
        AND checked_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @fromDays DAY)
      GROUP BY keyword, checked_at
    ),
    cand AS (
      SELECT keyword, domain
      FROM scope
      WHERE domain != @target
      GROUP BY keyword, domain
      HAVING AVG(rank) <= 30
      QUALIFY ROW_NUMBER() OVER (PARTITION BY keyword ORDER BY COUNT(*) DESC, AVG(rank) ASC) <= 8
    ),
    filtered AS (
      SELECT s.keyword, s.checked_at, s.domain, s.rank
      FROM scope s
      LEFT JOIN cand c ON c.keyword = s.keyword AND c.domain = s.domain
      WHERE s.domain = @target OR c.domain IS NOT NULL
    )
    SELECT t.keyword,
           FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', t.checked_at, 'Asia/Tokyo') AS checked_at,
           t.total, f.domain, f.rank
    FROM totals t
    LEFT JOIN filtered f ON f.keyword = t.keyword AND f.checked_at = t.checked_at
    ORDER BY t.keyword, t.checked_at
  `;
  const { rows } = await runQuery<SiteSeriesRow>({
    query: sql,
    params: { target, fromDays },
  });
  return rows;
}

// サイト内全キーワードの競合候補サマリを1クエリで取得する（プリロード用）。
export type SiteCandidateRow = CompetitorCandidate & { keyword: string };

export async function fetchSiteCandidates(
  targetDomain: string,
  opts: { fromDays?: number } = {}
): Promise<SiteCandidateRow[]> {
  const target = targetKey(targetDomain);
  const fromDays = Math.max(1, Math.trunc(opts.fromDays ?? 90));
  const sql = `
    WITH tracked AS (
      SELECT DISTINCT keyword FROM ${KW_TABLE_FQN} WHERE target_domain = @target
    ),
    scope AS (
      SELECT keyword, checked_at, domain, MIN(rank) AS rank
      FROM ${TABLE_FQN}
      WHERE keyword IN (SELECT keyword FROM tracked)
        AND checked_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @fromDays DAY)
      GROUP BY keyword, checked_at, domain
    ),
    n AS (SELECT keyword, COUNT(DISTINCT checked_at) AS batches FROM scope GROUP BY keyword)
    SELECT s.keyword, s.domain,
           COUNT(*) AS appearances,
           ANY_VALUE(n.batches) AS batches,
           ROUND(AVG(s.rank), 1) AS avg_rank,
           MIN(s.rank) AS best_rank,
           ARRAY_AGG(s.rank ORDER BY s.checked_at DESC LIMIT 1)[SAFE_OFFSET(0)] AS latest_rank
    FROM scope s
    JOIN n ON n.keyword = s.keyword
    WHERE s.domain != @target
    GROUP BY s.keyword, s.domain
    HAVING AVG(s.rank) <= 30
    QUALIFY ROW_NUMBER() OVER (PARTITION BY s.keyword ORDER BY COUNT(*) DESC, AVG(s.rank) ASC) <= 8
    ORDER BY s.keyword, appearances DESC, avg_rank ASC
  `;
  const { rows } = await runQuery<SiteCandidateRow>({
    query: sql,
    params: { target, fromDays },
  });
  return rows;
}

// ───────────────────────────────────────────────────────────
// 追跡キーワード設定（tracked_keywords）の CRUD
// 更新系はすべて DML（MERGE/UPDATE/DELETE）で行い、ストリーミング挿入は使わない。
// cadence が NULL の行（旧コードが作成）は 'weekly' として扱う。
// ───────────────────────────────────────────────────────────

export type TrackedKeyword = {
  keyword: string;
  target_domain: string;
  cadence: Cadence;
  tags: string[];
  next_run_at: string | null; // JST文字列。停止中は null
  created_at: string;
  updated_at: string;
};

const KW_SELECT = `
  SELECT
    keyword,
    target_domain,
    COALESCE(cadence, 'weekly') AS cadence,
    IFNULL(tags, []) AS tags,
    FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', next_run_at, 'Asia/Tokyo') AS next_run_at,
    FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', created_at, 'Asia/Tokyo') AS created_at,
    FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', updated_at, 'Asia/Tokyo') AS updated_at
  FROM ${KW_TABLE_FQN}
`;

// 追跡キーワード一覧。domain 指定でそのサイトのみ。
// dueOnly=true で「停止以外かつ次回取得が期限切れ」の行のみ（cron用、期限の古い順）。
export async function listTrackedKeywords(
  opts: { domain?: string; dueOnly?: boolean } = {}
): Promise<TrackedKeyword[]> {
  const conds: string[] = [];
  const params: Record<string, string> = {};
  if (opts.domain) {
    conds.push("target_domain = @domain");
    params.domain = targetKey(opts.domain);
  }
  if (opts.dueOnly) {
    conds.push("COALESCE(cadence, 'weekly') != 'stopped'");
    conds.push("(next_run_at IS NULL OR next_run_at <= CURRENT_TIMESTAMP())");
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const order = opts.dueOnly
    ? "ORDER BY next_run_at NULLS FIRST, keyword"
    : "ORDER BY target_domain, keyword";
  const { rows } = await runQuery<TrackedKeyword>({
    query: `${KW_SELECT} ${where} ${order}`,
    params,
  });
  return rows;
}

// 追跡サイト一覧（ダッシュボードのサイトカード用）。登録数と定期取得中の数を返す。
export type TrackedDomain = { domain: string; total: number; active: number };

export async function listTrackedDomains(): Promise<TrackedDomain[]> {
  const sql = `
    SELECT target_domain AS domain,
           COUNT(*) AS total,
           COUNTIF(COALESCE(cadence, 'weekly') != 'stopped') AS active
    FROM ${KW_TABLE_FQN}
    GROUP BY target_domain
    ORDER BY target_domain
  `;
  const { rows } = await runQuery<TrackedDomain>({ query: sql });
  return rows;
}

// キーワードを一括登録（MERGEで重複は無視）。実際に新規挿入された行数を返す。
export async function addTrackedKeywords(
  items: { keyword: string; domain: string; cadence?: Cadence; tags?: string[] }[]
): Promise<number> {
  const seen = new Set<string>();
  const uniq: { keyword: string; target_domain: string; cadence: string; tags: string[] }[] = [];
  for (const it of items) {
    const keyword = (it.keyword ?? "").trim();
    const target_domain = targetKey(it.domain ?? "");
    if (!keyword || !target_domain) continue;
    const k = JSON.stringify([keyword, target_domain]);
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push({
      keyword,
      target_domain,
      cadence: it.cadence ?? "weekly",
      tags: (it.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 10),
    });
  }
  if (uniq.length === 0) return 0;

  const sql = `
    MERGE ${KW_TABLE_FQN} T
    USING UNNEST(@items) S
    ON T.keyword = S.keyword AND T.target_domain = S.target_domain
    WHEN NOT MATCHED THEN
      INSERT (keyword, target_domain, cadence, tags, next_run_at, created_at, updated_at)
      VALUES (S.keyword, S.target_domain, S.cadence, S.tags,
              IF(S.cadence = 'stopped', NULL, CURRENT_TIMESTAMP()),
              CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
  `;
  const { affected } = await runQuery({
    query: sql,
    params: { items: uniq },
    types: {
      items: [{ keyword: "STRING", target_domain: "STRING", cadence: "STRING", tags: ["STRING"] }],
    },
  });
  return affected;
}

// 頻度・タグの更新。更新された行数を返す（0なら対象行なし）。
export async function updateTrackedKeyword(
  keyword: string,
  domain: string,
  patch: { cadence?: Cadence; tags?: string[] }
): Promise<number> {
  const sets: string[] = ["updated_at = CURRENT_TIMESTAMP()"];
  const params: Record<string, unknown> = {
    keyword: keyword.trim(),
    domain: targetKey(domain),
  };
  const types: Record<string, unknown> = {};
  if (patch.cadence) {
    sets.push("cadence = @cadence");
    // 頻度変更時は次回取得を「今すぐ期限」にして翌朝のcronで再計測させる
    sets.push("next_run_at = IF(@cadence = 'stopped', NULL, CURRENT_TIMESTAMP())");
    params.cadence = patch.cadence;
  }
  if (patch.tags) {
    sets.push("tags = @tags");
    params.tags = patch.tags.map((t) => t.trim()).filter(Boolean).slice(0, 10);
    types.tags = ["STRING"];
  }
  const sql = `
    UPDATE ${KW_TABLE_FQN}
    SET ${sets.join(", ")}
    WHERE keyword = @keyword AND target_domain = @domain
  `;
  const { affected } = await runQuery({ query: sql, params, types });
  return affected;
}

// 追跡キーワードの削除。削除された行数を返す。
export async function deleteTrackedKeyword(keyword: string, domain: string): Promise<number> {
  const sql = `
    DELETE FROM ${KW_TABLE_FQN}
    WHERE keyword = @keyword AND target_domain = @domain
  `;
  const { affected } = await runQuery({
    query: sql,
    params: { keyword: keyword.trim(), domain: targetKey(domain) },
  });
  return affected;
}

// 計測済みキーワードの next_run_at を各行の頻度に応じて先送りする（cron用）。
// 期限が来ていた行だけを動かす（期限前の行のスケジュールは保持）。
// 次回時刻は「当日0:00 UTC + n日」に丸める。CURRENT_TIMESTAMP() 起点にすると
// 計測処理の数分の遅れが毎回積み上がり、毎日設定が実質2日ごとになるため。
export async function markMeasured(keywords: string[]): Promise<number> {
  const uniq = [...new Set(keywords.map((k) => k.trim()).filter(Boolean))];
  if (uniq.length === 0) return 0;
  const sql = `
    UPDATE ${KW_TABLE_FQN}
    SET next_run_at = TIMESTAMP_ADD(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY), INTERVAL
          CASE COALESCE(cadence, 'weekly') ${CADENCE_DAYS_CASE} ELSE 7 END DAY),
        updated_at = CURRENT_TIMESTAMP()
    WHERE keyword IN UNNEST(@keywords)
      AND COALESCE(cadence, 'weekly') != 'stopped'
      AND (next_run_at IS NULL OR next_run_at <= CURRENT_TIMESTAMP())
  `;
  const { affected } = await runQuery({
    query: sql,
    params: { keywords: uniq },
    types: { keywords: ["STRING"] },
  });
  return affected;
}
