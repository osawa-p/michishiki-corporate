// セッショントークン（HMAC-SHA256 署名付き）。
// Edge middleware とNodeルートの両方から使うため Web Crypto のみで実装し、
// Node固有API（Buffer / node:crypto）には依存しない。
// 形式: base64url(JSONペイロード) + "." + base64url(HMAC)

export const SESSION_COOKIE = "rt_session";
// 7日。権限変更・削除の即時反映はサーバー側の getAccess()（BQ照合・60秒キャッシュ）が担う
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7;

export type SessionPayload = { email: string; exp: number };

const enc = new TextEncoder();

function toB64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    // BufferSource（crypto.subtle）に渡すため ArrayBuffer 背景で明示的に構築する
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  const body = toB64url(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
  return `${body}.${toB64url(mac)}`;
}

// 署名と有効期限を検証。不正なら null（理由は区別しない）。
export async function verifySessionToken(
  token: string,
  secret: string
): Promise<SessionPayload | null> {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const mac = fromB64url(token.slice(dot + 1));
  if (!mac) return null;

  const key = await hmacKey(secret);
  const ok = await crypto.subtle.verify("HMAC", key, mac, enc.encode(body));
  if (!ok) return null;

  const payloadBytes = fromB64url(body);
  if (!payloadBytes) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(payloadBytes)) as Partial<SessionPayload>;
    if (typeof p.email !== "string" || typeof p.exp !== "number") return null;
    if (p.exp * 1000 < Date.now()) return null;
    return { email: p.email, exp: p.exp };
  } catch {
    return null;
  }
}
