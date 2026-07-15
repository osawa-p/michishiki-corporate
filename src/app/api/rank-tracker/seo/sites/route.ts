// SEO観測ツールのサイト別取得設定API（管理者専用）。
//   GET   → seo_sites 一覧
//   PATCH {site, gsc_enabled, gsc_site_url, ga4_enabled, ga4_property_id,
//          sitemap_url, inspection_daily_limit, stale_days} → upsert
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/rank-tracker/auth";
import { targetKey, isValidTargetDomain } from "@/lib/rank-tracker/domain";
import { listSeoSites, upsertSeoSite } from "@/lib/seo-monitor/bigquery";
import { invalidateSeoCache } from "@/lib/seo-monitor/cached";
import { DEFAULT_SEO_SITE } from "@/lib/seo-monitor/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await requireAdminApi();
  if (error) return error;
  try {
    const items = await listSeoSites();
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    console.error("[seo-monitor] サイト設定の取得に失敗:", err);
    return NextResponse.json({ ok: false, error: "取得に失敗しました。" }, { status: 500 });
  }
}

function optionalString(v: unknown, max: number): string | null | undefined {
  if (v == null || v === "") return null;
  if (typeof v !== "string" || v.length > max) return undefined;
  return v.trim();
}

export async function PATCH(request: Request) {
  const { error } = await requireAdminApi();
  if (error) return error;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const site = typeof body.site === "string" ? targetKey(body.site) : "";
  const gscSiteUrl = optionalString(body.gsc_site_url, 300);
  const ga4PropertyId = optionalString(body.ga4_property_id, 200);
  const sitemapUrl = optionalString(body.sitemap_url, 500);
  const limitRaw = body.inspection_daily_limit;
  const inspectionLimit =
    limitRaw == null
      ? DEFAULT_SEO_SITE.inspection_daily_limit
      : Number.isSafeInteger(limitRaw) && (limitRaw as number) >= 1 && (limitRaw as number) <= 2000
        ? (limitRaw as number)
        : undefined;
  const staleRaw = body.stale_days;
  const staleDays =
    staleRaw == null
      ? DEFAULT_SEO_SITE.stale_days
      : Number.isSafeInteger(staleRaw) && (staleRaw as number) >= 1 && (staleRaw as number) <= 365
        ? (staleRaw as number)
        : undefined;
  const gscEnabled = Boolean(body.gsc_enabled);
  const ga4Enabled = Boolean(body.ga4_enabled);
  // 省略時はクロール許可（既存サイトの互換）。明示的に false のときだけ無効化。
  const crawlEnabled = body.crawl_enabled == null ? true : Boolean(body.crawl_enabled);

  if (
    !isValidTargetDomain(site) ||
    gscSiteUrl === undefined ||
    ga4PropertyId === undefined ||
    sitemapUrl === undefined ||
    inspectionLimit === undefined ||
    staleDays === undefined
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "設定値が不正です（検査ペースは1〜2000件/日、経過日数しきい値は1〜365日）。",
      },
      { status: 400 }
    );
  }
  if (gscEnabled && !gscSiteUrl) {
    return NextResponse.json(
      { ok: false, error: "GSC取得を有効にするにはプロパティ（sc-domain:〜 等）が必要です。" },
      { status: 400 }
    );
  }
  // 複数プロパティはカンマ区切り（例: "391113939,507410349"）
  if (ga4Enabled && !/^\d{4,}(\s*,\s*\d{4,})*$/.test(ga4PropertyId ?? "")) {
    return NextResponse.json(
      { ok: false, error: "GA4取得を有効にするには数値のプロパティID（複数はカンマ区切り）が必要です。" },
      { status: 400 }
    );
  }
  if (sitemapUrl && !/^https?:\/\//i.test(sitemapUrl)) {
    return NextResponse.json(
      { ok: false, error: "sitemap URL は https:// で始まる必要があります。" },
      { status: 400 }
    );
  }

  try {
    await upsertSeoSite({
      site,
      gsc_enabled: gscEnabled,
      gsc_site_url: gscSiteUrl,
      ga4_enabled: ga4Enabled,
      ga4_property_id: ga4PropertyId,
      sitemap_url: sitemapUrl,
      crawl_enabled: crawlEnabled,
      inspection_daily_limit: inspectionLimit,
      stale_days: staleDays,
    });
    invalidateSeoCache();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[seo-monitor] サイト設定の更新に失敗:", err);
    return NextResponse.json({ ok: false, error: "更新に失敗しました。" }, { status: 500 });
  }
}
