import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { TrackedKeyword, TrackedDomain } from "@/lib/rank-tracker/bigquery";
import { getTrackedKeywordsCached, getTrackedDomainsCached } from "@/lib/rank-tracker/cached";
import { getAccess, canAccessKeywords } from "@/lib/rank-tracker/auth";
import { DEFAULT_TARGET_DOMAIN } from "@/lib/rank-tracker/keywords";
import KeywordManager from "@/components/rank-tracker/KeywordManager";

// SSRごとに実行するが、データ読み取りはタグ付きキャッシュ（更新時に即無効化）
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "キーワード管理",
};

export default async function KeywordsPage() {
  // 管理者=全サイト編集 / 編集=許可サイトのみ編集 / 閲覧+一覧=読み取り / 閲覧のみ=不可
  const access = await getAccess();
  if (!access) redirect("/rank-tracker/login");
  if (!canAccessKeywords(access)) redirect("/rank-tracker/dashboard");
  const mode =
    access.role === "admin" ? "admin" : access.role === "editor" ? "editor" : "readonly";

  let initial: TrackedKeyword[] = [];
  let domains: TrackedDomain[] = [];
  let loadError = false;
  try {
    [initial, domains] = await Promise.all([
      getTrackedKeywordsCached(),
      getTrackedDomainsCached(),
    ]);
    // 管理者以外は許可サイトの分だけ
    if (access.role !== "admin") {
      initial = initial.filter((r) => access.domains.includes(r.target_domain));
      domains = domains.filter((d) => access.domains.includes(d.domain));
    }
  } catch (e) {
    console.error("[rank-tracker] 追跡キーワードの取得に失敗:", e);
    loadError = true;
  }

  return (
    <>
      <section className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">Keywords</p>
          <h1 className="font-serif text-3xl md:text-4xl font-semibold">キーワード管理</h1>
          <p className="mt-4 text-sm text-ink-soft max-w-2xl leading-relaxed">
            定期取得の対象キーワードを登録・管理します。キーワードごとに取得頻度
            （毎日〜月1）とタグを設定でき、サイトごとにダッシュボードへ集計されます。
          </p>
        </div>
      </section>

      <section className="py-10 md:py-14">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <KeywordManager
            initial={initial}
            domains={domains.map((d) => d.domain)}
            loadError={loadError}
            defaultDomain={mode === "admin" ? DEFAULT_TARGET_DOMAIN : (access.domains[0] ?? "")}
            mode={mode}
          />
        </div>
      </section>
    </>
  );
}
