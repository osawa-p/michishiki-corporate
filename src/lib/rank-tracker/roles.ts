// メンバー権限の定義。サーバー/クライアント両方から参照する（依存なし）。
//
// admin      管理者: 全サイト・全機能（キーワード管理/計測/メンバー/サイト設定）
// editor     編集: 許可サイトのダッシュボード＋キーワード管理（サイト制限の範囲内）
// viewer_kw  閲覧＋キーワード一覧: 許可サイトのダッシュボード＋キーワード一覧（読み取りのみ）
// viewer     閲覧のみ: 許可サイトのダッシュボードだけ

export type MemberRole = "admin" | "editor" | "viewer_kw" | "viewer";

const ROLES: MemberRole[] = ["admin", "editor", "viewer_kw", "viewer"];

export function isMemberRole(v: unknown): v is MemberRole {
  return typeof v === "string" && (ROLES as string[]).includes(v);
}

export const ROLE_LABELS: Record<MemberRole, string> = {
  admin: "管理者",
  editor: "編集",
  viewer_kw: "閲覧＋キーワード一覧",
  viewer: "閲覧のみ",
};

// キーワード管理ページを開ける（editor=編集可 / viewer_kw=読み取りのみ）
export function canSeeKeywords(role: MemberRole): boolean {
  return role === "admin" || role === "editor" || role === "viewer_kw";
}

// キーワードの登録・変更・削除ができる（対象ドメインのACLは呼び出し側で確認）
export function canEditKeywords(role: MemberRole): boolean {
  return role === "admin" || role === "editor";
}
