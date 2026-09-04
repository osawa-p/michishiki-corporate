// 月次オーガニックレポートの生成（ローカル実行用）。
// BigQuery の gsc_query_stats / ga4_channel_daily からサイト×対象月を集計し、
// src/data/reports/<slug>/<YYYYMM>.html へ自己完結HTMLを書き出す。
// 生成後は /rank-tracker/reports で閲覧権限（ACL）付きで配信される。
//
// 実行例:
//   node --env-file=.env.local scripts/generate-monthly-report.mjs --site cin-cia.com --month 202606
//
// 前提: backfill-seo.mjs で対象期間のデータが BQ に入っていること
// （比較列＝前月比・前年比を出すため、対象月の13ヶ月前からの取り込みを推奨）。
import { BigQuery } from "@google-cloud/bigquery";
import { promises as fs } from "node:fs";
import path from "node:path";

const GCP_PROJECT = process.env.GCP_PROJECT ?? "tidal-fusion-439015-e8";
const BQ_DATASET = process.env.BQ_DATASET ?? "rank_tracking";
const BQ_LOCATION = process.env.BQ_LOCATION ?? "asia-northeast1";

// サイト別プリセット（slug は src/lib/rank-tracker/reports.ts と一致させること）
const SITE_PRESETS = {
  "cin-cia.com": {
    slug: "cincia",
    label: "Cin-Cia Nail Academy",
    eyebrow: "CIN-CIA NAIL ACADEMY ／ SEO 月次レポート",
    // 指名（ブランド）判定の正規表現（BQ RE2・小文字化したクエリに適用）
    brandRe: "(シンシア|しんしあ|cincia|cin-?cia)",
    accent: "#a76a74", // ローズ系（サイトのトーンに合わせた落ち着いた差し色）
  },
};

// ── 引数 ──
const args = process.argv.slice(2);
function argOf(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const SITE = argOf("site", null);
const MONTH = argOf("month", null); // YYYYMM
if (!SITE || !/^\d{6}$/.test(MONTH ?? "")) {
  console.error(
    "使い方: node --env-file=.env.local scripts/generate-monthly-report.mjs --site <site> --month <YYYYMM>"
  );
  process.exit(1);
}
const preset = SITE_PRESETS[SITE];
if (!preset) {
  console.error(`未対応サイトです: ${SITE}（SITE_PRESETS に追加してください）`);
  process.exit(1);
}

const bq = new BigQuery({ projectId: GCP_PROJECT, location: BQ_LOCATION });
const fqn = (t) => `\`${GCP_PROJECT}.${BQ_DATASET}.${t}\``;

// ── 月ユーティリティ ──
const ym = MONTH;
function shiftYm(yyyymm, diff) {
  const y = Number(yyyymm.slice(0, 4));
  const m = Number(yyyymm.slice(4)) - 1 + diff;
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
const prevYm = shiftYm(ym, -1);
const yoyYm = shiftYm(ym, -12);
const monthStart = `${ym.slice(0, 4)}-${ym.slice(4)}-01`;
function monthEnd(yyyymm) {
  const y = Number(yyyymm.slice(0, 4));
  const m = Number(yyyymm.slice(4));
  return `${yyyymm.slice(0, 4)}-${yyyymm.slice(4)}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}
function monthLabel(yyyymm) {
  return `${yyyymm.slice(0, 4)}年${Number(yyyymm.slice(4))}月`;
}

async function query(sql, params) {
  const [rows] = await bq.query({ query: sql, params, location: BQ_LOCATION });
  return rows;
}

// ── 集計 ──
// GA4 オーガニック月次（RASIKレポートと同一基準: medium に organic を含む）
const ga4Monthly = await query(
  `SELECT FORMAT_DATE('%Y%m', date) AS ym,
          SUM(sessions) AS sessions,
          SUM(key_events) AS key_events,
          SAFE_DIVIDE(SUM(sessions * (1 - bounce_rate)), SUM(sessions)) AS engagement_rate
   FROM ${fqn("ga4_channel_daily")}
   WHERE site = @site AND LOWER(medium) LIKE '%organic%'
   GROUP BY ym ORDER BY ym`,
  { site: SITE }
);

// GA4 全流入チャネル構成（当月）
const ga4Channels = await query(
  `SELECT channel,
          SUM(sessions) AS sessions,
          SUM(key_events) AS key_events
   FROM ${fqn("ga4_channel_daily")}
   WHERE site = @site AND date BETWEEN @from AND @to
   GROUP BY channel ORDER BY sessions DESC`,
  { site: SITE, from: monthStart, to: monthEnd(ym) }
);

// GSC 月次合計＋指名/一般分割
const gscMonthly = await query(
  `SELECT FORMAT_DATE('%Y%m', date) AS ym,
          REGEXP_CONTAINS(LOWER(query), @brand) AS is_brand,
          SUM(clicks) AS clicks,
          SUM(impressions) AS impressions,
          SAFE_DIVIDE(SUM(position * impressions), SUM(impressions)) AS position
   FROM ${fqn("gsc_query_stats")}
   WHERE site = @site
   GROUP BY ym, is_brand ORDER BY ym`,
  { site: SITE, brand: preset.brandRe }
);

// GSC 上位クエリ（当月 vs 前月）
const gscQueries = await query(
  `WITH cur AS (
     SELECT query, SUM(clicks) AS clicks, SUM(impressions) AS impressions,
            SAFE_DIVIDE(SUM(position * impressions), SUM(impressions)) AS position
     FROM ${fqn("gsc_query_stats")}
     WHERE site = @site AND date BETWEEN @from AND @to
     GROUP BY query
   ), prev AS (
     SELECT query, SUM(clicks) AS clicks
     FROM ${fqn("gsc_query_stats")}
     WHERE site = @site AND date BETWEEN @pfrom AND @pto
     GROUP BY query
   )
   SELECT cur.query, cur.clicks, cur.impressions, cur.position,
          prev.clicks AS prev_clicks
   FROM cur LEFT JOIN prev USING (query)
   ORDER BY cur.clicks DESC, cur.impressions DESC
   LIMIT 15`,
  {
    site: SITE,
    from: monthStart,
    to: monthEnd(ym),
    pfrom: `${prevYm.slice(0, 4)}-${prevYm.slice(4)}-01`,
    pto: monthEnd(prevYm),
  }
);

// GSC 上位ランディングページ（当月 vs 前月）
const gscPages = await query(
  `WITH cur AS (
     SELECT page, SUM(clicks) AS clicks, SUM(impressions) AS impressions,
            SAFE_DIVIDE(SUM(position * impressions), SUM(impressions)) AS position
     FROM ${fqn("gsc_query_stats")}
     WHERE site = @site AND date BETWEEN @from AND @to
     GROUP BY page
   ), prev AS (
     SELECT page, SUM(clicks) AS clicks
     FROM ${fqn("gsc_query_stats")}
     WHERE site = @site AND date BETWEEN @pfrom AND @pto
     GROUP BY page
   )
   SELECT cur.page, cur.clicks, cur.impressions, cur.position,
          prev.clicks AS prev_clicks
   FROM cur LEFT JOIN prev USING (page)
   ORDER BY cur.clicks DESC, cur.impressions DESC
   LIMIT 10`,
  {
    site: SITE,
    from: monthStart,
    to: monthEnd(ym),
    pfrom: `${prevYm.slice(0, 4)}-${prevYm.slice(4)}-01`,
    pto: monthEnd(prevYm),
  }
);

// ── 整形ヘルパー ──
const byYm = (rows) => Object.fromEntries(rows.map((r) => [r.ym, r]));
const ga4By = byYm(ga4Monthly);
// GSC: ym → {clicks, impressions, position, brandClicks, genericClicks}
const gscBy = {};
for (const r of gscMonthly) {
  const o = (gscBy[r.ym] ??= {
    clicks: 0,
    impressions: 0,
    posNum: 0,
    brandClicks: 0,
    genericClicks: 0,
  });
  o.clicks += Number(r.clicks);
  o.impressions += Number(r.impressions);
  o.posNum += Number(r.position ?? 0) * Number(r.impressions);
  if (r.is_brand) o.brandClicks += Number(r.clicks);
  else o.genericClicks += Number(r.clicks);
}
for (const o of Object.values(gscBy)) {
  o.position = o.impressions > 0 ? o.posNum / o.impressions : null;
  o.ctr = o.impressions > 0 ? o.clicks / o.impressions : null;
}

const nf = new Intl.NumberFormat("ja-JP");
const fmt = (n) => (n == null || Number.isNaN(Number(n)) ? "—" : nf.format(Math.round(Number(n))));
const fmtPct = (n, digits = 2) =>
  n == null || Number.isNaN(Number(n)) ? "—" : `${(Number(n) * 100).toFixed(digits)}%`;
const fmtPos = (n) => (n == null || Number.isNaN(Number(n)) ? "—" : Number(n).toFixed(1));
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// 変化率バッジ（値が小さい方が良い指標は goodDown=true）
function deltaBadge(cur, base, { pt = false, goodDown = false } = {}) {
  if (cur == null || base == null || Number(base) === 0) return "";
  const c = Number(cur);
  const b = Number(base);
  let text;
  let up;
  if (pt) {
    const d = (c - b) * 100;
    if (Math.abs(d) < 0.005) return `<span class="badge flat">±0pt</span>`;
    text = `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(2)}pt`;
    up = d > 0;
  } else {
    const d = (c - b) / Math.abs(b);
    if (Math.abs(d) < 0.0005) return `<span class="badge flat">±0%</span>`;
    text = `${d > 0 ? "+" : "−"}${Math.abs(d * 100).toFixed(1)}%`;
    up = d > 0;
  }
  const good = goodDown ? !up : up;
  return `<span class="badge ${good ? "up" : "down"}">${up ? "▲" : "▼"} ${text.slice(1)}</span>`;
}

// ── 各セクションの値 ──
const g = ga4By[ym]; // 当月GA4（無ければ未接続期間）
const gPrev = ga4By[prevYm];
const gYoy = ga4By[yoyYm];
const s = gscBy[ym];
const sPrev = gscBy[prevYm];
const sYoy = gscBy[yoyYm];

if (!g && !s) {
  console.error(
    `${SITE} の ${monthLabel(ym)} はGA4・GSCともデータがありません。backfill-seo.mjs を先に実行してください。`
  );
  process.exit(1);
}

const cvr = g ? Number(g.key_events) / Math.max(1, Number(g.sessions)) : null;
const cvrPrev = gPrev ? Number(gPrev.key_events) / Math.max(1, Number(gPrev.sessions)) : null;
const cvrYoy = gYoy ? Number(gYoy.key_events) / Math.max(1, Number(gYoy.sessions)) : null;

// 月次推移（当月までの直近13ヶ月・データのある月のみ）
const trendYms = [...new Set([...Object.keys(ga4By), ...Object.keys(gscBy)])]
  .filter((m) => m <= ym && m >= shiftYm(ym, -12))
  .sort();

// チャネル構成（当月）
const chTotal = ga4Channels.reduce((a, r) => a + Number(r.sessions), 0);

// ── 自動所見（データから機械的に導出できる事実のみ記載） ──
const notes = [];
if (s) {
  const mm = sPrev && sPrev.clicks > 0 ? (s.clicks - sPrev.clicks) / sPrev.clicks : null;
  const yy = sYoy && sYoy.clicks > 0 ? (s.clicks - sYoy.clicks) / sYoy.clicks : null;
  let t = `Google検索クリックは ${fmt(s.clicks)}（表示回数 ${fmt(s.impressions)}・平均掲載順位 ${fmtPos(s.position)}）`;
  if (mm != null) t += `。前月比 ${mm >= 0 ? "+" : "−"}${Math.abs(mm * 100).toFixed(1)}%`;
  if (yy != null) t += `、前年同月比 ${yy >= 0 ? "+" : "−"}${Math.abs(yy * 100).toFixed(1)}%`;
  notes.push(t + "。");
  if (s.clicks > 0) {
    const brandShare = s.brandClicks / s.clicks;
    let bt = `クリックの内訳は 指名 ${fmt(s.brandClicks)}（${fmtPct(brandShare, 1)}）／ 一般 ${fmt(s.genericClicks)}（${fmtPct(1 - brandShare, 1)}）`;
    if (sPrev && sPrev.clicks > 0) {
      const d = (brandShare - sPrev.brandClicks / sPrev.clicks) * 100;
      bt += `。指名比率は前月から ${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}pt`;
    }
    notes.push(bt + "。");
  }
  const risers = gscQueries
    .filter((q) => q.prev_clicks != null && Number(q.clicks) - Number(q.prev_clicks) > 0)
    .sort((a, b) => Number(b.clicks) - Number(b.prev_clicks) - (Number(a.clicks) - Number(a.prev_clicks)))
    .slice(0, 2);
  if (risers.length > 0) {
    notes.push(
      `クリック増の主なクエリ: ${risers
        .map((q) => `「${esc(q.query)}」（${fmt(q.prev_clicks)}→${fmt(q.clicks)}）`)
        .join("、")}。`
    );
  }
}
if (g) {
  let t = `オーガニックセッションは ${fmt(g.sessions)}・キーイベント（CV）は ${fmt(g.key_events)}（セッションCVR ${fmtPct(cvr)}）`;
  if (gPrev) {
    const mm = (Number(g.sessions) - Number(gPrev.sessions)) / Math.max(1, Number(gPrev.sessions));
    t += `。セッションは前月比 ${mm >= 0 ? "+" : "−"}${Math.abs(mm * 100).toFixed(1)}%`;
  }
  notes.push(t + "。");
} else {
  notes.push("この月はGA4のデータ連携前のため、GA4系指標（セッション・CV）は記載していません。");
}

// ── HTML ──
const accent = preset.accent;
const kpiCard = (label, value, sub, badges) => `
  <div class="card">
    <div class="klabel">${label}</div>
    <div class="kval">${value}</div>
    ${sub ? `<div class="ksub">${sub}</div>` : ""}
    ${badges ? `<div class="kbadges">${badges}</div>` : ""}
  </div>`;

const ga4Cards = g
  ? [
      kpiCard(
        "オーガニックセッション",
        fmt(g.sessions),
        gPrev ? `前月 ${fmt(gPrev.sessions)}` : gYoy ? `前年同月 ${fmt(gYoy.sessions)}` : "",
        [
          gPrev ? deltaBadge(g.sessions, gPrev.sessions) : "",
          gYoy ? `<span class="vs">前年比</span>` + deltaBadge(g.sessions, gYoy.sessions) : "",
        ].join(" ")
      ),
      kpiCard(
        "キーイベント（CV）",
        fmt(g.key_events),
        gPrev ? `前月 ${fmt(gPrev.key_events)}` : "",
        gPrev ? deltaBadge(g.key_events, gPrev.key_events) : ""
      ),
      kpiCard(
        "セッションCVR",
        fmtPct(cvr),
        cvrPrev != null ? `前月 ${fmtPct(cvrPrev)}` : "",
        [
          cvrPrev != null ? deltaBadge(cvr, cvrPrev, { pt: true }) : "",
          cvrYoy != null ? `<span class="vs">前年比</span>` + deltaBadge(cvr, cvrYoy, { pt: true }) : "",
        ].join(" ")
      ),
      kpiCard(
        "エンゲージメント率",
        fmtPct(g.engagement_rate),
        gPrev ? `前月 ${fmtPct(gPrev.engagement_rate)}` : "",
        gPrev ? deltaBadge(g.engagement_rate, gPrev.engagement_rate, { pt: true }) : ""
      ),
    ].join("")
  : `<p class="empty">この月はGA4のデータ連携前のため、GA4系指標はありません。</p>`;

const gscCards = s
  ? [
      kpiCard(
        "クリック",
        fmt(s.clicks),
        sPrev ? `前月 ${fmt(sPrev.clicks)}` : "",
        [
          sPrev ? deltaBadge(s.clicks, sPrev.clicks) : "",
          sYoy ? `<span class="vs">前年比</span>` + deltaBadge(s.clicks, sYoy.clicks) : "",
        ].join(" ")
      ),
      kpiCard(
        "表示回数",
        fmt(s.impressions),
        sPrev ? `前月 ${fmt(sPrev.impressions)}` : "",
        sPrev ? deltaBadge(s.impressions, sPrev.impressions) : ""
      ),
      kpiCard(
        "CTR",
        fmtPct(s.ctr),
        sPrev ? `前月 ${fmtPct(sPrev.ctr)}` : "",
        sPrev ? deltaBadge(s.ctr, sPrev.ctr, { pt: true }) : ""
      ),
      kpiCard(
        "平均掲載順位",
        fmtPos(s.position),
        sPrev ? `前月 ${fmtPos(sPrev.position)}` : "",
        sPrev ? deltaBadge(s.position, sPrev.position, { goodDown: true }) : ""
      ),
    ].join("")
  : `<p class="empty">この月はSearch Consoleのデータがありません。</p>`;

const brandTable = s
  ? `<table>
      <thead><tr><th>区分</th><th class="num">クリック</th><th class="num">構成比</th>${sPrev ? '<th class="num">前月クリック</th><th class="num">前月比</th>' : ""}</tr></thead>
      <tbody>
        <tr><td>指名（ブランド）</td><td class="num">${fmt(s.brandClicks)}</td><td class="num">${fmtPct(s.clicks > 0 ? s.brandClicks / s.clicks : null, 1)}</td>${sPrev ? `<td class="num">${fmt(sPrev.brandClicks)}</td><td class="num">${deltaBadge(s.brandClicks, sPrev.brandClicks)}</td>` : ""}</tr>
        <tr><td>一般（ノーブランド）</td><td class="num">${fmt(s.genericClicks)}</td><td class="num">${fmtPct(s.clicks > 0 ? s.genericClicks / s.clicks : null, 1)}</td>${sPrev ? `<td class="num">${fmt(sPrev.genericClicks)}</td><td class="num">${deltaBadge(s.genericClicks, sPrev.genericClicks)}</td>` : ""}</tr>
      </tbody>
    </table>`
  : "";

const trendRows = trendYms
  .map((m) => {
    const gm = gscBy[m];
    const am = ga4By[m];
    const cur = m === ym ? ' class="cur"' : "";
    return `<tr${cur}><td>${monthLabel(m)}</td>
      <td class="num">${gm ? fmt(gm.clicks) : "—"}</td>
      <td class="num">${gm ? fmt(gm.impressions) : "—"}</td>
      <td class="num">${gm ? fmtPos(gm.position) : "—"}</td>
      <td class="num">${am ? fmt(am.sessions) : "—"}</td>
      <td class="num">${am ? fmt(am.key_events) : "—"}</td></tr>`;
  })
  .join("");

const channelRows = ga4Channels
  .map(
    (r) => `<tr><td>${esc(r.channel || "(未設定)")}</td>
      <td class="num">${fmt(r.sessions)}</td>
      <td class="num">${fmtPct(chTotal > 0 ? Number(r.sessions) / chTotal : null, 1)}</td>
      <td class="num">${fmt(r.key_events)}</td></tr>`
  )
  .join("");

const queryRows = gscQueries
  .map(
    (q) => `<tr><td class="qcell">${esc(q.query)}</td>
      <td class="num">${fmt(q.clicks)}</td>
      <td class="num">${q.prev_clicks != null ? fmt(q.prev_clicks) : "—"}</td>
      <td class="num">${fmt(q.impressions)}</td>
      <td class="num">${fmtPct(Number(q.impressions) > 0 ? Number(q.clicks) / Number(q.impressions) : null, 1)}</td>
      <td class="num">${fmtPos(q.position)}</td></tr>`
  )
  .join("");

const pathOf = (u) => {
  try {
    return new URL(u).pathname || "/";
  } catch {
    return u;
  }
};
const pageRows = gscPages
  .map(
    (p) => `<tr><td class="qcell" title="${esc(p.page)}">${esc(pathOf(p.page))}</td>
      <td class="num">${fmt(p.clicks)}</td>
      <td class="num">${p.prev_clicks != null ? fmt(p.prev_clicks) : "—"}</td>
      <td class="num">${fmt(p.impressions)}</td>
      <td class="num">${fmtPos(p.position)}</td></tr>`
  )
  .join("");

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(preset.label)} 月次オーガニックレポート｜${monthLabel(ym)}</title>
<style>
  :root{
    --bg:#f7f5f4; --card:#ffffff; --ink:#2a2224; --sub:#6f6266;
    --line:#e8e0e1; --brand:${accent}; --brand-soft:#f4e9ea; --brand-ink:#7d4a53;
    --pos:#1a8c5a; --pos-bg:#e7f6ee; --neg:#c0392b; --neg-bg:#fbecea;
    --shadow:0 1px 3px rgba(50,30,35,.08),0 4px 16px rgba(50,30,35,.06);
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font-family:"Segoe UI","Hiragino Kaku Gothic ProN",Meiryo,sans-serif;
    line-height:1.65;-webkit-font-smoothing:antialiased}
  .wrap{max-width:980px;margin:0 auto;padding:28px 20px 64px}
  .eyebrow{font-size:12.5px;letter-spacing:.1em;color:var(--brand);font-weight:700;margin:0 0 6px}
  h1{font-size:24px;margin:0 0 6px;letter-spacing:.01em}
  .period{color:var(--sub);font-size:13.5px}
  .defs{margin-top:12px;font-size:11.5px;color:var(--sub);background:#fff;border:1px solid var(--line);
    border-radius:9px;padding:11px 13px}
  .defs b{color:var(--ink)}
  section{margin-top:30px}
  h2{font-size:16px;margin:0 0 13px;padding-left:11px;border-left:4px solid var(--brand);
    display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
  h2 small{font-weight:400;font-size:11.5px;color:var(--sub)}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:13px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;
    padding:14px 16px;box-shadow:var(--shadow)}
  .klabel{font-size:12px;color:var(--sub);font-weight:600}
  .kval{font-size:26px;font-weight:700;margin-top:2px;letter-spacing:.01em}
  .ksub{font-size:11.5px;color:var(--sub);margin-top:2px}
  .kbadges{margin-top:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
  .vs{font-size:10.5px;color:var(--sub)}
  .badge{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px}
  .badge.up{color:var(--pos);background:var(--pos-bg)}
  .badge.down{color:var(--neg);background:var(--neg-bg)}
  .badge.flat{color:var(--sub);background:#efeceb}
  table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);
    border-radius:12px;overflow:hidden;box-shadow:var(--shadow);font-size:13px}
  th,td{padding:9px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
  thead th{background:var(--brand-soft);color:var(--brand-ink);font-size:12px;white-space:nowrap}
  tbody tr:last-child td{border-bottom:none}
  td.num,th.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  tr.cur td{background:#fdf7f7;font-weight:600}
  .qcell{word-break:break-all}
  .tablewrap{overflow-x:auto;border-radius:12px}
  .empty{background:var(--card);border:1px dashed var(--line);border-radius:12px;
    padding:16px;color:var(--sub);font-size:13px}
  ul.notes{background:var(--card);border:1px solid var(--line);border-radius:12px;
    box-shadow:var(--shadow);margin:0;padding:16px 16px 16px 34px;font-size:13.5px}
  ul.notes li{margin:4px 0}
  footer{margin-top:36px;font-size:11px;color:var(--sub)}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <p class="eyebrow">${esc(preset.eyebrow)}</p>
    <h1>月次オーガニックレポート｜${monthLabel(ym)}</h1>
    <p class="period">対象期間: ${monthStart} 〜 ${monthEnd(ym)} ／ 前月比（${monthLabel(prevYm)}）${sYoy || gYoy ? `・前年同月比（${monthLabel(yoyYm)}）` : ""}</p>
    <div class="defs">
      <b>オーガニック</b>: GA4で source/medium に "organic" を含むセッション（Google・Yahoo・Bing等を含む）／
      <b>CV</b>: GA4のキーイベント合計／
      <b>検索パフォーマンス</b>: Google Search Console 実測（クリック・表示回数・平均掲載順位）／
      <b>指名</b>: 検索クエリにブランド名（シンシア等）を含むもの。数値はすべて実測で、推定按分はありません。
    </div>
  </header>

  <section>
    <h2>ハイライト <small>オーガニック流入（GA4）</small></h2>
    <div class="cards">${ga4Cards}</div>
  </section>

  <section>
    <h2>検索パフォーマンス <small>Google検索・Search Console実測</small></h2>
    <div class="cards">${gscCards}</div>
    ${brandTable ? `<div class="tablewrap" style="margin-top:13px">${brandTable}</div>` : ""}
  </section>

  <section>
    <h2>月次推移 <small>直近13ヶ月・データのある月のみ</small></h2>
    <div class="tablewrap">
      <table>
        <thead><tr><th>月</th><th class="num">クリック</th><th class="num">表示回数</th><th class="num">平均順位</th><th class="num">オーガニックセッション</th><th class="num">CV</th></tr></thead>
        <tbody>${trendRows}</tbody>
      </table>
    </div>
  </section>

  ${
    ga4Channels.length > 0
      ? `<section>
    <h2>流入チャネル構成 <small>当月・全流入（GA4）</small></h2>
    <div class="tablewrap">
      <table>
        <thead><tr><th>チャネル</th><th class="num">セッション</th><th class="num">構成比</th><th class="num">CV</th></tr></thead>
        <tbody>${channelRows}</tbody>
      </table>
    </div>
  </section>`
      : ""
  }

  ${
    gscQueries.length > 0
      ? `<section>
    <h2>上位検索クエリ <small>クリック順・上位15</small></h2>
    <div class="tablewrap">
      <table>
        <thead><tr><th>クエリ</th><th class="num">クリック</th><th class="num">前月</th><th class="num">表示回数</th><th class="num">CTR</th><th class="num">平均順位</th></tr></thead>
        <tbody>${queryRows}</tbody>
      </table>
    </div>
  </section>`
      : ""
  }

  ${
    gscPages.length > 0
      ? `<section>
    <h2>上位ランディングページ <small>Google検索クリック順・上位10</small></h2>
    <div class="tablewrap">
      <table>
        <thead><tr><th>ページ</th><th class="num">クリック</th><th class="num">前月</th><th class="num">表示回数</th><th class="num">平均順位</th></tr></thead>
        <tbody>${pageRows}</tbody>
      </table>
    </div>
  </section>`
      : ""
  }

  <section>
    <h2>今月のポイント</h2>
    <ul class="notes">${notes.map((n) => `<li>${n}</li>`).join("")}</ul>
  </section>

  <footer>
    データソース: Google Search Console／GA4（BigQuery 取り込み値）。
    生成: ${new Date().toISOString().slice(0, 10)}／このレポートは閲覧権限のあるメンバーのみに配信されます。
  </footer>
</div>
</body>
</html>
`;

const outDir = path.join(process.cwd(), "src", "data", "reports", preset.slug);
await fs.mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, `${ym}.html`);
await fs.writeFile(outPath, html, "utf-8");
console.log(`書き出しました: ${outPath}`);
console.log(
  `  GA4: ${g ? `セッション ${fmt(g.sessions)}・CV ${fmt(g.key_events)}` : "データなし"} / GSC: ${s ? `クリック ${fmt(s.clicks)}・表示 ${fmt(s.impressions)}` : "データなし"}`
);
