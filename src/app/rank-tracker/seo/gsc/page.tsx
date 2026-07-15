import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/rank-tracker/auth";
import {
  getSeoSitesCached,
  getCoverageCached,
  getRotationProgressCached,
  getLatestInspectionsCached,
  getStaleUrlsCached,
  getQuerySummaryCached,
  getQueryPagesCached,
} from "@/lib/seo-monitor/cached";
import GscWorkspace, { type GscData } from "@/components/seo-monitor/GscWorkspace";
import SeoSitePicker from "@/components/seo-monitor/SeoSitePicker";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "サーチコンソール",
};

const QUERY_DAYS = 28;

export default async function GscPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
  // SEO観測はPhase 1では運用者（管理者）専用
  const access = await getAccess();
  if (!access) redirect("/rank-tracker/login");
  if (access.role !== "admin") redirect("/rank-tracker/dashboard");

  const { site: siteParam } = await searchParams;

  let sites: Awaited<ReturnType<typeof getSeoSitesCached>> = [];
  let loadError = false;
  try {
    sites = await getSeoSitesCached();
  } catch (e) {
    console.error("[seo-monitor] サイト一覧の取得に失敗:", e);
    loadError = true;
  }

  const gscSites = sites.filter((s) => s.gsc_enabled);
  const selected = gscSites.find((s) => s.site === siteParam) ?? gscSites[0] ?? null;

  let data: GscData | null = null;
  if (selected) {
    try {
      const [coverage, rotation, inspections, stale, queries, queryPages] = await Promise.all([
        getCoverageCached(selected.site),
        getRotationProgressCached(selected.site),
        getLatestInspectionsCached(selected.site),
        getStaleUrlsCached(selected.site, selected.stale_days),
        getQuerySummaryCached(selected.site, QUERY_DAYS),
        getQueryPagesCached(selected.site, QUERY_DAYS),
      ]);
      data = { coverage, rotation, inspections, stale, queries, queryPages };
    } catch (e) {
      console.error("[seo-monitor] GSCデータの取得に失敗:", e);
      loadError = true;
    }
  }

  return (
    <>
      <section className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">Search Console</p>
              <h1 className="font-serif text-3xl md:text-4xl font-semibold">サーチコンソール</h1>
              <p className="mt-4 text-sm text-ink-soft max-w-2xl leading-relaxed">
                カバレッジ・URL検査ローテーション・クエリ分析。データは毎朝の自動取得で更新されます
                （クエリは約3日遅れの確定値・直近{QUERY_DAYS}日集計）。
              </p>
            </div>
            {selected && (
              <SeoSitePicker sites={gscSites.map((s) => s.site)} selected={selected.site} />
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
          ) : !selected ? (
            <div className="border border-line bg-white p-8 text-sm text-ink-soft leading-relaxed">
              <p>GSC取得が有効なサイトがまだありません。</p>
              <p className="mt-2">
                <Link href="/rank-tracker/seo/settings" className="text-bronze-deep underline">
                  SEO設定
                </Link>
                でサイトを登録し、GSC取得を有効にしてください（サービスアカウントを Search Console
                プロパティに追加しておく必要があります）。
              </p>
            </div>
          ) : (
            <GscWorkspace site={selected.site} staleDays={selected.stale_days} data={data!} />
          )}
        </div>
      </section>
    </>
  );
}
