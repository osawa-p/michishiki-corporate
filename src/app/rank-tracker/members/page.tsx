import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/rank-tracker/auth";
import { listMembers, type Member } from "@/lib/rank-tracker/members";
import { getTrackedDomainsCached } from "@/lib/rank-tracker/cached";
import MemberManager from "@/components/rank-tracker/MemberManager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "メンバー管理",
};

export default async function MembersPage() {
  // メンバー管理は管理者のみ
  const access = await getAccess();
  if (!access) redirect("/rank-tracker/login");
  if (access.role !== "admin") redirect("/rank-tracker/dashboard");

  let initial: Member[] = [];
  let domains: string[] = [];
  let loadError = false;
  try {
    const [members, tracked] = await Promise.all([listMembers(), getTrackedDomainsCached()]);
    initial = members;
    domains = tracked.map((d) => d.domain);
  } catch (e) {
    console.error("[rank-tracker] メンバー一覧の取得に失敗:", e);
    loadError = true;
  }

  return (
    <>
      <section className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">Members</p>
          <h1 className="font-serif text-3xl md:text-4xl font-semibold">メンバー管理</h1>
          <p className="mt-4 text-sm text-ink-soft max-w-2xl leading-relaxed">
            ツールにログインできるメンバーを管理します。招待リンクを発行して共有すると、
            相手がパスワードを設定した時点で有効になります。閲覧のみメンバーは
            許可されたサイトのダッシュボードだけを見られます。
          </p>
        </div>
      </section>

      <section className="py-10 md:py-14">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <MemberManager
            initial={initial}
            knownDomains={domains}
            selfEmail={access.email}
            loadError={loadError}
          />
        </div>
      </section>
    </>
  );
}
