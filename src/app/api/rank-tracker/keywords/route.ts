// 追跡キーワード管理API（社内専用・middlewareでBasic認証）。
//   GET    ?domain=&enabledOnly=1     → 一覧
//   POST   {keyword,domain} / {keywords:[],domain} / {items:[{keyword,domain}]} → 登録（単一・一括）
//   PATCH  {keyword,domain,enabled}   → 定期取得ON/OFFトグル
//   DELETE {keyword,domain}           → 削除
import { NextResponse } from "next/server";
import {
  listTrackedKeywords,
  addTrackedKeywords,
  setKeywordEnabled,
  deleteTrackedKeyword,
  targetKey,
  isValidTargetDomain,
} from "@/lib/rank-tracker/bigquery";
import { DEFAULT_TARGET_DOMAIN } from "@/lib/rank-tracker/keywords";

// @google-cloud/bigquery は Node API 必須のため Edge 不可
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badJson() {
  return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get("domain")?.trim() || undefined;
  const enabledOnly = searchParams.get("enabledOnly") === "1";
  try {
    const items = await listTrackedKeywords({ domain, enabledOnly });
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    console.error("[rank-tracker] キーワード一覧の取得に失敗:", err);
    return NextResponse.json({ ok: false, error: "一覧の取得に失敗しました。" }, { status: 500 });
  }
}

type PostBody = {
  keyword?: string;
  domain?: string;
  keywords?: string[]; // 一括登録: キーワード配列（domain 共通）
  items?: { keyword: string; domain: string }[];
};

export async function POST(request: Request) {
  let body: PostBody;
  try {
    body = await request.json();
  } catch {
    return badJson();
  }

  // 受理する形:
  //  1) { keyword, domain }             単一
  //  2) { keywords: string[], domain }  一括（ドメイン共通・改行分割はUI側）
  //  3) { items: [{keyword, domain}] }  明示
  const commonDomain =
    typeof body.domain === "string" && body.domain.trim() ? body.domain : DEFAULT_TARGET_DOMAIN;
  let raw: { keyword?: unknown; domain?: unknown }[] = [];
  if (Array.isArray(body.items)) {
    raw = body.items.map((it) => ({ keyword: it?.keyword, domain: it?.domain ?? commonDomain }));
  } else if (Array.isArray(body.keywords)) {
    raw = body.keywords.map((k) => ({ keyword: k, domain: commonDomain }));
  } else if (body.keyword) {
    raw = [{ keyword: body.keyword, domain: commonDomain }];
  }

  // 文字列以外・空キーワードを弾く（非文字列で .trim() が落ちて500になるのを防ぐ）
  const items: { keyword: string; domain: string }[] = [];
  for (const it of raw) {
    if (typeof it.keyword !== "string" || typeof it.domain !== "string") continue;
    const keyword = it.keyword.trim();
    if (!keyword) continue;
    items.push({ keyword, domain: it.domain });
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
  const invalid = [...new Set(items.map((it) => it.domain).filter((d) => !isValidTargetDomain(targetKey(d))))];
  if (invalid.length > 0) {
    return NextResponse.json(
      { ok: false, error: `対象ドメインが不正です: ${invalid.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const added = await addTrackedKeywords(items);
    return NextResponse.json({ ok: true, added });
  } catch (err) {
    console.error("[rank-tracker] キーワード登録に失敗:", err);
    return NextResponse.json({ ok: false, error: "登録に失敗しました。" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  let body: { keyword?: string; domain?: string; enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return badJson();
  }
  const keyword = typeof body.keyword === "string" ? body.keyword.trim() : "";
  const domain = typeof body.domain === "string" ? body.domain.trim() : "";
  if (!keyword || !domain || typeof body.enabled !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "keyword / domain / enabled が必要です。" },
      { status: 400 }
    );
  }
  try {
    await setKeywordEnabled(keyword, domain, body.enabled);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[rank-tracker] ON/OFF更新に失敗:", err);
    return NextResponse.json({ ok: false, error: "更新に失敗しました。" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  let body: { keyword?: string; domain?: string };
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
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[rank-tracker] 削除に失敗:", err);
    return NextResponse.json({ ok: false, error: "削除に失敗しました。" }, { status: 500 });
  }
}
