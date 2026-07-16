import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/rank-tracker/session-token";

// 順位計測ツールは社内＋招待メンバー専用。
// 認証はセッションCookie（ログイン機能）を第一とし、移行期間中は Basic認証も
// フォールバックとして受け付ける。ここ（Edge）では署名と有効期限のみ検証し、
// メンバーの実在・権限は各ページ/API の getAccess()（BigQuery照合）が担う。
export const config = {
  matcher: ["/rank-tracker", "/rank-tracker/:path*", "/api/rank-tracker/:path*"],
};

// 認証なしで通すパス
const PUBLIC_PREFIXES = [
  "/rank-tracker/login",
  "/rank-tracker/invite/", // 招待受諾（トークン自体が資格情報）
  "/api/rank-tracker/auth/", // login / logout / invite受諾
  "/api/rank-tracker/cron", // Vercel Cron（CRON_SECRET で別途保護）
  "/api/rank-tracker/seo/cron", // SEO観測の日次取り込み（CRON_SECRET で別途保護）
  "/api/rank-tracker/seo/proposals-cron", // 週次AI提案の生成（CRON_SECRET で別途保護）
];

function checkBasicAuth(header: string | null): boolean {
  const user = process.env.RANK_TRACKER_USER;
  const pass = process.env.RANK_TRACKER_PASS;
  // user/pass 未設定なら fail-closed（Basic経路は誰も通れない）
  if (!user || !pass || !header?.startsWith("Basic ")) return false;
  try {
    const decoded = atob(header.slice(6));
    const sep = decoded.indexOf(":");
    return decoded.slice(0, sep) === user && decoded.slice(sep + 1) === pass;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // 1) セッションCookie
  const secret = process.env.AUTH_SESSION_SECRET;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (secret && token && (await verifySessionToken(token, secret))) {
    return NextResponse.next();
  }

  // 2) Basic認証フォールバック（curl等の既存運用・移行期間）
  if (checkBasicAuth(req.headers.get("authorization"))) {
    return NextResponse.next();
  }

  // 未認証: APIはJSONの401、ページはログイン画面へ
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "認証が必要です。" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/rank-tracker/login";
  url.search = `next=${encodeURIComponent(pathname + (req.nextUrl.search || ""))}`;
  return NextResponse.redirect(url);
}
