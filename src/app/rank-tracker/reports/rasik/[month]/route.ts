import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getAccess, canViewDomain } from "@/lib/rank-tracker/auth";

// RASIK 月次オーガニックレポート（自己完結HTML）を認証付きでそのまま配信する。
// クライアント売上を含むため、rasik.style の閲覧権限（ACL）を持つメンバー限定。
// 配信時に共通ナビバー（一覧へ戻る・前月/次月・ツールへ）をbody直後へ注入する。
export const dynamic = "force-dynamic";

const REPORTS_DIR = path.join(process.cwd(), "src", "data", "reports", "rasik");

async function availableMonths(): Promise<string[]> {
  try {
    const files = await fs.readdir(REPORTS_DIR);
    return files
      .filter((f) => /^\d{6}\.html$/.test(f))
      .map((f) => f.slice(0, 6))
      .sort();
  } catch {
    return [];
  }
}

function monthLabel(yyyymm: string): string {
  return `${yyyymm.slice(0, 4)}年${Number(yyyymm.slice(4))}月`;
}

// レポートHTMLのCSSと衝突しないよう #rtnav 配下に閉じる。印刷時は非表示。
function buildNavHtml(month: string, months: string[]): string {
  const i = months.indexOf(month);
  const prev = i > 0 ? months[i - 1] : null;
  const next = i >= 0 && i < months.length - 1 ? months[i + 1] : null;

  const prevEl = prev
    ? `<a href="/rank-tracker/reports/rasik/${prev}">← ${monthLabel(prev)}</a>`
    : `<span class="dis">← 前月</span>`;
  const nextEl = next
    ? `<a href="/rank-tracker/reports/rasik/${next}">${monthLabel(next)} →</a>`
    : `<span class="dis">翌月 →</span>`;

  return `
<div id="rtnav">
  <a href="/rank-tracker/reports" class="back">≡ レポート一覧</a>
  <span class="grp">${prevEl}<span class="cur">${monthLabel(month)}</span>${nextEl}</span>
  <span class="sp"></span>
  <a href="/rank-tracker/dashboard" class="tool">順位計測ツールへ ↗</a>
</div>
<style>
#rtnav{position:sticky;top:0;z-index:1000;display:flex;align-items:center;gap:10px;flex-wrap:wrap;
  padding:9px 20px;background:rgba(255,255,255,.96);backdrop-filter:blur(6px);
  border-bottom:1px solid #e3e0da;box-shadow:0 1px 6px rgba(0,0,0,.04);
  font:13px/1.5 -apple-system,"Segoe UI","Hiragino Sans","Noto Sans JP",sans-serif;color:#555}
#rtnav a{color:#2f6f6a;text-decoration:none;font-weight:600;padding:4px 9px;border-radius:6px;white-space:nowrap}
#rtnav a:hover{background:#eef4f3}
#rtnav .grp{display:flex;align-items:center;gap:4px}
#rtnav .cur{font-weight:700;color:#222;padding:4px 6px;white-space:nowrap}
#rtnav .dis{color:#c2beb8;padding:4px 9px;white-space:nowrap}
#rtnav .sp{flex:1}
@media(max-width:560px){#rtnav{padding:8px 12px;gap:6px}#rtnav .back,#rtnav .tool{font-size:12px}}
@media print{#rtnav{display:none}}
</style>`;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ month: string }> },
) {
  const access = await getAccess();
  if (!access) {
    return NextResponse.redirect(new URL("/rank-tracker/login", req.url));
  }
  if (!canViewDomain(access, "rasik.style")) {
    return NextResponse.redirect(new URL("/rank-tracker/dashboard", req.url));
  }

  // パストラバーサル防止: YYYYMM 形式のみ受け付ける
  const { month } = await params;
  if (!/^\d{6}$/.test(month)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  let html: string;
  try {
    html = await fs.readFile(path.join(REPORTS_DIR, `${month}.html`), "utf-8");
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }

  // body開始タグ直後にナビを注入（レポートHTML自体は無加工で運用する）
  const months = await availableMonths();
  const nav = buildNavHtml(month, months);
  const injected = html.replace(/<body([^>]*)>/i, (m) => `${m}${nav}`);

  return new NextResponse(injected, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
      "Cache-Control": "private, no-store",
    },
  });
}
