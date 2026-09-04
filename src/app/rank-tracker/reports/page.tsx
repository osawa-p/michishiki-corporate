import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { promises as fs } from "fs";
import path from "path";
import Link from "next/link";
import { getAccess, canViewDomain } from "@/lib/rank-tracker/auth";
import { REPORT_SITES, type ReportSite } from "@/lib/rank-tracker/reports";

// 月次レポートの一覧。クライアント売上等の機微情報を含むため、
// サイトごとに閲覧権限（ACL）を持つメンバー限定（admin は常に可）。
// 権限のないサイトは名称・存在自体を表示しない（クライアント名の相互漏えい防止）。
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "月次レポート",
};

const REPORTS_ROOT = path.join(process.cwd(), "src", "data", "reports");

async function listMonths(slug: string): Promise<string[]> {
  try {
    const files = await fs.readdir(path.join(REPORTS_ROOT, slug));
    return files
      .filter((f) => /^\d{6}\.html$/.test(f))
      .map((f) => f.slice(0, 6))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

function monthLabel(yyyymm: string): string {
  return `${yyyymm.slice(0, 4)}年${Number(yyyymm.slice(4))}月`;
}

type Section = { site: ReportSite; months: string[] };

export default async function ReportsPage() {
  const access = await getAccess();
  if (!access) redirect("/rank-tracker/login");

  // 閲覧権限のあるレポートサイトだけを列挙する
  const sites = REPORT_SITES.filter((s) => canViewDomain(access, s.domain));
  if (sites.length === 0) redirect("/rank-tracker/dashboard");

  const sections: Section[] = await Promise.all(
    sites.map(async (site) => ({ site, months: await listMonths(site.slug) })),
  );

  return (
    <>
      <section className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">Monthly Reports</p>
          <h1 className="font-serif text-3xl md:text-4xl font-semibold">月次レポート</h1>
          <p className="mt-4 text-sm text-ink-soft max-w-2xl leading-relaxed">
            オーガニック流入の月次実績レポートです。月を選ぶとレポートが開きます。
          </p>
        </div>
      </section>

      <section className="py-10 md:py-14">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          {sections.map(({ site, months }) => (
            <div key={site.slug}>
              <div className="flex items-baseline gap-3 flex-wrap">
                <h2 className="font-serif text-xl font-semibold">{site.label}</h2>
                <span className="text-xs text-ink-faint">{site.description}</span>
              </div>

              {months.length === 0 ? (
                <p className="mt-4 rounded-xl border border-dashed border-line px-5 py-6 text-sm text-ink-faint">
                  公開準備中です。公開され次第、ここに表示されます。
                </p>
              ) : (
                <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {months.map((m, i) => (
                    <li key={m}>
                      <Link
                        href={`/rank-tracker/reports/${site.slug}/${m}`}
                        className="group flex items-center justify-between rounded-xl border border-line bg-white px-5 py-4 transition hover:border-bronze hover:shadow-sm"
                      >
                        <span>
                          <span className="block font-medium">{monthLabel(m)}</span>
                          <span className="mt-0.5 block text-xs text-ink-faint">
                            オーガニックレポート
                          </span>
                        </span>
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          {i === 0 && (
                            <span className="rounded-full bg-bronze/10 px-2 py-0.5 text-[11px] font-semibold text-bronze-deep">
                              最新
                            </span>
                          )}
                          <span className="text-sm text-ink-faint transition group-hover:text-bronze-deep">
                            →
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
