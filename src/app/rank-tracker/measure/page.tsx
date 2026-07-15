import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/rank-tracker/auth";
import { DEFAULT_TARGET_DOMAIN } from "@/lib/rank-tracker/keywords";
import MeasureForm from "@/components/rank-tracker/MeasureForm";

// 社内専用ツールなので検索エンジンには載せない（robots は layout で継承）
export const metadata: Metadata = {
  title: "クイック計測",
};

export default async function RankTrackerMeasurePage() {
  // 計測はJINAトークンを消費するため管理者のみ
  const access = await getAccess();
  if (!access) redirect("/rank-tracker/login");
  if (access.role !== "admin") redirect("/rank-tracker/dashboard");

  return (
    <>
      <section className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">Rank Tracker</p>
          <h1 className="font-serif text-3xl md:text-4xl font-semibold">クイック計測</h1>
          <p className="mt-4 text-sm text-ink-soft max-w-2xl leading-relaxed">
            キーワードと対象ドメインを指定して、JINA検索APIでGoogle検索結果の掲載順位を計測します。
            結果は BigQuery に蓄積され、ダッシュボードで推移を確認できます。定期取得の対象は
            「キーワード管理」から登録してください。
          </p>
        </div>
      </section>

      <section className="py-10 md:py-14">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <MeasureForm defaultDomain={DEFAULT_TARGET_DOMAIN} />
        </div>
      </section>
    </>
  );
}
