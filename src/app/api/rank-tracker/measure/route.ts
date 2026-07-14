// その場計測API。キーワード＋ターゲットドメインを受け取り、
// JINAでSERPを取得し、BigQueryへ追記して結果を返す。
import { NextResponse } from "next/server";
import { searchJina } from "@/lib/rank-tracker/jina";
import { insertResults, targetKey } from "@/lib/rank-tracker/bigquery";
import { DEFAULT_TARGET_DOMAIN } from "@/lib/rank-tracker/keywords";

// @google-cloud/bigquery は Node API 必須のため Edge 不可
export const runtime = "nodejs";
// 100件取得はページングで時間がかかる。VercelはProプランなので120秒まで延長
export const maxDuration = 120;

type MeasureBody = {
  keyword?: string;
  domain?: string;
  num?: number;
  noBq?: boolean;
};

export async function POST(request: Request) {
  let body: MeasureBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const keyword = body.keyword?.trim() ?? "";
  const domain = body.domain?.trim() || DEFAULT_TARGET_DOMAIN;
  // 非数値（"full" や {} 等）を渡されると NaN のまま素通りして「0件の空成功」を返してしまうため、
  // 有限数でなければデフォルト100に落とす。数値文字列("50")は Number で数値化されるので許容。
  const rawNum = Number(body.num ?? 100);
  const num = Number.isFinite(rawNum) ? Math.min(Math.max(Math.trunc(rawNum), 1), 100) : 100;

  if (!keyword) {
    return NextResponse.json({ ok: false, error: "キーワードを入力してください。" }, { status: 400 });
  }

  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) {
    console.error("[rank-tracker] JINA_API_KEY が未設定です。");
    return NextResponse.json(
      { ok: false, error: "サーバーのJINA設定が未完了です。" },
      { status: 500 }
    );
  }

  try {
    const results = await searchJina(keyword, apiKey, { num });
    const target = targetKey(domain);
    const hit = results.find((r) => r.domain === target) ?? null;

    const checkedAt = new Date().toISOString();
    let inserted = 0;
    if (!body.noBq && results.length > 0) {
      inserted = await insertResults(results, keyword, domain, checkedAt);
    }

    return NextResponse.json({
      ok: true,
      keyword,
      domain,
      checkedAt,
      count: results.length,
      inserted,
      target: hit ? { rank: hit.rank, url: hit.url, title: hit.title } : null,
      results,
    });
  } catch (err) {
    console.error("[rank-tracker] 計測に失敗しました:", err);
    return NextResponse.json({ ok: false, error: "計測に失敗しました。" }, { status: 500 });
  }
}
