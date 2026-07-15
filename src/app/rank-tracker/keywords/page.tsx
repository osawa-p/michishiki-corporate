import type { Metadata } from "next";
import { listTrackedKeywords, type TrackedKeyword } from "@/lib/rank-tracker/bigquery";
import { DEFAULT_TARGET_DOMAIN } from "@/lib/rank-tracker/keywords";
import KeywordManager from "@/components/rank-tracker/KeywordManager";

// 常に最新の設定をBigQueryから取得する
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "キーワード管理",
};

export default async function KeywordsPage() {
  let initial: TrackedKeyword[] = [];
  let loadError = false;
  try {
    initial = await listTrackedKeywords();
  } catch (e) {
    console.error("[rank-tracker] 追跡キーワードの取得に失敗:", e);
    loadError = true;
  }

  return (
    <>
      <section className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">Keywords</p>
          <h1 className="font-serif text-3xl md:text-4xl font-semibold">キーワード管理</h1>
          <p className="mt-4 text-sm text-ink-soft max-w-2xl leading-relaxed">
            定期取得（週1回）の対象キーワードを登録・管理します。ONにしたキーワードだけが自動計測され、
            サイトごとにダッシュボードへ集計されます。
          </p>
        </div>
      </section>

      <section className="py-10 md:py-14">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <KeywordManager
            initial={initial}
            loadError={loadError}
            defaultDomain={DEFAULT_TARGET_DOMAIN}
          />
        </div>
      </section>
    </>
  );
}
