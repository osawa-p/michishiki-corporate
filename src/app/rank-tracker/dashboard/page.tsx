import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { TrackedDomain } from "@/lib/rank-tracker/bigquery";
import { getTrackedDomainsCached } from "@/lib/rank-tracker/cached";
import { getAccess, canViewDomain } from "@/lib/rank-tracker/auth";

// SSRごとに実行するが、データ読み取りはタグ付きキャッシュ（更新時に即無効化）
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ダッシュボード",
};

export default async function DashboardIndexPage() {
  const access = await getAccess();
  if (!access) redirect("/rank-tracker/login");

  let domains: TrackedDomain[] = [];
  let loadError = false;
  try {
    // 閲覧のみメンバーには許可されたサイトのカードだけを見せる
    domains = (await getTrackedDomainsCached()).filter((d) => canViewDomain(access, d.domain));
  } catch (e) {
    console.error("[rank-tracker] サイト一覧の取得に失敗:", e);
    loadError = true;
  }

  return (
    <>
      <section className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">Dashboard</p>
          <h1 className="font-serif text-3xl md:text-4xl font-semibold">サイト別ダッシュボード</h1>
          <p className="mt-4 text-sm text-ink-soft max-w-2xl leading-relaxed">
            追跡サイトを選ぶと、登録キーワードの最新順位・推移・競合比較を確認できます。
          </p>
        </div>
      </section>

      <section className="py-10 md:py-14">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          {loadError ? (
            <p className="text-sm text-ink-faint">
              サイト一覧の取得に失敗しました。BigQueryの設定・権限を確認してください。
            </p>
          ) : domains.length === 0 ? (
            <p className="text-sm text-ink-faint">
              まだ追跡サイトがありません。
              <Link
                href="/rank-tracker/keywords"
                className="text-bronze-deep underline underline-offset-2 ml-1"
              >
                キーワード管理
              </Link>
              からキーワードを登録してください。
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {domains.map((d) => (
                <Link
                  key={d.domain}
                  href={`/rank-tracker/dashboard/${encodeURIComponent(d.domain)}`}
                  className="group block border border-line bg-white p-6 hover:border-bronze transition-colors"
                >
                  <div className="font-serif text-lg font-semibold text-ink group-hover:text-bronze-deep transition-colors break-all">
                    {d.domain}
                  </div>
                  <div className="mt-3 flex items-baseline gap-4 text-sm text-ink-soft">
                    <span>
                      登録 <span className="font-semibold text-ink">{d.total}</span> 件
                    </span>
                    <span>
                      定期取得中 <span className="font-semibold text-bronze-deep">{d.active}</span> 件
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
