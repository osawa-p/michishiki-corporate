// サイト別制限・クレジット設定API（管理者専用）。
//   GET   → 追跡サイトごとの設定＋当月消費＋予測消費＋頻度分布
//   PATCH {domain, max_keywords, max_depth, min_interval_days, monthly_budget} → upsert
import { NextResponse } from "next/server";
import { upsertSiteSettings } from "@/lib/rank-tracker/bigquery";
import { buildSiteSettingsView } from "@/lib/rank-tracker/settings-view";
import { requireAdminApi } from "@/lib/rank-tracker/auth";
import { invalidateRankTrackerCache } from "@/lib/rank-tracker/cached";
import { targetKey, isValidTargetDomain } from "@/lib/rank-tracker/domain";
import { CADENCES } from "@/lib/rank-tracker/cadence";
import { isDepth } from "@/lib/rank-tracker/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await requireAdminApi();
  if (error) return error;
  try {
    const items = await buildSiteSettingsView();
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    console.error("[rank-tracker] サイト設定の取得に失敗:", err);
    return NextResponse.json({ ok: false, error: "取得に失敗しました。" }, { status: 500 });
  }
}

const ALLOWED_INTERVALS = new Set<number>(
  CADENCES.flatMap((c) => (c.days == null ? [] : [c.days]))
);

export async function PATCH(request: Request) {
  const { error } = await requireAdminApi();
  if (error) return error;
  let body: {
    domain?: unknown;
    max_keywords?: unknown;
    max_depth?: unknown;
    min_interval_days?: unknown;
    monthly_budget?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const domain = typeof body.domain === "string" ? targetKey(body.domain) : "";
  const maxKeywords =
    body.max_keywords == null
      ? null
      : Number.isInteger(body.max_keywords) && (body.max_keywords as number) >= 1
        ? (body.max_keywords as number)
        : undefined;
  const maxDepth = isDepth(body.max_depth) ? body.max_depth : undefined;
  const minInterval =
    typeof body.min_interval_days === "number" && ALLOWED_INTERVALS.has(body.min_interval_days)
      ? body.min_interval_days
      : undefined;
  const budget =
    body.monthly_budget == null
      ? null
      : Number.isInteger(body.monthly_budget) && (body.monthly_budget as number) >= 10_000
        ? (body.monthly_budget as number)
        : undefined;

  if (
    !isValidTargetDomain(domain) ||
    maxKeywords === undefined ||
    maxDepth === undefined ||
    minInterval === undefined ||
    budget === undefined
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "設定値が不正です（深度は30/50/100、頻度は既定の間隔、上限数は1以上、予算は1万トークン以上またはnull）。",
      },
      { status: 400 }
    );
  }

  try {
    await upsertSiteSettings({
      domain,
      max_keywords: maxKeywords,
      max_depth: maxDepth,
      min_interval_days: minInterval,
      monthly_budget: budget,
    });
    invalidateRankTrackerCache();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[rank-tracker] サイト設定の更新に失敗:", err);
    return NextResponse.json({ ok: false, error: "更新に失敗しました。" }, { status: 500 });
  }
}
