"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // オープンリダイレクト防止: 戻り先はツール配下のパスのみ許可
  const rawNext = sp.get("next") ?? "";
  const next = rawNext.startsWith("/rank-tracker") ? rawNext : "/rank-tracker/dashboard";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/rank-tracker/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "ログインに失敗しました。");
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ログインに失敗しました。");
      setBusy(false);
    }
  }

  const inputCls =
    "w-full px-4 py-3 bg-white border border-line text-sm focus:outline-none focus:border-bronze";

  return (
    <form onSubmit={submit} className="space-y-5 bg-white border border-line p-6 md:p-8">
      <div>
        <label htmlFor="email" className="block text-sm font-semibold text-ink mb-2">
          メールアドレス
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-semibold text-ink mb-2">
          パスワード
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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
        {busy ? "ログイン中…" : "ログイン"}
      </button>
    </form>
  );
}
