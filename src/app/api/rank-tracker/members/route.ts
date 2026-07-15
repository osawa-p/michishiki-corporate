// メンバー管理API（管理者専用）。
//   GET    → 一覧
//   POST   {email, role, domains[]} → 招待発行（招待URLを返す）。invited への再送も同じ形
//   PATCH  {email, role?, domains?} → 権限・閲覧サイトの更新
//   DELETE {email} → 削除（自分自身は不可）
import { NextResponse } from "next/server";
import {
  listMembers,
  createInvite,
  updateMember,
  deleteMember,
  getMemberAuth,
  countActiveAdmins,
  isMemberRole,
  isValidEmail,
  normalizeEmail,
} from "@/lib/rank-tracker/members";
import { requireAdminApi, invalidateMembersCache } from "@/lib/rank-tracker/auth";
import { targetKey, isValidTargetDomain } from "@/lib/rank-tracker/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badJson() {
  return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
}

// 文字列配列だけを受理してドメイン一覧を正規化。不正なドメインが混じっていたら null。
function sanitizeDomains(v: unknown): string[] | null | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const d of v) {
    if (typeof d !== "string") return null;
    const key = targetKey(d);
    if (!key) continue;
    if (!isValidTargetDomain(key)) return null;
    out.push(key);
  }
  return [...new Set(out)];
}

export async function GET() {
  const { error } = await requireAdminApi();
  if (error) return error;
  try {
    const items = await listMembers();
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    console.error("[rank-tracker] メンバー一覧の取得に失敗:", err);
    return NextResponse.json({ ok: false, error: "一覧の取得に失敗しました。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { error } = await requireAdminApi();
  if (error) return error;

  let body: { email?: unknown; role?: unknown; domains?: unknown };
  try {
    body = await request.json();
  } catch {
    return badJson();
  }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const role = isMemberRole(body.role) ? body.role : null;
  // undefined（未指定）は空扱い、不正値は null のまま残して400にする
  const rawDomains = body.domains === undefined ? [] : sanitizeDomains(body.domains);
  if (!isValidEmail(email) || !role || rawDomains == null) {
    return NextResponse.json(
      { ok: false, error: "email / role / domains の形式が正しくありません。" },
      { status: 400 }
    );
  }
  // 管理者は全サイト閲覧できるため allowed_domains は持たせない
  // （後で閲覧のみに降格したとき、意図しないサイト権限が残るのを防ぐ）
  const domains = role === "admin" ? [] : rawDomains;
  if (role !== "admin" && domains.length === 0) {
    return NextResponse.json(
      { ok: false, error: "管理者以外のメンバーには対象サイトを1つ以上指定してください。" },
      { status: 400 }
    );
  }

  try {
    const invite = await createInvite({ email, role, domains });
    if (!invite) {
      return NextResponse.json(
        { ok: false, error: "既に有効なメンバーです。権限を変えるには一覧から編集してください。" },
        { status: 409 }
      );
    }
    invalidateMembersCache();
    // 招待URLは管理者が手動で共有する（メール送信はしない）
    const origin = new URL(request.url).origin;
    return NextResponse.json({
      ok: true,
      inviteUrl: `${origin}/rank-tracker/invite/${invite.token}`,
    });
  } catch (err) {
    console.error("[rank-tracker] 招待の発行に失敗:", err);
    return NextResponse.json({ ok: false, error: "招待の発行に失敗しました。" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const { access, error } = await requireAdminApi();
  if (error) return error;

  let body: { email?: unknown; role?: unknown; domains?: unknown };
  try {
    body = await request.json();
  } catch {
    return badJson();
  }
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const role = body.role === undefined ? undefined : isMemberRole(body.role) ? body.role : null;
  const domains = sanitizeDomains(body.domains);
  if (!isValidEmail(email) || role === null || domains === null || (!role && !domains)) {
    return NextResponse.json(
      { ok: false, error: "email と role または domains を指定してください。" },
      { status: 400 }
    );
  }
  // 自分自身の権限降格は不可（管理者が誰もいなくなる事故の防止）
  if (email === access!.email && role && role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "自分自身を管理者以外に変更することはできません。" },
      { status: 400 }
    );
  }

  try {
    // 最後の有効な管理者の降格は不可（Basic認証フォールバック経由の操作でも守る）
    if (role && role !== "admin") {
      const target = await getMemberAuth(email);
      if (target?.role === "admin" && target.status === "active" && (await countActiveAdmins()) <= 1) {
        return NextResponse.json(
          { ok: false, error: "最後の管理者を降格することはできません。" },
          { status: 400 }
        );
      }
    }
    // 管理者には allowed_domains を持たせない（昇格時に旧権限が残り、後で降格したとき
    // 意図しないサイト権限が復活するのを防ぐ）。既存管理者への domains 設定も同様に無効化
    let effDomains = domains;
    if (role === "admin") {
      effDomains = [];
    } else if (!role && domains) {
      const target = await getMemberAuth(email);
      if (target?.role === "admin") effDomains = [];
    }
    const affected = await updateMember(email, { role, domains: effDomains });
    if (affected === 0) {
      return NextResponse.json(
        { ok: false, error: "対象のメンバーが見つかりません。" },
        { status: 404 }
      );
    }
    invalidateMembersCache();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[rank-tracker] メンバー更新に失敗:", err);
    return NextResponse.json({ ok: false, error: "更新に失敗しました。" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { access, error } = await requireAdminApi();
  if (error) return error;

  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return badJson();
  }
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  if (!isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: "email が必要です。" }, { status: 400 });
  }
  if (email === access!.email) {
    return NextResponse.json(
      { ok: false, error: "自分自身は削除できません。" },
      { status: 400 }
    );
  }

  try {
    // 最後の有効な管理者の削除は不可（ロックアウト防止）
    const target = await getMemberAuth(email);
    if (target?.role === "admin" && target.status === "active" && (await countActiveAdmins()) <= 1) {
      return NextResponse.json(
        { ok: false, error: "最後の管理者は削除できません。" },
        { status: 400 }
      );
    }
    await deleteMember(email);
    invalidateMembersCache();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[rank-tracker] メンバー削除に失敗:", err);
    return NextResponse.json({ ok: false, error: "削除に失敗しました。" }, { status: 500 });
  }
}
