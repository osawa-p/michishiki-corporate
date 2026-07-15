"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function InviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password.length < 8) {
      setError("パスワードは8文字以上にしてください。");
      return;
    }
    if (password !== confirm) {
      setError("確認用パスワードが一致しません。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/rank-tracker/auth/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "処理に失敗しました。");
      // 受諾と同時にログイン済みになる
      router.push("/rank-tracker/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "処理に失敗しました。");
      setBusy(false);
    }
  }

  const inputCls =
    "w-full px-4 py-3 bg-white border border-line text-sm focus:outline-none focus:border-bronze";

  return (
    <form onSubmit={submit} className="space-y-5 bg-white border border-line p-6 md:p-8">
      <div>
        <label htmlFor="pw" className="block text-sm font-semibold text-ink mb-2">
          新しいパスワード（8文字以上）
        </label>
        <input
          id="pw"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor="pw2" className="block text-sm font-semibold text-ink mb-2">
          パスワード（確認）
        </label>
        <input
          id="pw2"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputCls}
        />
      </div>
      {error && (
        <p role="alert" className="px-4 py-3 text-sm bg-red-50 border border-red-200 text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="w-full py-3 bg-ink text-paper text-sm font-semibold hover:bg-bronze-deep transition-colors disabled:opacity-60"
      >
        {busy ? "設定中…" : "設定してログイン"}
      </button>
    </form>
  );
}
