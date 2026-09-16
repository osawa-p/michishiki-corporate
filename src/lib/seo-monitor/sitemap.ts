// sitemap.xml からURL一覧を取得する。URL検査ローテーションの対象台帳（seo_urls）の
// 初期ソース。sitemapindex（入れ子）は1階層だけ辿る。
// 将来カバレッジスクレイパーが入ったら、そちらの「検出URL」で台帳を補完する。

const FETCH_TIMEOUT_MS = 15_000;
const MAX_CHILD_SITEMAPS = 20;
const MAX_URLS = 5_000;

async function fetchXml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "user-agent": "michishiki-seo-monitor/1.0" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractLocs(xml: string): string[] {
  const out: string[] = [];
  // <loc> の中身は素のテキストか CDATA のどちらか。All in One SEO 等の WordPress プラグインは
  // <loc><![CDATA[https://…]]></loc> 形式で出力する（例: ai-keiei.shift-ai.co.jp）。
  // 旧実装は素のテキストしか受け付けず、CDATA 形式の sitemap は URL 0件として扱われていた。
  const re = /<loc>\s*(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]+?))\s*<\/loc>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[1] != null) {
      // CDATA 内はエンティティ展開されない（書かれたまま使う）
      const u = m[1].trim();
      if (u) out.push(u);
      continue;
    }
    // XMLエンティティの最低限のデコード
    out.push(m[2].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
  }
  return out;
}

// sitemap（または sitemapindex）からURL一覧を返す。取得失敗は空配列。
export async function fetchSitemapUrls(sitemapUrl: string): Promise<string[]> {
  const xml = await fetchXml(sitemapUrl);
  if (!xml) return [];

  // sitemapindex の場合は子sitemapを順に取得
  if (/<sitemapindex[\s>]/i.test(xml)) {
    const children = extractLocs(xml).slice(0, MAX_CHILD_SITEMAPS);
    const urls: string[] = [];
    for (const child of children) {
      const childXml = await fetchXml(child);
      if (childXml) urls.push(...extractLocs(childXml));
      if (urls.length >= MAX_URLS) break;
    }
    return dedupe(urls).slice(0, MAX_URLS);
  }

  return dedupe(extractLocs(xml)).slice(0, MAX_URLS);
}

function dedupe(urls: string[]): string[] {
  return [...new Set(urls.filter((u) => /^https?:\/\//i.test(u)))];
}

export function defaultSitemapUrl(site: string): string {
  return `https://${site}/sitemap.xml`;
}
