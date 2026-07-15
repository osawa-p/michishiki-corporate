// JINA検索API (s.jina.ai) クライアント。
//
// s.jina.ai は「Google検索1ページ分（約10件）」ずつしか返さない。
// X-Count ヘッダや num クエリでは件数を増やせない（num は400）。
// 件数を増やすには page クエリでページを進めて連結する。実測では
// page=1..11 で累計100件まで取得できる（重複URLを除いた通し順位）。
// 1リクエスト＝約1万トークン消費するため、num=100 は約10万トークン/KW。
//
// （Python版 rank_tracker/jina.py のTS移植）

import type { SerpResult } from "./types";

const SEARCH_ENDPOINT = "https://s.jina.ai/";
// s.jina.ai が1ページで返す概算件数（Google 1ページ相当）
const PER_PAGE = 10;

type JinaItem = { url?: string; title?: string };

export type SearchOptions = {
  num?: number;
  gl?: string;
  hl?: string;
  timeoutMs?: number;
  maxPages?: number;
};

// URLからホスト名を取り出し www. を除去して小文字化する
export function normalizeDomain(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return "";
  }
}

// JINA検索APIでSERPをページングして取得し、URL重複を除いた通し順位を振る。
// 1ページ目の失敗（APIキー失効・レート制限等）は throw する — 「静かに0件成功」に
// させないため。2ページ目以降の失敗はそこまでの結果で打ち切る（num を下回ることがある）。
export async function searchJina(
  keyword: string,
  apiKey: string,
  opts: SearchOptions = {}
): Promise<SerpResult[]> {
  const { num = 100, gl = "jp", hl = "ja", timeoutMs = 60_000 } = opts;
  // 1ページ約10件なので、必要ページ数は num から概算（+1で取りこぼしを緩衝）
  const maxPages = opts.maxPages ?? Math.ceil(num / PER_PAGE) + 1;

  const results: SerpResult[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= maxPages; page++) {
    if (results.length >= num) break;

    const params = new URLSearchParams({ q: keyword, gl, hl, page: String(page) });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let data: JinaItem[];
    try {
      const resp = await fetch(`${SEARCH_ENDPOINT}?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
          // 本文（ページ全文）は不要なので取得を抑止してレスポンスを軽くする
          "X-Respond-With": "no-content",
          // キャッシュを使わず毎回素の検索結果を取る（シークレットモード相当）
          "X-No-Cache": "true",
        },
        signal: controller.signal,
      });
      if (!resp.ok) {
        if (page === 1) throw new Error(`JINA検索が失敗しました (HTTP ${resp.status})`);
        break;
      }
      const json = (await resp.json()) as { data?: JinaItem[] };
      data = json.data ?? [];
    } catch (err) {
      // 1ページ目の失敗は上に伝える。2ページ目以降はそこまでの結果で打ち切る
      if (page === 1) {
        throw err instanceof Error ? err : new Error("JINA検索に失敗しました");
      }
      break;
    } finally {
      clearTimeout(timer);
    }

    if (data.length === 0) break;

    for (const item of data) {
      const url = item.url ?? "";
      if (!url || seen.has(url)) continue;
      seen.add(url);
      results.push({
        rank: results.length + 1,
        url,
        domain: normalizeDomain(url),
        title: item.title ?? "",
      });
      if (results.length >= num) break;
    }
  }

  return results.slice(0, num);
}
