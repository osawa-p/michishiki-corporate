// Screaming Frog SEO Spider（CLI・要ライセンス）でサイトをクロールし、
// カバレッジ相当の集計を BigQuery へ取り込むローカル実行スクリプト。
// Vercelでは動かない（SFがローカルにあるため）。Windowsタスクスケジューラで日次実行する。
//
// 実行: node scripts/crawl-seo.mjs            # gsc_enabled の全サイト
//       node scripts/crawl-seo.mjs --site michi-biki.jp
//
// サイトごとに集計方法を出し分ける:
//   - SFクロール: crawl_enabled かつ sitemap規模が SF_MAX_URLS 以下のサイト。
//     Indexability別の件数（クロール上のインデックス可否）を集計する
//   - URL検査ベース: クロール不可（例: RASIK）または sitemapが大きいサイト
//     （例: trimming ≒ 5,700URL。コールドSSRが1ページ20秒超でSFは180分でも
//     完走できない）。gsc_url_inspections の最新結果から「Googleが実際に
//     どう扱っているか」を集計する。SFクロール失敗時のフォールバックも兼ねる
//
// 書き込み先:
//   - gsc_coverage_snapshots: 理由別の件数（サイト×日付で冪等）→ カバレッジタブに表示
//   - seo_urls: クロールで発見したインデックス可能URLを台帳へ補完（source='crawl'）
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import { BigQuery } from "@google-cloud/bigquery";

const GCP_PROJECT = process.env.GCP_PROJECT ?? "tidal-fusion-439015-e8";
const BQ_DATASET = process.env.BQ_DATASET ?? "rank_tracking";
const BQ_LOCATION = process.env.BQ_LOCATION ?? "asia-northeast1";
const bq = new BigQuery({ projectId: GCP_PROJECT, location: BQ_LOCATION });
const fqn = (t) => `\`${GCP_PROJECT}.${BQ_DATASET}.${t}\``;

const SF_CANDIDATES = [
  "C:\\Program Files (x86)\\Screaming Frog SEO Spider\\ScreamingFrogSEOSpiderCli.exe",
  "C:\\Program Files\\Screaming Frog SEO Spider\\ScreamingFrogSEOSpiderCli.exe",
];
const SF = SF_CANDIDATES.find((p) => existsSync(p));
if (!SF) {
  console.error("Screaming Frog CLI が見つかりません。");
  process.exit(1);
}

const args = process.argv.slice(2);
const onlySite = args.includes("--site") ? args[args.indexOf("--site") + 1] : null;

// これ以上のsitemap規模はSFでクロールしない（URL検査ベースの集計へ切り替える）。
// 規模は seo_urls の source='sitemap' 件数で近似する（phase Aが日次で取り込むため）
const SF_MAX_URLS = Number(process.env.SF_MAX_URLS ?? 3000);

// 最低限のCSVパーサ（ダブルクォート・カンマ・改行対応）
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else cur += c;
  }
  if (cur !== "" || row.length > 0) { row.push(cur); rows.push(row); }
  return rows;
}

const jstToday = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const fetchedAt = new Date().toISOString();

// URL検査（gsc_url_inspections）の最新結果からカバレッジ相当の集計を作る。
// SFの「クロール上のindexability」と違い、Googleが実際にどう扱っているか
// （インデックス済み/クロール済み-未登録 など）の集計になる。
// 未検査URLは Unknown として残す（検査ローテーション一巡までの過渡状態が見える）。
async function writeInspectionBasedSnapshot(site) {
  const [rows] = await bq.query({
    query: `
      WITH latest AS (
        SELECT url, verdict, coverage_state,
               ROW_NUMBER() OVER (PARTITION BY url ORDER BY inspected_at DESC) AS rn
        FROM ${fqn("gsc_url_inspections")}
        WHERE site = @site
      )
      SELECT
        CASE
          WHEN u.exclude_reason IS NOT NULL THEN 'Non-Indexable'
          WHEN l.url IS NULL THEN 'Unknown'
          WHEN l.verdict = 'PASS' THEN 'Indexable'
          ELSE 'Non-Indexable'
        END AS bucket,
        CASE
          WHEN u.exclude_reason IS NOT NULL THEN u.exclude_reason
          WHEN l.url IS NULL THEN '未検査'
          WHEN l.verdict = 'PASS' THEN 'OK'
          ELSE COALESCE(l.coverage_state, l.verdict)
        END AS reason,
        COUNT(*) AS count
      FROM ${fqn("seo_urls")} u
      LEFT JOIN (SELECT * FROM latest WHERE rn = 1) l ON l.url = u.url
      WHERE u.site = @site AND u.active
      GROUP BY bucket, reason
      ORDER BY count DESC`,
    params: { site },
    location: BQ_LOCATION,
  });
  const snapRows = rows.map((r) => ({
    site,
    snapshot_date: jstToday,
    bucket: r.bucket,
    reason: r.reason,
    count: Number(r.count),
    fetched_at: fetchedAt,
  }));
  if (snapRows.length > 0) {
    await bq.dataset(BQ_DATASET).table("gsc_coverage_snapshots").insert(snapRows);
  }
  console.log(`URL検査ベースのカバレッジ集計 ${snapRows.length}区分を書き込み`);
}

// 対象サイト（gsc_enabled の全サイト。クロール可否はループ内で出し分ける）
const [sites] = await bq.query({
  query: `SELECT site, IFNULL(crawl_enabled, TRUE) AS crawl_enabled FROM ${fqn("seo_sites")}
    WHERE gsc_enabled ${onlySite ? "AND site = @s" : ""}
    ORDER BY site`,
  params: onlySite ? { s: onlySite } : undefined,
  location: BQ_LOCATION,
});
if (sites.length === 0) {
  console.error("対象サイトがありません。");
  process.exit(1);
}

for (const { site, crawl_enabled } of sites) {
  console.log(`\n===== ${site} =====`);

  // 冪等: 今日のスナップショットが既にあればスキップ
  const [ex] = await bq.query({
    query: `SELECT COUNT(*) AS n FROM ${fqn("gsc_coverage_snapshots")}
      WHERE site = @site AND snapshot_date = DATE(@d) AND fetched_at IS NOT NULL`,
    params: { site, d: jstToday },
    location: BQ_LOCATION,
  });
  if (Number(ex[0].n) > 0) {
    console.log("本日分は取り込み済みのためスキップ");
    continue;
  }

  // クロール不可 or sitemapが大きすぎるサイトはURL検査ベースで集計する
  const [sm] = await bq.query({
    query: `SELECT COUNT(*) AS n FROM ${fqn("seo_urls")}
      WHERE site = @site AND active AND source = 'sitemap'`,
    params: { site },
    location: BQ_LOCATION,
  });
  const sitemapCount = Number(sm[0].n);
  if (!crawl_enabled || sitemapCount > SF_MAX_URLS) {
    console.log(
      `SFクロール対象外（crawl_enabled=${crawl_enabled}, sitemap URL ${sitemapCount}件）→ URL検査ベースで集計`
    );
    await writeInspectionBasedSnapshot(site);
    continue;
  }

  const outDir = join(os.tmpdir(), `sf-crawl-${site.replaceAll(".", "-")}`);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  console.log("クロール開始（サイト規模により数分〜数時間）…");
  // stdoutは破棄する（SFは進捗ログを大量に出すため、pipeだとmaxBuffer超過で
  // 子プロセスが途中終了する）。結果はエクスポートCSVだけ見れば足りる。
  // タイムアウトは180分: trimming.michi-biki.jp（約7,800URL）が旧45分では
  // 毎回時間切れになり、カバレッジが1件も取れていなかった。
  const res = spawnSync(
    SF,
    ["--crawl-sitemap", `https://${site}/sitemap.xml`, "--headless", "--overwrite",
     "--output-folder", outDir, "--export-tabs", "Internal:All"],
    { stdio: "ignore", timeout: 180 * 60 * 1000 }
  );
  const csvPath = join(outDir, "internal_all.csv");
  if (!existsSync(csvPath)) {
    console.error("クロール失敗（internal_all.csv が無い）");
    console.error("exit:", res.status, "signal:", res.signal, "error:", res.error?.message ?? "-");
    console.log("フォールバック: URL検査ベースで集計");
    await writeInspectionBasedSnapshot(site);
    continue;
  }

  const rows = parseCsv(readFileSync(csvPath, "utf8").replace(/^﻿/, ""));
  const header = rows[0];
  const col = (name) => header.findIndex((h) => h === name);
  const iAddr = col("Address");
  const iType = col("Content Type");
  const iStatus = col("Status Code");
  const iIdx = col("Indexability");
  const iIdxStatus = col("Indexability Status");
  if (iAddr < 0 || iIdx < 0) {
    console.error("CSVの想定列が見つかりません:", header.slice(0, 10).join(","));
    continue;
  }

  const pages = rows.slice(1).filter((r) => (r[iType] ?? "").includes("text/html"));
  console.log(`クロール完了: HTMLページ ${pages.length}件`);

  // 1) Indexability別の件数 → gsc_coverage_snapshots
  const counts = new Map();
  for (const r of pages) {
    const bucket = (r[iIdx] || "Unknown").trim(); // Indexable / Non-Indexable
    const reason = (r[iIdxStatus] || "").trim() || (bucket === "Indexable" ? "OK" : `HTTP ${r[iStatus]}`);
    const key = `${bucket}\t${reason}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const snapRows = [...counts].map(([key, count]) => {
    const [bucket, reason] = key.split("\t");
    return { site, snapshot_date: jstToday, bucket, reason, count, fetched_at: fetchedAt };
  });
  if (snapRows.length > 0) {
    await bq.dataset(BQ_DATASET).table("gsc_coverage_snapshots").insert(snapRows);
  }
  console.log(`カバレッジ集計 ${snapRows.length}区分を書き込み`);

  // 2) インデックス可能なURLを台帳へ補完（既存URLには触れない）
  const urls = pages
    .filter((r) => r[iIdx] === "Indexable" && String(r[iStatus]) === "200")
    .map((r) => r[iAddr])
    .filter((u) => /^https?:\/\//.test(u))
    .slice(0, 20000);
  if (urls.length > 0) {
    const [job] = await bq.createQueryJob({
      query: `
        MERGE ${fqn("seo_urls")} t
        USING (SELECT url FROM UNNEST(@urls) AS url) s ON t.site = @site AND t.url = s.url
        WHEN NOT MATCHED THEN INSERT
          (site, url, source, index_target, active, exclude_reason, discovered_at, last_inspected_at)
        VALUES (@site, s.url, 'crawl', TRUE, TRUE, NULL, CURRENT_TIMESTAMP(), NULL)`,
      params: { site, urls },
      types: { urls: ["STRING"] },
      location: BQ_LOCATION,
    });
    await job.getQueryResults();
    const [meta] = await job.getMetadata();
    console.log(`URL台帳へ ${meta.statistics?.query?.numDmlAffectedRows ?? 0} 件を新規追加`);
  }
  rmSync(outDir, { recursive: true, force: true });
}

console.log("\nクロール連携 完了");
