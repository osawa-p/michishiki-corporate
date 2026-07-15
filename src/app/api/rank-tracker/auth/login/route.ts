// ログインAPI。メール＋パスワードを検証し、セッションCookieを発行する。
import { NextResponse } from "next/server";
import { verifyLogin, isValidEmail } from "@/lib/rank-tracker/members";
import { makeSessionToken, sessionCookieOptions } from "@/lib/rank-tracker/auth";
import { SESSION_COOKIE } from "@/lib/rank-tracker/session-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  // 長さ上限は scrypt の計算コスト膨張（DoS）防止
  if (!isValidEmail(email) || !password || password.length > 128) {
    return NextResponse.json(
      { ok: false, error: "メールアドレスとパスワードを入力してください。" },
      { status: 400 }
    );
  }

  try {
    const member = await verifyLogin(email, password);
    if (!member) {
      // メール存在有無を漏らさないよう文言は共通
      return NextResponse.json(
        { ok: false, error: "メールアドレスまたはパスワードが違います。" },
        { status: 401 }
      );
    }
    const token = await makeSessionToken(member.email);
    if (!token) {
      console.error("[rank-tracker] AUTH_SESSION_SECRET が未設定のためログイン不可。");
      return NextResponse.json(
        { ok: false, error: "サーバーのログイン設定が未完了です。" },
        { status: 500 }
      );
    }
    const res = NextResponse.json({ ok: true, email: member.email, role: member.role });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch (err) {
    console.error("[rank-tracker] ログイン処理に失敗:", err);
    return NextResponse.json({ ok: false, error: "ログインに失敗しました。" }, { status: 500 });
  }
}
