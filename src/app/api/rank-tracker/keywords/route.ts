// 追跡キーワード管理API（社内専用・middlewareでBasic認証）。
//   GET    ?domain=                     → 一覧（cadence/tags/next_run_at 含む）
//   POST   {keyword,domain,cadence?,tags?} / {keywords:[],domain,cadence?,tags?} / {items:[...]} → 登録
//   PATCH  {keyword,domain,cadence?,tags?} → 頻度・タグの更新
//   DELETE {keyword,domain}             → 削除
import { NextResponse } from "next/server";
import {
  listTrackedKeywords,
  addTrackedKeywords,
  updateTrackedKeyword,
  deleteTrackedKeyword,
  getSiteSettings,
} from "@/lib/rank-tracker/bigquery";
import { invalidateRankTrackerCache } from "@/lib/rank-tracker/cached";
import {
  requireAccessApi,
  canAccessKeywords,
  canEditKeywordsFor,
  type Access,
} from "@/lib/rank-tracker/auth";
import { targetKey, isValidTargetDomain } from "@/lib/rank-tracker/domain";
import { isCadence, DEFAULT_CADENCE, cadenceLabel, CADENCES, type Cadence } from "@/lib/rank-tracker/cadence";
import {
  isCadenceAllowed,
  predictMonthlyTokens,
  formatTokens,
  type SiteSettings,
} from "@/lib/rank-tracker/limits";
import { DEFAULT_TARGET_DOMAIN } from "@/lib/rank-tracker/keywords";

// @google-cloud/bigquery は Node API 必須のため Edge 不可
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badJson() {
  return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
}

function forbidden(msg: string) {
  return NextResponse.json({ ok: false, error: msg }, { status: 403 });
}

function slowestAllowedLabel(settings: SiteSettings): string {
  return CADENCES.find((c) => c.days === settings.min_interval_days)?.label ?? "週1";
}

// サイト制限（頻度・上限キーワード数・月間予算）の検証。違反時はエラーメッセージを返す。
async function checkAddLimits(
  items: { keyword: string; domain: string; cadence: Cadence }[]
): Promise<string | null> {
  const byDomain = new Map<string, { keyword: string; cadence: Cadence }[]>();
  for (const it of items) {
    const d = targetKey(it.domain);
    const arr = byDomain.get(d) ?? [];
    arr.push({ keyword: it.keyword, cadence: it.cadence });
    byDomain.set(d, arr);
  }
  for (const [dom, list] of byDomain) {
    const settings = await getSiteSettings(dom);
    for (const it of list) {
      if (!isCadenceAllowed(it.cadence, settings)) {
        return `${dom} で使える頻度は「${slowestAllowedLabel(settings)}」より低頻度のみです（「${cadenceLabel(it.cadence)}」は不可）。`;
      }
    }
    const existing = await listTrackedKeywords({ domain: dom });
    const existingSet = new Set(existing.map((r) => r.keyword));
    const fresh = [
      ...new Map(list.filter((it) => !existingSet.has(it.keyword)).map((it) => [it.keyword, it])).values(),
    ];
    if (fresh.length === 0) continue;
    if (settings.max_keywords != null && existing.length + fresh.length > settings.max_keywords) {
      return `${dom} の上限キーワード数（${settings.max_keywords}件）を超えます（登録済み${existing.length}件＋新規${fresh.length}件）。`;
    }
    if (settings.monthly_budget != null) {
      const predicted = predictMonthlyTokens(
        [...existing.map((r) => r.cadence), ...fresh.map((it) => it.cadence)],
        settings
      );
      if (predicted > settings.monthly_budget) {
        return `${dom} の月間クレジット予算（${formatTokens(settings.monthly_budget)}）を超えます（この登録後の予測消費 約${formatTokens(predicted)}）。頻度を下げるか予算の変更を管理者に依頼してください。`;
      }
    }
  }
  return null;
}

// 頻度変更時のサイト制限検証
async function checkCadenceLimits(
  keyword: string,
  domain: string,
  cadence: Cadence
): Promise<string | null> {
  const dom = targetKey(domain);
  const settings = await getSiteSettings(dom);
  if (!isCadenceAllowed(cadence, settings)) {
    return `${dom} で使える頻度は「${slowestAllowedLabel(settings)}」より低頻度のみです（「${cadenceLabel(cadence)}」は不可）。`;
  }
  if (settings.monthly_budget != null && cadence !== "stopped") {
    const existing = await listTrackedKeywords({ domain: dom });
    const cadences = existing.map((r) => (r.keyword === keyword ? cadence : r.cadence));
    const predicted = predictMonthlyTokens(cadences, settings);
    if (predicted > settings.monthly_budget) {
      return `${dom} の月間クレジット予算（${formatTokens(settings.monthly_budget)}）を超えます（この変更後の予測消費 約${formatTokens(predicted)}）。`;
    }
  }
  return null;
}

// editor は許可サイトのキーワードだけ編集できる
function checkDomainAcl(access: Access, domains: string[]): string | null {
  for (const d of domains) {
    if (!canEditKeywordsFor(access, d)) {
      return `${targetKey(d)} のキーワードを編集する権限がありません。`;
    }
  }
  return null;
}

// 文字列配列だけを受理してタグを整形（非文字列は無視、重複除去、最大10個・各30文字）
function sanitizeTags(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return [
    ...new Set(
      v
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => t.slice(0, 30))
    ),
  ].slice(0, 10);
}

export async function GET(request: Request) {
  const { access, error } = await requireAccessApi();
  if (error) return error;
  if (!canAccessKeywords(access!)) {
    return forbidden("キーワード一覧を見る権限がありません。");
  }
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get("domain")?.trim() || undefined;
  try {
    let items = await listTrackedKeywords({ domain });
    // 管理者以外は許可サイトの分だけ
    if (access!.role !== "admin") {
      items = items.filter((r) => access!.domains.includes(r.target_domain));
    }
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    console.error("[rank-tracker] キーワード一覧の取得に失敗:", err);
    return NextResponse.json({ ok: false, error: "一覧の取得に失敗しました。" }, { status: 500 });
  }
}

type PostBody = {
  keyword?: unknown;
  domain?: unknown;
  cadence?: unknown;
  tags?: unknown;
  keywords?: unknown[]; // 一括登録: キーワード配列（domain/cadence/tags 共通）
  items?: { keyword?: unknown; domain?: unknown; cadence?: unknown; tags?: unknown }[];
};

export async function POST(request: Request) {
  const { access, error } = await requireAccessApi();
  if (error) return error;
  let body: PostBody;
  try {
    body = await request.json();
  } catch {
    return badJson();
  }

  const commonDomain =
    typeof body.domain === "string" && body.domain.trim() ? body.domain : DEFAULT_TARGET_DOMAIN;
  const commonCadence: Cadence = isCadence(body.cadence) ? body.cadence : DEFAULT_CADENCE;
  const commonTags = sanitizeTags(body.tags) ?? [];

  // 受理する形:
  //  1) { keyword, domain, cadence?, tags? }             単一
  //  2) { keywords: string[], domain, cadence?, tags? }  一括（共通設定・改行分割はUI側）
  //  3) { items: [{keyword, domain, cadence?, tags?}] }  明示
  let raw: { keyword?: unknown; domain?: unknown; cadence?: unknown; tags?: unknown }[] = [];
  if (Array.isArray(body.items)) {
    raw = body.items.map((it) => ({
      keyword: it?.keyword,
      domain: it?.domain ?? commonDomain,
      cadence: it?.cadence,
      tags: it?.tags,
    }));
  } else if (Array.isArray(body.keywords)) {
    raw = body.keywords.map((k) => ({ keyword: k, domain: commonDomain }));
  } else if (body.keyword) {
    raw = [{ keyword: body.keyword, domain: commonDomain }];
  }

  // 文字列以外・空キーワードを弾く（非文字列で .trim() が落ちて500になるのを防ぐ）
  const items: { keyword: string; domain: string; cadence: Cadence; tags: string[] }[] = [];
  for (const it of raw) {
    if (typeof it.keyword !== "string" || typeof it.domain !== "string") continue;
    const keyword = it.keyword.trim();
    if (!keyword) continue;
    items.push({
      keyword,
      domain: it.domain,
      cadence: isCadence(it.cadence) ? it.cadence : commonCadence,
      tags: sanitizeTags(it.tags) ?? commonTags,
    });
  }
  if (items.length === 0) {
    return NextResponse.json(
      { ok: false, error: "登録するキーワードがありません。" },
      { status: 400 }
    );
  }
  if (items.length > 500) {
    return NextResponse.json(
      { ok: false, error: "一度に登録できるのは500件までです。" },
      { status: 400 }
    );
  }

  // ドメインはホスト名として妥当なものだけ受理（URL貼り付けは targetKey が hostname 抽出で救済）
  const invalid = [
    ...new Set(items.map((it) => it.domain).filter((d) => !isValidTargetDomain(targetKey(d)))),
  ];
  if (invalid.length > 0) {
    return NextResponse.json(
      { ok: false, error: `対象ドメインが不正です: ${invalid.join(", ")}` },
      { status: 400 }
    );
  }

  // ドメインのACL（editorは許可サイトのみ）
  const aclErr = checkDomainAcl(access!, items.map((it) => it.domain));
  if (aclErr) return forbidden(aclErr);

  try {
    // サイト制限（頻度・上限数・月間予算）を検証してから登録する
    const limitErr = await checkAddLimits(items);
    if (limitErr) {
      return NextResponse.json({ ok: false, error: limitErr }, { status: 400 });
    }
    const added = await addTrackedKeywords(items);
    invalidateRankTrackerCache();
    return NextResponse.json({ ok: true, added, requested: items.length });
  } catch (err) {
    console.error("[rank-tracker] キーワード登録に失敗:", err);
    return NextResponse.json({ ok: false, error: "登録に失敗しました。" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const { access, error } = await requireAccessApi();
  if (error) return error;
  let body: { keyword?: unknown; domain?: unknown; cadence?: unknown; tags?: unknown };
  try {
    body = await request.json();
  } catch {
    return badJson();
  }
  const keyword = typeof body.keyword === "string" ? body.keyword.trim() : "";
  const domain = typeof body.domain === "string" ? body.domain.trim() : "";
  const cadence = isCadence(body.cadence) ? body.cadence : undefined;
  const tags = sanitizeTags(body.tags);
  if (!keyword || !domain || (!cadence && !tags)) {
    return NextResponse.json(
      { ok: false, error: "keyword / domain と cadence または tags が必要です。" },
      { status: 400 }
    );
  }
  const aclErr = checkDomainAcl(access!, [domain]);
  if (aclErr) return forbidden(aclErr);
  try {
    if (cadence) {
      const limitErr = await checkCadenceLimits(keyword, domain, cadence);
      if (limitErr) {
        return NextResponse.json({ ok: false, error: limitErr }, { status: 400 });
      }
    }
    const affected = await updateTrackedKeyword(keyword, domain, { cadence, tags });
    if (affected === 0) {
      return NextResponse.json(
        { ok: false, error: "対象のキーワードが見つかりません（削除された可能性があります）。" },
        { status: 404 }
      );
    }
    invalidateRankTrackerCache();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[rank-tracker] キーワード更新に失敗:", err);
    return NextResponse.json({ ok: false, error: "更新に失敗しました。" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { access, error } = await requireAccessApi();
  if (error) return error;
  let body: { keyword?: unknown; domain?: unknown };
  try {
    body = await request.json();
  } catch {
    return badJson();
  }
  const keyword = typeof body.keyword === "string" ? body.keyword.trim() : "";
  const domain = typeof body.domain === "string" ? body.domain.trim() : "";
  if (!keyword || !domain) {
    return NextResponse.json(
      { ok: false, error: "keyword / domain が必要です。" },
      { status: 400 }
    );
  }
  const aclErr = checkDomainAcl(access!, [domain]);
  if (aclErr) return forbidden(aclErr);
  try {
    await deleteTrackedKeyword(keyword, domain);
    invalidateRankTrackerCache();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[rank-tracker] 削除に失敗:", err);
    return NextResponse.json({ ok: false, error: "削除に失敗しました。" }, { status: 500 });
  }
}
