import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/rank-tracker/auth";
import {
  getSeoSitesCached,
  getGa4SummaryCached,
  getTrafficSeriesCached,
  getGa4ChannelsCached,
  getGa4SourceMediumCached,
  getGa4PageStatsCached,
} from "@/lib/seo-monitor/cached";
import Ga4Workspace, { type Ga4Data } from "@/components/seo-monitor/Ga4Workspace";
import SeoSitePicker from "@/components/seo-monitor/SeoSitePicker";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GA4",
};

const DAYS = 30;

export default async function Ga4Page({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
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

  const ga4Sites = sites.filter((s) => s.ga4_enabled);
  const selected = ga4Sites.find((s) => s.site === siteParam) ?? ga4Sites[0] ?? null;

  let data: Ga4Data | null = null;
  if (selected) {
    try {
      const [summary, series, channels, sourceMedium, pages] = await Promise.all([
        getGa4SummaryCached(selected.site, DAYS),
        getTrafficSeriesCached(selected.site, DAYS),
        getGa4ChannelsCached(selected.site, DAYS),
        getGa4SourceMediumCached(selected.site, DAYS),
        getGa4PageStatsCached(selected.site, DAYS),
      ]);
      data = { summary, series, channels, sourceMedium, pages };
    } catch (e) {
      console.error("[seo-monitor] GA4データの取得に失敗:", e);
      loadError = true;
    }
  }

  return (
    <>
      <section className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">GA4</p>
              <h1 className="font-serif text-3xl md:text-4xl font-semibold">GA4 アクセス解析</h1>
              <p className="mt-4 text-sm text-ink-soft max-w-2xl leading-relaxed">
                流入概況・チャネル・ソース/メディア・ランディングページ別（直近{DAYS}日・前期間比）。
                データは毎朝の自動取得で更新されます。
              </p>
            </div>
            {selected && (
              <SeoSitePicker sites={ga4Sites.map((s) => s.site)} selected={selected.site} />
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
              <p>GA4取得が有効なサイトがまだありません。</p>
              <p className="mt-2">
                <Link href="/rank-tracker/seo/settings" className="text-bronze-deep underline">
                  SEO設定
                </Link>
                でサイトを登録し、GA4プロパティIDを設定してください（サービスアカウントを GA4
                プロパティの閲覧者に追加しておく必要があります）。
              </p>
            </div>
          ) : (
            <Ga4Workspace data={data!} days={DAYS} />
          )}
        </div>
      </section>
    </>
  );
}
