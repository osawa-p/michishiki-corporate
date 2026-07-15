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
} from "@/lib/rank-tracker/bigquery";
import { invalidateRankTrackerCache } from "@/lib/rank-tracker/cached";
import { targetKey, isValidTargetDomain } from "@/lib/rank-tracker/domain";
import { isCadence, DEFAULT_CADENCE, type Cadence } from "@/lib/rank-tracker/cadence";
import { DEFAULT_TARGET_DOMAIN } from "@/lib/rank-tracker/keywords";

// @google-cloud/bigquery は Node API 必須のため Edge 不可
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badJson() {
  return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
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
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get("domain")?.trim() || undefined;
  try {
    const items = await listTrackedKeywords({ domain });
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

  try {
    const added = await addTrackedKeywords(items);
    invalidateRankTrackerCache();
    return NextResponse.json({ ok: true, added, requested: items.length });
  } catch (err) {
    console.error("[rank-tracker] キーワード登録に失敗:", err);
    return NextResponse.json({ ok: false, error: "登録に失敗しました。" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
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
  try {
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
  try {
    await deleteTrackedKeyword(keyword, domain);
    invalidateRankTrackerCache();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[rank-tracker] 削除に失敗:", err);
    return NextResponse.json({ ok: false, error: "削除に失敗しました。" }, { status: 500 });
  }
}
