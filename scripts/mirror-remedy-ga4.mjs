// リメディ社 GA4 BigQueryエクスポートのミラー（Windowsタスクスケジューラで日次実行）。
//
// 背景: remedy-tokyo.co.jp の GA4 エクスポートはリメディ社側プロジェクト
// (remedy-sandbox-494806) にあり、READER権限は運用者の個人アカウントのみ。
// 本番(Vercel)のSA vercel-bq-writer からは読めないため、ローカルのADC
// （個人アカウント）で events_YYYYMMDD を自社プロジェクトの同名データセット
// analytics_348392883 へテーブルコピーする。コピー後は自社エクスポート済み
// プロパティ（shift-ai等）と同じ形になり、毎朝5:30の本番cron
// (aggregateUserSessions) がそのまま集約する。テーブルコピーは無料。
//
// 実行: node scripts/mirror-remedy-ga4.mjs          # 直近 LOOKBACK_DAYS 分
//       node scripts/mirror-remedy-ga4.mjs --all    # ソースの全テーブル（初回用）
import { BigQuery } from "@google-cloud/bigquery";

const SRC_PROJECT = "remedy-sandbox-494806";
const DEST_PROJECT = process.env.GCP_PROJECT ?? "tidal-fusion-439015-e8";
const DATASET = "analytics_348392883";
const LOCATION = process.env.BQ_LOCATION ?? "asia-northeast1";
// エクスポート着弾は1〜2日遅れ＋まれな再出力に備えて広めに見る
const LOOKBACK_DAYS = 7;

const bq = new BigQuery({ projectId: DEST_PROJECT });

function jstSuffixAgo(days) {
  const d = new Date(Date.now() + 9 * 3600_000 - days * 86_400_000);
  return d.toISOString().slice(0, 10).replaceAll("-", "");
}

async function listEventTables(dataset) {
  const [tables] = await dataset.getTables();
  return tables.map((t) => t.id).filter((id) => /^events_\d{8}$/.test(id));
}

async function main() {
  const all = process.argv.includes("--all");
  console.log(`[${new Date().toISOString()}] ミラー開始 (${all ? "全期間" : `直近${LOOKBACK_DAYS}日`})`);

  const [dest] = await bq
    .dataset(DATASET)
    .get({ autoCreate: true, location: LOCATION });
  const srcDs = bq.dataset(DATASET, { projectId: SRC_PROJECT });

  const cutoff = all ? "" : jstSuffixAgo(LOOKBACK_DAYS);
  const srcTables = (await listEventTables(srcDs)).filter((id) => id.slice(-8) >= cutoff);
  const have = new Set(await listEventTables(dest));
  const targets = srcTables.filter((id) => !have.has(id)).sort();

  if (targets.length === 0) {
    console.log("コピー対象なし（ミラーは最新です）");
    return;
  }
  for (const id of targets) {
    const [job] = await srcDs.table(id).copy(dest.table(id), { writeDisposition: "WRITE_TRUNCATE" });
    const errors = job.status?.errors;
    if (errors?.length) throw new Error(`${id} のコピーに失敗: ${JSON.stringify(errors)}`);
    console.log(`コピー: ${id}`);
  }
  console.log(`完了: ${targets.length} テーブルをコピーしました`);
}

main().catch((err) => {
  console.error("ミラーに失敗しました:", err);
  process.exit(1);
});
