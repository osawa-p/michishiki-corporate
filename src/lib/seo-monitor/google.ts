// Google API クライアント（Search Console / GA4 Data API）。
// googleapis パッケージは重いため、google-auth-library + REST を直接叩く。
// 認証は BigQuery と同じサービスアカウントを共用する:
//   - 本番(Vercel): GCP_SA_KEY_BASE64（SA鍵JSONのbase64）
//   - ローカル: ADC
// 前提: この SA のメールアドレスを Search Console プロパティ（フル/制限付き）と
// GA4 プロパティ（閲覧者）に追加しておくこと。

import { GoogleAuth, type AuthClient } from "google-auth-library";

const SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
];

let cachedClient: AuthClient | null = null;

async function getClient(): Promise<AuthClient> {
  if (cachedClient) return cachedClient;
  const b64 = process.env.GCP_SA_KEY_BASE64;
  const auth =
    b64 && b64.trim() !== ""
      ? new GoogleAuth({
          scopes: SCOPES,
          credentials: JSON.parse(Buffer.from(b64, "base64").toString("utf8")),
        })
      : new GoogleAuth({ scopes: SCOPES });
  cachedClient = await auth.getClient();
  return cachedClient;
}

async function request<T>(url: string, body?: unknown): Promise<T> {
  const client = await getClient();
  const res = await client.request<T>({
    url,
    method: body === undefined ? "GET" : "POST",
    ...(body === undefined ? {} : { data: body }),
  });
  return res.data;
}

// ───────────────────────────────────────────────────────────
// Search Console: 検索アナリティクス
// ───────────────────────────────────────────────────────────

export type SearchAnalyticsRow = {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  position: number;
};

// 指定日1日分の query × page を取得（1リクエスト最大25,000行）。
// GSCのデータは約3日遅れで確定するため、呼び出し側は3日前の日付を渡す。
export async function fetchSearchAnalytics(
  gscSiteUrl: string,
  date: string
): Promise<SearchAnalyticsRow[]> {
  type Api = {
    rows?: Array<{ keys: string[]; clicks: number; impressions: number; position: number }>;
  };
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(gscSiteUrl)}/searchAnalytics/query`;
  const out: SearchAnalyticsRow[] = [];
  let startRow = 0;
  const rowLimit = 25000;
  // ページングで全行取得（通常は1リクエストで収まる）
  for (let i = 0; i < 4; i++) {
    const data = await request<Api>(url, {
      startDate: date,
      endDate: date,
      dimensions: ["query", "page"],
      rowLimit,
      startRow,
      dataState: "final",
    });
    const rows = data.rows ?? [];
    for (const r of rows) {
      out.push({
        query: r.keys[0] ?? "",
        page: r.keys[1] ?? "",
        clicks: r.clicks ?? 0,
        impressions: r.impressions ?? 0,
        position: r.position ?? 0,
      });
    }
    if (rows.length < rowLimit) break;
    startRow += rowLimit;
  }
  return out;
}

// ───────────────────────────────────────────────────────────
// Search Console: URL検査（クォータ: 2,000件/日/サイト・600件/分）
// ───────────────────────────────────────────────────────────

export type InspectionResult = {
  verdict: string | null;
  coverageState: string | null;
  indexingState: string | null;
  pageFetchState: string | null;
  robotsTxtState: string | null;
  googleCanonical: string | null;
  userCanonical: string | null;
  lastCrawlTime: string | null;
};

export async function inspectUrl(gscSiteUrl: string, url: string): Promise<InspectionResult> {
  type Api = {
    inspectionResult?: {
      indexStatusResult?: {
        verdict?: string;
        coverageState?: string;
        indexingState?: string;
        pageFetchState?: string;
        robotsTxtState?: string;
        googleCanonical?: string;
        userCanonical?: string;
        lastCrawlTime?: string;
      };
    };
  };
  const data = await request<Api>(
    "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
    { inspectionUrl: url, siteUrl: gscSiteUrl, languageCode: "ja" }
  );
  const r = data.inspectionResult?.indexStatusResult ?? {};
  return {
    verdict: r.verdict ?? null,
    coverageState: r.coverageState ?? null,
    indexingState: r.indexingState ?? null,
    pageFetchState: r.pageFetchState ?? null,
    robotsTxtState: r.robotsTxtState ?? null,
    googleCanonical: r.googleCanonical ?? null,
    userCanonical: r.userCanonical ?? null,
    lastCrawlTime: r.lastCrawlTime ?? null,
  };
}

// 検査結果から「インデックス対象から外すべきURLか」を判定する。
// noindex・robotsブロック・404系・リダイレクト・canonicalが別URL は対象外にする
// （ローテーションの周回を対象URLだけに保つ）。
export function classifyIndexTarget(
  url: string,
  r: InspectionResult
): { indexTarget: boolean; excludeReason: string | null } {
  if (r.indexingState && r.indexingState !== "INDEXING_ALLOWED") {
    return { indexTarget: false, excludeReason: `noindex等（${r.indexingState}）` };
  }
  const fetchState = r.pageFetchState ?? "";
  if (/NOT_FOUND|SOFT_404|REDIRECT|ACCESS_DENIED|ACCESS_FORBIDDEN|SERVER_ERROR/i.test(fetchState)) {
    return { indexTarget: false, excludeReason: `取得エラー（${fetchState}）` };
  }
  if (r.googleCanonical && normalizeUrl(r.googleCanonical) !== normalizeUrl(url)) {
    // Google側が別URLを正規と判断 → このURL自体は検査対象から外す（正規URL側は台帳に別途存在する想定）
    return { indexTarget: false, excludeReason: "正規URLが別（canonical不一致）" };
  }
  return { indexTarget: true, excludeReason: null };
}

function normalizeUrl(u: string): string {
  return u.replace(/\/+$/, "").toLowerCase();
}

// ───────────────────────────────────────────────────────────
// GA4 Data API
// ───────────────────────────────────────────────────────────

type Ga4ReportRequest = {
  dateRanges: Array<{ startDate: string; endDate: string }>;
  dimensions: Array<{ name: string }>;
  metrics: Array<{ name: string }>;
  limit?: number;
};

type Ga4ReportResponse = {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
};

export type Ga4Row = { dims: string[]; metrics: number[] };

export async function runGa4Report(propertyId: string, req: Ga4ReportRequest): Promise<Ga4Row[]> {
  const data = await request<Ga4ReportResponse>(
    `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
    { ...req, limit: req.limit ?? 10000 }
  );
  return (data.rows ?? []).map((r) => ({
    dims: (r.dimensionValues ?? []).map((d) => d.value ?? ""),
    metrics: (r.metricValues ?? []).map((m) => Number(m.value ?? 0)),
  }));
}

// 共通メトリクス（チャネル日次・ページ日次で同じ並びを使う）
export const GA4_METRICS = [
  "sessions",
  "activeUsers",
  "screenPageViews",
  "keyEvents",
  "userEngagementDuration",
  "bounceRate",
] as const;
