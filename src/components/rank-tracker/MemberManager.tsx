"use client";

import { useState } from "react";
import type { Member, MemberRole } from "@/lib/rank-tracker/members";

type Msg = { kind: "ok" | "err"; text: string };

const API = "/api/rank-tracker/members";

export default function MemberManager({
  initial,
  knownDomains,
  selfEmail,
  loadError,
}: {
  initial: Member[];
  knownDomains: string[];
  selfEmail: string;
  loadError: boolean;
}) {
  const [members, setMembers] = useState<Member[]>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // 招待フォーム
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("viewer");
  const [domains, setDomains] = useState<string[]>([]);

  async function refresh() {
    const res = await fetch(API, { cache: "no-store" });
    const data = await res.json();
    if (data.ok) setMembers(data.items as Member[]);
  }

  function toggleDomain(d: string) {
    setDomains((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]));
  }

  async function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setInviteUrl(null);
    setCopied(false);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 管理者は全サイト閲覧のため domains を持たせない（サーバー側でも強制）
        body: JSON.stringify({ email: email.trim(), role, domains: role === "admin" ? [] : domains }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "招待の発行に失敗しました。");
      setInviteUrl(data.inviteUrl as string);
      setMsg({
        kind: "ok",
        text: "招待リンクを発行しました。コピーして相手に共有してください（有効期限7日）。",
      });
      setEmail("");
      await refresh().catch(() => {});
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "招待の発行に失敗しました。" });
    } finally {
      setBusy(false);
    }
  }

  // 招待中メンバーのリンク再発行（同じPOSTで上書き発行される）
  async function reissue(m: Member) {
    setBusy(true);
    setMsg(null);
    setInviteUrl(null);
    setCopied(false);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: m.email, role: m.role, domains: m.allowed_domains }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "再発行に失敗しました。");
      setInviteUrl(data.inviteUrl as string);
      setMsg({ kind: "ok", text: `${m.email} の招待リンクを再発行しました（有効期限7日）。` });
      await refresh().catch(() => {});
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "再発行に失敗しました。" });
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: Member) {
    if (!window.confirm(`${m.email} を削除しますか？（以後ログインできなくなります）`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(API, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: m.email }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "削除に失敗しました。");
      setMembers((ms) => ms.filter((x) => x.email !== m.email));
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "削除に失敗しました。" });
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
    } catch {
      // クリップボード不可の環境では手動コピーしてもらう
    }
  }

  const inputCls =
    "w-full px-4 py-3 bg-white border border-line text-sm focus:outline-none focus:border-bronze";
  const labelCls = "block text-sm font-semibold text-ink mb-2";

  return (
    <div className="space-y-10">
      {/* 招待フォーム */}
      <form onSubmit={invite} className="bg-white border border-line p-6 space-y-5">
        <h2 className="font-serif text-lg font-semibold">メンバーを招待</h2>
        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <div>
            <label htmlFor="inv-email" className={labelCls}>
              メールアドレス <span className="text-bronze-deep">*</span>
            </label>
            <input
              id="inv-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@example.com"
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="inv-role" className={labelCls}>
              権限
            </label>
            <select
              id="inv-role"
              value={role}
              onChange={(e) => setRole(e.target.value as MemberRole)}
              className={inputCls}
            >
              <option value="viewer">閲覧のみ</option>
              <option value="admin">管理者</option>
            </select>
          </div>
        </div>

        {role === "viewer" && (
          <div>
            <span className={labelCls}>閲覧できるサイト（1つ以上）</span>
            {knownDomains.length === 0 ? (
              <p className="text-xs text-ink-faint">
                追跡サイトがまだありません。先にキーワードを登録してください。
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {knownDomains.map((d) => {
                  const on = domains.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleDomain(d)}
                      className={`px-3 py-1.5 text-xs border transition-colors ${
                        on
                          ? "bg-ink text-paper border-ink"
                          : "bg-white border-line text-ink-soft hover:text-bronze-deep hover:border-bronze"
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || (role === "viewer" && domains.length === 0)}
          className="px-6 py-3 bg-ink text-paper text-sm font-semibold hover:bg-bronze-deep transition-colors disabled:opacity-60"
        >
          招待リンクを発行
        </button>

        {msg && (
          <div
            role={msg.kind === "err" ? "alert" : "status"}
            className={`px-4 py-3 text-sm border ${
              msg.kind === "ok"
                ? "bg-bronze/10 border-bronze/30 text-bronze-deep"
                : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            {msg.text}
          </div>
        )}
        {inviteUrl && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border border-line bg-paper">
            <code className="text-xs break-all flex-1 min-w-[16rem]">{inviteUrl}</code>
            <button
              type="button"
              onClick={copyInvite}
              className="px-4 py-2 text-xs bg-white border border-line text-bronze-deep hover:border-bronze"
            >
              {copied ? "コピーしました ✓" : "コピー"}
            </button>
          </div>
        )}
      </form>

      {/* メンバー一覧 */}
      <div>
        <h2 className="font-serif text-xl font-semibold mb-4">
          メンバー <span className="text-ink-faint text-sm font-sans">（{members.length}名）</span>
        </h2>
        {loadError ? (
          <p className="text-sm text-ink-faint">メンバー一覧の取得に失敗しました。</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-ink-faint">まだメンバーがいません。上のフォームから招待してください。</p>
        ) : (
          <div className="border border-line divide-y divide-line">
            {members.map((m) => (
              <div key={m.email} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 bg-white">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink break-all">
                    {m.email}
                    {m.email === selfEmail && (
                      <span className="ml-2 text-[10px] text-ink-faint">（自分）</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <span
                      className={`px-2 py-0.5 text-[10px] leading-4 border ${
                        m.role === "admin"
                          ? "border-bronze/45 text-bronze-deep bg-bronze/10"
                          : "border-line text-ink-soft bg-white"
                      }`}
                    >
                      {m.role === "admin" ? "管理者" : "閲覧のみ"}
                    </span>
                    {m.role === "viewer" &&
                      m.allowed_domains.map((d) => (
                        <span
                          key={d}
                          className="px-1.5 text-[10px] leading-4 border border-bronze/30 text-bronze-deep bg-white"
                        >
                          {d}
                        </span>
                      ))}
                  </div>
                </div>

                <div className="text-xs text-right">
                  {m.status === "active" ? (
                    <span className="text-green-800">有効</span>
                  ) : m.invite_valid ? (
                    <span className="text-ink-faint">招待中（リンク未使用）</span>
                  ) : (
                    <span className="text-red-700">招待期限切れ</span>
                  )}
                  <div className="text-[10px] text-ink-faint mt-0.5">
                    {m.status === "active" && m.last_login_at
                      ? `最終ログイン ${m.last_login_at}`
                      : `登録 ${m.created_at}`}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {m.status === "invited" && (
                    <button
                      type="button"
                      onClick={() => reissue(m)}
                      disabled={busy}
                      className="text-xs text-bronze-deep hover:underline disabled:opacity-60"
                    >
                      リンク再発行
                    </button>
                  )}
                  {m.email !== selfEmail && (
                    <button
                      type="button"
                      onClick={() => remove(m)}
                      disabled={busy}
                      className="text-xs text-ink-faint hover:text-red-600 transition-colors disabled:opacity-60"
                    >
                      削除
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
