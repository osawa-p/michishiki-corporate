import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/rank-tracker/auth";
import { getProposalsCached, getSeoSitesCached } from "@/lib/seo-monitor/cached";
import ProposalsBoard from "@/components/seo-monitor/ProposalsBoard";
import SeoSitePicker from "@/components/seo-monitor/SeoSitePicker";
import type { SeoProposal } from "@/lib/seo-monitor/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI提案",
};

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
  const access = await getAccess();
  if (!access) redirect("/rank-tracker/login");
  if (access.role !== "admin") redirect("/rank-tracker/dashboard");

  const { site: siteParam } = await searchParams;

  let siteNames: string[] = [];
  let items: SeoProposal[] = [];
  let loadError = false;
  try {
    const sites = await getSeoSitesCached();
    siteNames = sites.map((s) => s.site);
    const selected = siteNames.includes(siteParam ?? "") ? siteParam : undefined;
    items = await getProposalsCached(selected);
  } catch (e) {
    console.error("[seo-monitor] 提案の取得に失敗:", e);
    loadError = true;
  }

  return (
    <>
      <section className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">AI Proposals</p>
              <h1 className="font-serif text-3xl md:text-4xl font-semibold">週次AI提案</h1>
              <p className="mt-4 text-sm text-ink-soft max-w-2xl leading-relaxed">
                サーチコンソール＋GA4のデータから週1回生成されるSEO提案・ユーザビリティ提案。
                各提案の対応（実装する／しない／一部対応）とメモはここに記録し、ログとして蓄積されます。
              </p>
            </div>
            {siteNames.length > 0 && (
              <SeoSitePicker
                sites={siteNames}
                selected={siteNames.includes(siteParam ?? "") ? siteParam! : siteNames[0]}
              />
            )}
          </div>
        </div>
      </section>

      <section className="py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {loadError ? (
            <p className="text-sm text-red-700">
              データの取得に失敗しました。時間をおいて再読み込みしてください。
            </p>
          ) : items.length === 0 ? (
            <div className="border border-line bg-white p-8 text-sm text-ink-soft leading-relaxed">
              <p className="font-semibold text-ink mb-2">まだ提案がありません</p>
              <p>
                週次の自動生成（Phase 2で有効化）が動き始めると、ここに毎週の提案が蓄積されます。
                生成にはGSC・GA4のデータが数週間分たまっている必要があります。
              </p>
            </div>
          ) : (
            <ProposalsBoard initial={items} />
          )}
        </div>
      </section>
    </>
  );
}
