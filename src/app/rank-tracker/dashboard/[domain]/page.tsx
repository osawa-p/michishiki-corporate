import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { LatestRank, TrackedKeyword, KeywordTrendRow } from "@/lib/rank-tracker/bigquery";
import {
  getLatestRanksCached,
  getTrackedKeywordsCached,
  getRecentTrendsCached,
} from "@/lib/rank-tracker/cached";
import DashboardWorkspace from "@/components/rank-tracker/DashboardWorkspace";

// SSRごとに実行するが、データ読み取りはタグ付きキャッシュ（計測・更新時に即無効化）
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ domain: string }> };

// 不正なパーセントエンコーディング（例: %zz）で decodeURIComponent が投げると
// 500 になるため、失敗時は null を返して 404 に落とす
function safeDecode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain } = await params;
  return { title: `${safeDecode(domain) ?? domain} ダッシュボード` };
}

export default async function DomainDashboardPage({ params }: Props) {
  const { domain: raw } = await params;
  const domain = safeDecode(raw);
  if (domain === null) notFound();

  let latest: LatestRank[] = [];
  let tracked: TrackedKeyword[] = [];
  let trends: KeywordTrendRow[] = [];
  let loadError = false;
  try {
    [latest, tracked, trends] = await Promise.all([
      getLatestRanksCached(domain),
      getTrackedKeywordsCached(domain),
      getRecentTrendsCached(domain),
    ]);
  } catch (e) {
    console.error("[rank-tracker] サイト別ダッシュボードの取得に失敗:", e);
    loadError = true;
  }

  return (
    <>
      <section className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
          <Link
            href="/rank-tracker/dashboard"
            className="text-xs text-ink-faint hover:text-bronze-deep transition-colors"
          >
            ← サイト一覧
          </Link>
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mt-3 mb-2">Dashboard</p>
          <h1 className="font-serif text-2xl md:text-3xl font-semibold break-all">{domain}</h1>
        </div>
      </section>

      <section className="py-8 md:py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* useSearchParams を使うクライアント側の状態復元のため Suspense で包む */}
          <Suspense
            fallback={<p className="text-sm text-ink-faint animate-pulse">読み込み中…</p>}
          >
            <DashboardWorkspace
              domain={domain}
              tracked={tracked}
              latest={latest}
              trends={trends}
              loadError={loadError}
            />
          </Suspense>
        </div>
      </section>
    </>
  );
}
