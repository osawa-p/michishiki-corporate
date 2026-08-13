import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { promises as fs } from "fs";
import path from "path";
import { getAccess, canViewDomain } from "@/lib/rank-tracker/auth";

// 月次レポートの一覧。現状は RASIK のみ。クライアント売上を含むため
// rasik.style の閲覧権限（ACL）を持つメンバー限定（admin は常に可）。
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "月次レポート",
};

const REPORTS_DIR = path.join(process.cwd(), "src", "data", "reports", "rasik");

async function listMonths(): Promise<string[]> {
  try {
    const files = await fs.readdir(REPORTS_DIR);
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

export default async function ReportsPage() {
  const access = await getAccess();
  if (!access) redirect("/rank-tracker/login");
  if (!canViewDomain(access, "rasik.style")) redirect("/rank-tracker/dashboard");

  const months = await listMonths();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">月次レポート</h1>
      <p className="mt-2 text-sm text-gray-500">
        RASIK 月次オーガニックレポート（GA4実測）。月を選ぶとダッシュボードが開きます。
      </p>

      {months.length === 0 ? (
        <p className="mt-8 text-sm text-gray-500">公開中のレポートはまだありません。</p>
      ) : (
        <ul className="mt-8 divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white">
          {months.map((m) => (
            <li key={m}>
              <a
                href={`/rank-tracker/reports/rasik/${m}`}
                className="flex items-center justify-between px-5 py-4 transition hover:bg-gray-50"
              >
                <span className="font-medium">{monthLabel(m)} オーガニックレポート</span>
                <span className="text-sm text-gray-400">開く →</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
