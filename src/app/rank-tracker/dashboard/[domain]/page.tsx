import type { Metadata } from "next";
import Link from "next/link";
import { fetchLatestRanks, type LatestRank } from "@/lib/rank-tracker/bigquery";
import DashboardView from "@/components/rank-tracker/DashboardView";

// 常に最新の順位をBigQueryから取得する
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ domain: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain } = await params;
  return { title: `${decodeURIComponent(domain)} ダッシュボード` };
}

export default async function DomainDashboardPage({ params }: Props) {
  const { domain: raw } = await params;
  const domain = decodeURIComponent(raw);

  let latest: LatestRank[] = [];
  let loadError = false;
  try {
    latest = await fetchLatestRanks(domain, { onlyTracked: true });
  } catch (e) {
    console.error("[rank-tracker] サイト別最新順位の取得に失敗:", e);
    loadError = true;
  }

  return (
    <>
      <section className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
          <Link
            href="/rank-tracker/dashboard"
            className="text-xs text-ink-faint hover:text-bronze-deep transition-colors"
          >
            ← サイト一覧
          </Link>
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mt-4 mb-2">Dashboard</p>
          <h1 className="font-serif text-2xl md:text-3xl font-semibold break-all">{domain}</h1>
          <p className="mt-3 text-sm text-ink-soft">
            登録キーワードの最新順位。カードを選ぶと順位の推移を表示します。
          </p>
        </div>
      </section>

      <section className="py-10 md:py-14">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <DashboardView domain={domain} latest={latest} loadError={loadError} />
        </div>
      </section>
    </>
  );
}
