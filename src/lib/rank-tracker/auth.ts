// 認可ヘルパー（Nodeランタイム専用: サーバーページ・ルートハンドラから使う）。
// middleware は署名と有効期限だけを検証する軽いゲート。ここでは BigQuery の
// members を照合（60秒キャッシュ）するため、削除・権限変更が最大60秒で反映される。
// 移行期間中は Basic認証もフォールバックとして受け付ける（管理者相当）。
import { cookies, headers } from "next/headers";
import { unstable_cache, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE_SEC, signSession, verifySessionToken } from "./session-token";
import { getMemberAuth, type MemberAuth, type MemberRole } from "./members";
import { targetKey } from "./domain";

export const MEMBERS_CACHE_TAG = "rank-tracker-members";

export function invalidateMembersCache(): void {
  revalidateTag(MEMBERS_CACHE_TAG, "max");
}

// domains はビュー権限の対象サイト（正規化済み）。admin は全サイト（domains は未使用）。
export type Access = { email: string; role: MemberRole; domains: string[] };

function memberCached(email: string): Promise<MemberAuth | null> {
  return unstable_cache(() => getMemberAuth(email), ["rt-member", email], {
    revalidate: 60,
    tags: [MEMBERS_CACHE_TAG],
  })();
}

export async function getAccess(): Promise<Access | null> {
  // 1) セッションCookie（通常経路）
  const secret = process.env.AUTH_SESSION_SECRET;
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (secret && token) {
    const payload = await verifySessionToken(token, secret);
    if (payload) {
      const m = await memberCached(payload.email);
      if (m && m.status === "active") {
        return {
          email: m.email,
          role: m.role,
          domains: m.allowed_domains.map(targetKey).filter(Boolean),
        };
      }
    }
  }

  // 2) Basic認証フォールバック（移行期間。ログイン機能の定着後に削除予定）
  const h = await headers();
  const auth = h.get("authorization");
  const user = process.env.RANK_TRACKER_USER;
  const pass = process.env.RANK_TRACKER_PASS;
  if (auth?.startsWith("Basic ") && user && pass) {
    try {
      const decoded = atob(auth.slice(6));
      const sep = decoded.indexOf(":");
      if (decoded.slice(0, sep) === user && decoded.slice(sep + 1) === pass) {
        return { email: "(basic-auth)", role: "admin", domains: [] };
      }
    } catch {
      // 不正なbase64は未認証として扱う
    }
  }
  return null;
}

export function canViewDomain(access: Access, domain: string): boolean {
  return access.role === "admin" || access.domains.includes(targetKey(domain));
}

// ログイン成功時のセッショントークンを発行（AUTH_SESSION_SECRET 未設定なら null）
export async function makeSessionToken(email: string): Promise<string | null> {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret) return null;
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC;
  return signSession({ email, exp }, secret);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  };
}

// APIルート用ガード。error があればそれをそのまま return する。
export async function requireAccessApi(): Promise<{ access?: Access; error?: NextResponse }> {
  const access = await getAccess();
  if (!access) {
    return {
      error: NextResponse.json({ ok: false, error: "認証が必要です。" }, { status: 401 }),
    };
  }
  return { access };
}

export async function requireAdminApi(): Promise<{ access?: Access; error?: NextResponse }> {
  const { access, error } = await requireAccessApi();
  if (error) return { error };
  if (access!.role !== "admin") {
    return {
      error: NextResponse.json(
        { ok: false, error: "この操作には管理者権限が必要です。" },
        { status: 403 }
      ),
    };
  }
  return { access };
}
