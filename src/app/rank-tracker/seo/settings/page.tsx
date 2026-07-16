import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/rank-tracker/auth";
import { getSeoSitesCached } from "@/lib/seo-monitor/cached";
import SeoSitesManager from "@/components/seo-monitor/SeoSitesManager";
import type { SeoSite } from "@/lib/seo-monitor/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SEO観測 設定",
};

export default async function SeoSettingsPage() {
  const access = await getAccess();
  if (!access) redirect("/rank-tracker/login");
  if (access.role !== "admin") redirect("/rank-tracker/dashboard");

  let initial: SeoSite[] = [];
  let loadError = false;
  try {
    initial = await getSeoSitesCached();
  } catch (e) {
    console.error("[seo-monitor] SEO設定の取得に失敗:", e);
    loadError = true;
  }

  return (
    <>
      <section className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">SEO Monitor Settings</p>
          <h1 className="font-serif text-3xl md:text-4xl font-semibold">SEO観測の対象サイト</h1>
          <p className="mt-4 text-sm text-ink-soft max-w-2xl leading-relaxed">
            サイトごとにサーチコンソール取得・GA4取得のON/OFFと接続情報を設定します。
            GSC系の取得ができないサイト（クライアント要件）はGSCをOFFにすると、GA4のみの表示になります。
            取得は毎朝の自動実行（cron）で行われます。
          </p>
        </div>
      </section>

      <section className="py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <SeoSitesManager initial={initial} loadError={loadError} />
        </div>
      </section>
    </>
  );
}
