import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getAccess, canViewDomain } from "@/lib/rank-tracker/auth";

// RASIK 月次オーガニックレポート（自己完結HTML）を認証付きでそのまま配信する。
// クライアント売上を含むため、rasik.style の閲覧権限（ACL）を持つメンバー限定。
export const dynamic = "force-dynamic";

const REPORTS_DIR = path.join(process.cwd(), "src", "data", "reports", "rasik");

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

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
      "Cache-Control": "private, no-store",
    },
  });
}
