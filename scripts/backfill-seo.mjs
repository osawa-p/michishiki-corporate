// GSC検索アナリティクス・GA4日次データの過去分バックフィル（ローカル実行用）。
// Vercelの実行時間制限を受けないよう、日次cronとは別にローカルで一度だけ回す。
//
// 実行例（.env.local に認証情報を設定した上で）:
//   node --env-file=.env.local scripts/backfill-seo.mjs                 # 全有効サイト・過去183日
//   node --env-file=.env.local scripts/backfill-seo.mjs --site michi-biki.jp --days 183
//
// 認証:
//   - Google API: GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN（推奨）または GCP_SA_KEY_BASE64
//   - BigQuery: GCP_SA_KEY_BASE64 または ADC
//
// 取り込み済みの日付はスキップするため、途中で止めても再実行すれば続きから入る。
// 注意: URL検査とカバレッジは「その時点の状態」しか取れないため過去分は存在しない。
import { BigQuery } from "@google-cloud/bigquery";
import { GoogleAuth, UserRefreshClient } from "google-auth-library";

const GCP_PROJECT = process.env.GCP_PROJECT ?? "tidal-fusion-439015-e8";
const BQ_DATASET = process.env.BQ_DATASET ?? "rank_tracking";
const BQ_LOCATION = process.env.BQ_LOCATION ?? "asia-northeast1";

// ── 引数 ──
const args = process.argv.slice(2);
function argOf(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const ONLY_SITE = argOf("site", null);
const DAYS = Math.min(480, Math.max(1, Number(argOf("days", 183)))); // GSCの遡及上限は16ヶ月

// ── クライアント ──
const b64 = process.env.GCP_SA_KEY_BASE64;
const saCreds =
  b64 && b64.trim() !== "" ? JSON.parse(Buffer.from(b64, "base64").toString("utf8")) : null;

const bq = new BigQuery({
  projectId: GCP_PROJECT,
  location: BQ_LOCATION,
  ...(saCreds
    ? { credentials: { client_email: saCreds.client_email, private_key: saCreds.private_key } }
    : {}),
});

async function getGoogleClient() {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refresh = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (id && secret && refresh) return new UserRefreshClient(id, secret, refresh);
  if (saCreds) {
    const auth = new GoogleAuth({
      scopes: [
        "https://www.googleapis.com/auth/webmasters.readonly",
        "https://www.googleapis.com/auth/analytics.readonly",
      ],
      credentials: saCreds,
    });
    return auth.getClient();
  }
  throw new Error(
    "Google API の認証情報がありません（GOOGLE_OAUTH_* または GCP_SA_KEY_BASE64 を設定）。"
  );
}
const google = await getGoogleClient();

async function api(url, body) {
  const res = await google.request({ url, method: body ? "POST" : "GET", data: body });
  return res.data;
}

// ── ユーティリティ ──
const fqn = (t) => `\`${GCP_PROJECT}.${BQ_DATASET}.${t}\``;
function jstDateAgo(days) {
  return new Date(Date.now() + 9 * 3600_000 - days * 86_400_000).toISOString().slice(0, 10);
}
function* dateRange(fromDaysAgo, toDaysAgo) {
  for (let d = fromDaysAgo; d >= toDaysAgo; d--) yield jstDateAgo(d);
}
async function existingDates(table, site) {
  const [rows] = await bq.query({
    query: `SELECT DISTINCT CAST(date AS STRING) AS d FROM ${fqn(table)} WHERE site = @site`,
    params: { site },
    location: BQ_LOCATION,
  });
  return new Set(rows.map((r) => r.d));
}
async function insert(table, rows) {
  // ストリーミングinsertの1リクエスト上限を避けるため分割
  for (let i = 0; i < rows.length; i += 2000) {
    await bq.dataset(BQ_DATASET).table(table).insert(rows.slice(i, i + 2000));
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── サイト一覧 ──
const [siteRows] = await bq.query({
  query: `SELECT * FROM ${fqn("seo_sites")} ORDER BY site`,
  location: BQ_LOCATION,
});
const sites = siteRows.filter((s) => (ONLY_SITE ? s.site === ONLY_SITE : true));
if (sites.length === 0) {
  console.error(ONLY_SITE ? `seo_sites に ${ONLY_SITE} がありません。` : "seo_sites が空です。");
  process.exit(1);
}

const fetchedAt = new Date().toISOString();

// ── データ移行: 複数プロパティ対応前に取り込んだ property_id が NULL の行へ、
//    そのサイトの先頭プロパティIDを埋める（冪等ガードをプロパティ単位で効かせるため） ──
for (const table of ["ga4_channel_daily", "ga4_page_daily"]) {
  for (const s of siteRows) {
    const first = String(s.ga4_property_id ?? "").split(",")[0]?.trim();
    if (!first) continue;
    try {
      await bq.query({
        query: `UPDATE ${fqn(table)} SET property_id = @pid WHERE site = @site AND property_id IS NULL`,
        params: { pid: first, site: s.site },
        location: BQ_LOCATION,
      });
    } catch (err) {
      // ストリーミングバッファ内の行はUPDATE不可（挿入から最大90分）。次回実行で埋まる
      console.warn(`[移行] ${table}/${s.site} のproperty_id補完を一部スキップ:`, err?.message ?? err);
    }
  }
}

for (const s of sites) {
  console.log(`\n===== ${s.site} =====`);

  // ── GSC 検索アナリティクス（3日前までが確定分） ──
  if (s.gsc_enabled && s.gsc_site_url) {
    const done = await existingDates("gsc_query_stats", s.site);
    const encoded = encodeURIComponent(s.gsc_site_url);
    let inserted = 0;
    let skipped = 0;
    for (const date of dateRange(DAYS, 3)) {
      if (done.has(date)) {
        skipped++;
        continue;
      }
      try {
        const rows = [];
        let startRow = 0;
        for (let page = 0; page < 4; page++) {
          const data = await api(
            `https://searchconsole.googleapis.com/webmasters/v3/sites/${encoded}/searchAnalytics/query`,
            {
              startDate: date,
              endDate: date,
              dimensions: ["query", "page"],
              rowLimit: 25000,
              startRow,
              dataState: "final",
            }
          );
          const batch = data.rows ?? [];
          for (const r of batch) {
            rows.push({
              site: s.site,
              date,
              query: r.keys[0] ?? "",
              page: r.keys[1] ?? "",
              impressions: r.impressions ?? 0,
              clicks: r.clicks ?? 0,
              position: r.position ?? 0,
              fetched_at: fetchedAt,
            });
          }
          if (batch.length < 25000) break;
          startRow += 25000;
        }
        if (rows.length > 0) await insert("gsc_query_stats", rows);
        inserted += rows.length;
        process.stdout.write(`\r[GSC] ${date} まで取り込み（累計 ${inserted} 行）   `);
        await sleep(150); // クォータへの配慮
      } catch (err) {
        console.error(`\n[GSC] ${date} の取得に失敗:`, err?.message ?? err);
        await sleep(2000);
      }
    }
    console.log(`\n[GSC] 完了: ${inserted} 行追加・${skipped} 日分は取り込み済みでスキップ`);
  } else {
    console.log("[GSC] 無効のためスキップ");
  }

  // ── GA4（2日前まで・月単位チャンク・カンマ区切りの複数プロパティをそれぞれ取得） ──
  const propertyIds = String(s.ga4_property_id ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => /^\d{4,}$/.test(v));
  if (s.ga4_enabled && propertyIds.length > 0) {
    const metrics = [
      "sessions",
      "activeUsers",
      "screenPageViews",
      "keyEvents",
      "userEngagementDuration",
      "bounceRate",
    ].map((name) => ({ name }));
    // 全期間を30日ごとのチャンクに分割
    const chunks = [];
    for (let from = DAYS; from > 2; from -= 30) {
      chunks.push([jstDateAgo(from), jstDateAgo(Math.max(3, from - 29))]);
    }
    for (const pid of propertyIds) {
      // プロパティ単位の取り込み済み日付（冪等ガード）。
      // property_id が NULL の旧行は「先頭プロパティの取り込み済み」として扱う
      // （移行UPDATEがストリーミングバッファ制約で遅延しても二重取り込みしないため）。
      const isFirst = pid === propertyIds[0];
      const [doneRows] = await bq.query({
        query: `SELECT DISTINCT CAST(date AS STRING) AS d FROM ${fqn("ga4_channel_daily")}
          WHERE site = @site AND (property_id = @pid OR (@isFirst AND property_id IS NULL))`,
        params: { site: s.site, pid, isFirst },
        location: BQ_LOCATION,
      });
      const doneCh = new Set(doneRows.map((r) => r.d));
      const runReport = async (dimensions, startDate, endDate, offset) =>
        api(
          `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(pid)}:runReport`,
          {
            dateRanges: [{ startDate, endDate }],
            dimensions: dimensions.map((name) => ({ name })),
            metrics,
            limit: 100000,
            offset,
          }
        );
      let chInserted = 0;
      let pgInserted = 0;
      for (const [startDate, endDate] of chunks) {
        try {
          // チャネル×ソース/メディア
          for (let offset = 0; ; offset += 100000) {
            const data = await runReport(
              ["date", "sessionDefaultChannelGroup", "sessionSource", "sessionMedium"],
              startDate,
              endDate,
              offset
            );
            const rows = (data.rows ?? [])
              .map((r) => {
                const d = r.dimensionValues.map((v) => v.value ?? "");
                const m = r.metricValues.map((v) => Number(v.value ?? 0));
                const date = `${d[0].slice(0, 4)}-${d[0].slice(4, 6)}-${d[0].slice(6, 8)}`;
                return {
                  site: s.site,
                  property_id: pid,
                  date,
                  channel: d[1],
                  source: d[2],
                  medium: d[3],
                  sessions: m[0],
                  active_users: m[1],
                  views: m[2],
                  key_events: m[3],
                  engagement_secs: m[4],
                  bounce_rate: m[5],
                  fetched_at: fetchedAt,
                };
              })
              .filter((r) => !doneCh.has(r.date));
            if (rows.length > 0) await insert("ga4_channel_daily", rows);
            chInserted += rows.length;
            if ((data.rows ?? []).length < 100000) break;
          }
          // ランディングページ
          for (let offset = 0; ; offset += 100000) {
            const data = await runReport(["date", "landingPagePlusQueryString"], startDate, endDate, offset);
            const rows = (data.rows ?? [])
              .map((r) => {
                const d = r.dimensionValues.map((v) => v.value ?? "");
                const m = r.metricValues.map((v) => Number(v.value ?? 0));
                const date = `${d[0].slice(0, 4)}-${d[0].slice(4, 6)}-${d[0].slice(6, 8)}`;
                return {
                  site: s.site,
                  property_id: pid,
                  date,
                  page: d[1],
                  sessions: m[0],
                  active_users: m[1],
                  views: m[2],
                  key_events: m[3],
                  engagement_secs: m[4],
                  bounce_rate: m[5],
                  fetched_at: fetchedAt,
                };
              })
              .filter((r) => !doneCh.has(r.date)); // チャネル側の取り込み済み日付を共通ガードに使う
            if (rows.length > 0) await insert("ga4_page_daily", rows);
            pgInserted += rows.length;
            if ((data.rows ?? []).length < 100000) break;
          }
          console.log(
            `[GA4 ${pid}] ${startDate}〜${endDate} 取り込み（チャネル累計 ${chInserted}・ページ累計 ${pgInserted}）`
          );
          await sleep(300);
        } catch (err) {
          console.error(`[GA4 ${pid}] ${startDate}〜${endDate} の取得に失敗:`, err?.message ?? err);
          await sleep(2000);
        }
      }
      console.log(`[GA4 ${pid}] 完了: チャネル ${chInserted} 行・ページ ${pgInserted} 行`);
    }
  } else {
    console.log("[GA4] 無効のためスキップ");
  }
}

console.log("\nバックフィル完了");
