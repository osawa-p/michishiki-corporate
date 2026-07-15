import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/rank-tracker/auth";
import LoginForm from "@/components/rank-tracker/LoginForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ログイン",
};

export default async function LoginPage() {
  // ログイン済みならダッシュボードへ
  const access = await getAccess();
  if (access) redirect("/rank-tracker/dashboard");

  return (
    <section className="py-16 md:py-24">
      <div className="max-w-md mx-auto px-4 sm:px-6">
        <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4 text-center">
          Rank Tracker
        </p>
        <h1 className="font-serif text-2xl md:text-3xl font-semibold text-center">ログイン</h1>
        <p className="mt-3 mb-8 text-sm text-ink-soft text-center">
          招待されたメールアドレスとパスワードでログインしてください。
        </p>
        {/* useSearchParams（next パラメータ）利用のため Suspense で包む */}
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </section>
  );
}
