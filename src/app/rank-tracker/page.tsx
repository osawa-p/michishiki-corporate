import type { Metadata } from "next";
import { fetchLatestRanks, type LatestRank } from "@/lib/rank-tracker/bigquery";
import { DEFAULT_TARGET_DOMAIN } from "@/lib/rank-tracker/keywords";
import MeasureForm from "@/components/rank-tracker/MeasureForm";

// 常に最新の履歴をBigQueryから取得する
export const dynamic = "force-dynamic";

// 社内専用ツールなので検索エンジンには載せない
export const metadata: Metadata = {
  title: "順位計測ツール",
  robots: { index: false, follow: false },
};

export default async function RankTrackerPage() {
  let latest: LatestRank[] = [];
  let loadError = false;
  try {
    latest = await fetchLatestRanks(DEFAULT_TARGET_DOMAIN);
  } catch (e) {
    console.error("[rank-tracker] 初期履歴の取得に失敗:", e);
    loadError = true;
  }

  return (
    <>
      <section className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">Rank Tracker</p>
          <h1 className="font-serif text-3xl md:text-4xl font-semibold">検索順位計測ツール</h1>
          <p className="mt-4 text-sm text-ink-soft max-w-2xl leading-relaxed">
            キーワードと対象ドメインを指定して、JINA検索APIでGoogle検索結果の掲載順位を計測します。
            結果は BigQuery に蓄積され、履歴として推移を確認できます。
          </p>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div>
            <h2 className="font-serif text-xl font-semibold mb-5">その場で計測</h2>
            <MeasureForm defaultDomain={DEFAULT_TARGET_DOMAIN} />
          </div>

          <aside>
            <h2 className="font-serif text-xl font-semibold mb-5">最新の順位</h2>
            {loadError ? (
              <p className="text-sm text-ink-faint">
                履歴の取得に失敗しました。BigQueryの設定を確認してください。
              </p>
            ) : latest.length === 0 ? (
              <p className="text-sm text-ink-faint">まだ計測データがありません。</p>
            ) : (
              <div className="border border-line divide-y divide-line">
                {latest.map((row) => (
                  <div key={row.keyword} className="p-4 bg-white">
                    <div className="text-sm font-medium text-ink mb-1 line-clamp-1">{row.keyword}</div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={`font-serif text-xl font-semibold ${
                          row.rank ? "text-bronze-deep" : "text-ink-faint"
                        }`}
                      >
                        {row.rank ? `${row.rank}位` : "圏外"}
                      </span>
                      <span className="text-[11px] text-ink-faint text-right">
                        {row.total}件
                        <br />
                        {row.checked_at}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </section>
    </>
  );
}
