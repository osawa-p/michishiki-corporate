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
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    // XMLエンティティの最低限のデコード
    out.push(m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
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
