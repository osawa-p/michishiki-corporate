// 招待受諾API。招待トークンを検証してパスワードを設定し、そのままログインさせる。
import { NextResponse } from "next/server";
import { acceptInvite } from "@/lib/rank-tracker/members";
import {
  makeSessionToken,
  sessionCookieOptions,
  invalidateMembersCache,
} from "@/lib/rank-tracker/auth";
import { SESSION_COOKIE } from "@/lib/rank-tracker/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: Request) {
  let body: { token?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!token || !/^[0-9a-f]{64}$/.test(token)) {
    return NextResponse.json({ ok: false, error: "招待リンクが不正です。" }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { ok: false, error: `パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください。` },
      { status: 400 }
    );
  }

  try {
    const accepted = await acceptInvite(token, password);
    if (!accepted) {
      return NextResponse.json(
        { ok: false, error: "招待リンクが無効か、有効期限が切れています。管理者に再発行を依頼してください。" },
        { status: 400 }
      );
    }
    invalidateMembersCache();
    const session = await makeSessionToken(accepted.email);
    const res = NextResponse.json({ ok: true, email: accepted.email });
    if (session) res.cookies.set(SESSION_COOKIE, session, sessionCookieOptions());
    return res;
  } catch (err) {
    console.error("[rank-tracker] 招待受諾に失敗:", err);
    return NextResponse.json({ ok: false, error: "処理に失敗しました。" }, { status: 500 });
  }
}
