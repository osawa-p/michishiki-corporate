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
  let items: { keyword: string; domain: string }[] = [];
  if (Array.isArray(body.items)) {
    items = body.items;
  } else if (Array.isArray(body.keywords)) {
    const domain = (body.domain || DEFAULT_TARGET_DOMAIN).trim();
    items = body.keywords.map((k) => ({ keyword: k, domain }));
  } else if (body.keyword) {
    items = [{ keyword: body.keyword, domain: (body.domain || DEFAULT_TARGET_DOMAIN).trim() }];
  }

  items = items.filter((it) => it && (it.keyword ?? "").trim());
  if (items.length === 0) {
    return NextResponse.json(
      { ok: false, error: "登録するキーワードがありません。" },
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
  const keyword = body.keyword?.trim();
  const domain = body.domain?.trim();
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
  const keyword = body.keyword?.trim();
  const domain = body.domain?.trim();
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
