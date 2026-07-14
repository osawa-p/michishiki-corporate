import { NextRequest, NextResponse } from "next/server";

// 順位計測ツールは社内専用。/rank-tracker と関連APIを Basic認証で保護する。
export const config = {
  matcher: ["/rank-tracker", "/rank-tracker/:path*", "/api/rank-tracker/:path*"],
};

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Vercel Cron が叩くエンドポイントは Basic認証の対象外（CRON_SECRET で別途保護）
  if (pathname.startsWith("/api/rank-tracker/cron")) {
    return NextResponse.next();
  }

  const user = process.env.RANK_TRACKER_USER;
  const pass = process.env.RANK_TRACKER_PASS;

  const header = req.headers.get("authorization");
  // user/pass 未設定なら fail-closed（誰も入れない）。ローカルは .env.local で設定する。
  if (user && pass && header?.startsWith("Basic ")) {
    try {
      // 不正なbase64（atob例外）は握りつぶして401チャレンジに落とす
      const decoded = atob(header.slice(6));
      const sep = decoded.indexOf(":");
      const u = decoded.slice(0, sep);
      const p = decoded.slice(sep + 1);
      if (u === user && p === pass) {
        return NextResponse.next();
      }
    } catch {
      // フォールスルーして401を返す
    }
  }

  return new NextResponse("認証が必要です", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="rank-tracker", charset="UTF-8"' },
  });
}
