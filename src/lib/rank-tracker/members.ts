// メンバー管理（BigQuery rank_tracking.members）。
// ログインユーザーの永続化・招待・パスワード検証を担う。行数は極小・低頻度なので
// tracked_keywords と同じく DML のみで運用する。
// パスワードは scrypt ハッシュのみ保存（平文・可逆値は持たない）。
import crypto from "crypto";
import { runQuery } from "./bigquery";
import { targetKey } from "./domain";

const GCP_PROJECT = process.env.GCP_PROJECT ?? "tidal-fusion-439015-e8";
const BQ_DATASET = process.env.BQ_DATASET ?? "rank_tracking";
const BQ_MEMBERS_TABLE = process.env.BQ_MEMBERS_TABLE ?? "members";
const MEMBERS_FQN = `\`${GCP_PROJECT}.${BQ_DATASET}.${BQ_MEMBERS_TABLE}\``;

const INVITE_TTL_DAYS = 7;

export type { MemberRole } from "./roles";
export { isMemberRole } from "./roles";
import type { MemberRole } from "./roles";

export type MemberStatus = "invited" | "active";

// 一覧表示用（ハッシュ類は含めない）
export type Member = {
  email: string;
  role: MemberRole;
  allowed_domains: string[];
  status: MemberStatus;
  invite_valid: boolean; // 招待中かつ期限内
  created_at: string;
  last_login_at: string | null;
};

// 認証用（内部専用）
export type MemberAuth = {
  email: string;
  role: MemberRole;
  allowed_domains: string[];
  status: MemberStatus;
  password_hash: string | null;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── パスワードハッシュ（scrypt） ──

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  try {
    const calc = crypto.scryptSync(password, parts[1], 64);
    const expected = Buffer.from(parts[2], "hex");
    return calc.length === expected.length && crypto.timingSafeEqual(calc, expected);
  } catch {
    return false;
  }
}

function hashInviteToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// ── CRUD ──

export async function listMembers(): Promise<Member[]> {
  const sql = `
    SELECT
      email, role,
      IFNULL(allowed_domains, []) AS allowed_domains,
      status,
      (status = 'invited' AND invite_expires_at > CURRENT_TIMESTAMP()) AS invite_valid,
      FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', created_at, 'Asia/Tokyo') AS created_at,
      FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', last_login_at, 'Asia/Tokyo') AS last_login_at
    FROM ${MEMBERS_FQN}
    ORDER BY created_at
  `;
  const { rows } = await runQuery<Member>({ query: sql });
  return rows;
}

export async function getMemberAuth(email: string): Promise<MemberAuth | null> {
  const sql = `
    SELECT email, role, IFNULL(allowed_domains, []) AS allowed_domains, status, password_hash
    FROM ${MEMBERS_FQN}
    WHERE email = @email
    LIMIT 1
  `;
  const { rows } = await runQuery<MemberAuth>({
    query: sql,
    params: { email: normalizeEmail(email) },
  });
  return rows[0] ?? null;
}

// 招待の発行（新規）または再発行（invited のみ）。
// 生トークンは戻り値でのみ返し、DBにはSHA-256ハッシュだけを保存する。
// 既に active のメンバーには発行しない（null を返す → 呼び出し側で409）。
export async function createInvite(input: {
  email: string;
  role: MemberRole;
  domains: string[];
}): Promise<{ token: string } | null> {
  const email = normalizeEmail(input.email);
  const domains = [...new Set(input.domains.map(targetKey).filter(Boolean))].slice(0, 20);
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashInviteToken(token);

  const existing = await getMemberAuth(email);
  if (existing?.status === "active") return null;

  if (existing) {
    // 招待中 → 内容を上書きして再発行
    const sql = `
      UPDATE ${MEMBERS_FQN}
      SET role = @role, allowed_domains = @domains,
          invite_token_hash = @tokenHash,
          invite_expires_at = TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL ${INVITE_TTL_DAYS} DAY),
          updated_at = CURRENT_TIMESTAMP()
      WHERE email = @email AND status = 'invited'
    `;
    const { affected } = await runQuery({
      query: sql,
      params: { email, role: input.role, domains, tokenHash },
      types: { domains: ["STRING"] },
    });
    return affected > 0 ? { token } : null;
  }

  const sql = `
    INSERT INTO ${MEMBERS_FQN}
      (email, role, allowed_domains, status, password_hash, invite_token_hash,
       invite_expires_at, created_at, updated_at, last_login_at)
    VALUES
      (@email, @role, @domains, 'invited', NULL, @tokenHash,
       TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL ${INVITE_TTL_DAYS} DAY),
       CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), NULL)
  `;
  await runQuery({
    query: sql,
    params: { email, role: input.role, domains, tokenHash },
    types: { domains: ["STRING"] },
  });
  return { token };
}

// 招待の受諾（パスワード設定 → active化）。無効・期限切れなら null。
export async function acceptInvite(
  token: string,
  password: string
): Promise<{ email: string } | null> {
  const tokenHash = hashInviteToken(token);
  const find = `
    SELECT email FROM ${MEMBERS_FQN}
    WHERE invite_token_hash = @tokenHash AND status = 'invited'
      AND invite_expires_at > CURRENT_TIMESTAMP()
    LIMIT 1
  `;
  const { rows } = await runQuery<{ email: string }>({ query: find, params: { tokenHash } });
  const email = rows[0]?.email;
  if (!email) return null;

  const update = `
    UPDATE ${MEMBERS_FQN}
    SET password_hash = @ph, status = 'active',
        invite_token_hash = NULL, invite_expires_at = NULL,
        updated_at = CURRENT_TIMESTAMP()
    WHERE email = @email AND status = 'invited'
  `;
  const { affected } = await runQuery({
    query: update,
    params: { ph: hashPassword(password), email },
  });
  return affected > 0 ? { email } : null;
}

// タイミング差によるメール列挙（実在アカウントだけ scrypt が走り遅くなる）を防ぐための
// ダミーハッシュ。モジュール初期化時に1回だけ計算する。
const DUMMY_HASH = hashPassword("timing-equalizer-dummy");

// ログイン検証。成功時はメンバー情報を返し last_login_at を更新する。
export async function verifyLogin(
  email: string,
  password: string
): Promise<{ email: string; role: MemberRole } | null> {
  const m = await getMemberAuth(email);
  if (!m || m.status !== "active" || !m.password_hash) {
    // 実在アカウントと同等の計算コストを常に消費する（結果は必ず不一致）
    verifyPassword(password, DUMMY_HASH);
    return null;
  }
  if (!verifyPassword(password, m.password_hash)) return null;

  try {
    await runQuery({
      query: `UPDATE ${MEMBERS_FQN} SET last_login_at = CURRENT_TIMESTAMP() WHERE email = @email`,
      params: { email: m.email },
    });
  } catch (err) {
    // ログイン時刻の記録失敗はログインの成否に影響させない
    console.error("[rank-tracker] last_login_at の更新に失敗:", err);
  }
  return { email: m.email, role: m.role };
}

// 権限・閲覧サイトの更新。更新行数を返す。
export async function updateMember(
  email: string,
  patch: { role?: MemberRole; domains?: string[] }
): Promise<number> {
  const sets: string[] = ["updated_at = CURRENT_TIMESTAMP()"];
  const params: Record<string, unknown> = { email: normalizeEmail(email) };
  const types: Record<string, unknown> = {};
  if (patch.role) {
    sets.push("role = @role");
    params.role = patch.role;
  }
  if (patch.domains) {
    sets.push("allowed_domains = @domains");
    params.domains = [...new Set(patch.domains.map(targetKey).filter(Boolean))].slice(0, 20);
    types.domains = ["STRING"];
  }
  const sql = `UPDATE ${MEMBERS_FQN} SET ${sets.join(", ")} WHERE email = @email`;
  const { affected } = await runQuery({ query: sql, params, types });
  return affected;
}

// 有効な管理者数（最後の管理者の削除・降格ガード用）
export async function countActiveAdmins(): Promise<number> {
  const { rows } = await runQuery<{ n: number }>({
    query: `SELECT COUNT(*) AS n FROM ${MEMBERS_FQN} WHERE role = 'admin' AND status = 'active'`,
  });
  return Number(rows[0]?.n ?? 0);
}

export async function deleteMember(email: string): Promise<number> {
  const { affected } = await runQuery({
    query: `DELETE FROM ${MEMBERS_FQN} WHERE email = @email`,
    params: { email: normalizeEmail(email) },
  });
  return affected;
}
