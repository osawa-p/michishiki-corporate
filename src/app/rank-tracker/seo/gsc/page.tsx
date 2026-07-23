import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAccess, canViewDomain } from "@/lib/rank-tracker/auth";
import {
  getSeoSitesCached,
  getCoverageCached,
  getRotationProgressCached,
  getLatestInspectionsCached,
  getStaleUrlsCached,
  getQuerySummaryCached,
  getQueryPagesCached,
  getOpportunityQueriesCached,
  getCtrGapQueriesCached,
  getMovingQueriesCached,
  getCvQueriesCached,
} from "@/lib/seo-monitor/cached";
import GscWorkspace, { type GscData } from "@/components/seo-monitor/GscWorkspace";
import SeoSitePicker from "@/components/seo-monitor/SeoSitePicker";
import SeoPeriodPicker from "@/components/seo-monitor/SeoPeriodPicker";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "サーチコンソール",
};

export default async function GscPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; days?: string }>;
}) {
  // 許可サイト（allowed_domains）のみ閲覧可。admin は全サイト
  const access = await getAccess();
  if (!access) redirect("/rank-tracker/login");

  const { site: siteParam, days: daysParam } = await searchParams;
  const daysNum = Number(daysParam);
  const days = [7, 30, 90].includes(daysNum) ? daysNum : 30;

  let sites: Awaited<ReturnType<typeof getSeoSitesCached>> = [];
  let loadError = false;
  try {
    sites = await getSeoSitesCached();
  } catch (e) {
    console.error("[seo-monitor] サイト一覧の取得に失敗:", e);
    loadError = true;
  }

  const gscSites = sites.filter((s) => s.gsc_enabled && canViewDomain(access, s.site));
  // ?site= が無ければ最後に選んだサイト（Cookie・SeoSitePickerが書く）を既定にする。
  // タブ移動でクエリが消えても選択サイトが維持される
  const cookieSite = (await cookies()).get("seo-site")?.value;
  const selected =
    gscSites.find((s) => s.site === siteParam) ??
    gscSites.find((s) => s.site === cookieSite) ??
    gscSites[0] ??
    null;

  let data: GscData | null = null;
  if (selected) {
    try {
      const [coverage, rotation, inspections, stale, queries, queryPages, opportunity, ctrGap, moving, cvQueries] =
        await Promise.all([
          getCoverageCached(selected.site),
          getRotationProgressCached(selected.site),
          getLatestInspectionsCached(selected.site),
          getStaleUrlsCached(selected.site, selected.stale_days),
          getQuerySummaryCached(selected.site, days),
          getQueryPagesCached(selected.site, days),
          getOpportunityQueriesCached(selected.site, days),
          getCtrGapQueriesCached(selected.site, days),
          getMovingQueriesCached(selected.site),
          getCvQueriesCached(selected.site, days),
        ]);
      data = { coverage, rotation, inspections, stale, queries, queryPages, opportunity, ctrGap, moving, cvQueries };
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
                （クエリは約3日遅れの確定値・直近{days}日集計）。
              </p>
            </div>
            {selected && (
              <div className="flex flex-wrap items-center gap-4">
                <SeoPeriodPicker selected={days} />
                <SeoSitePicker sites={gscSites.map((s) => s.site)} selected={selected.site} />
              </div>
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
              {access.role === "admin" ? (
                <>
                  <p>GSC取得が有効なサイトがまだありません。</p>
                  <p className="mt-2">
                    <Link href="/rank-tracker/seo/settings" className="text-bronze-deep underline">
                      SEO設定
                    </Link>
                    でサイトを登録し、GSC取得を有効にしてください（サービスアカウントを Search Console
                    プロパティに追加しておく必要があります）。
                  </p>
                </>
              ) : (
                <p>閲覧できるサイトがありません。対象サイトの追加は管理者にご相談ください。</p>
              )}
            </div>
          ) : (
            <GscWorkspace site={selected.site} staleDays={selected.stale_days} days={days} data={data!} />
          )}
        </div>
      </section>
    </>
  );
}
