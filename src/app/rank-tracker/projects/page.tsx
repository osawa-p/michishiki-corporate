import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAccess, canViewDomain } from "@/lib/rank-tracker/auth";
import { PROJECT_SITES } from "@/lib/rank-tracker/projects";

// クライアント向け「施策WBS」の一覧。施策の進捗・判断理由・工数などクライアント固有の
// 情報を含むため、サイトごとに閲覧権限（ACL）を持つメンバー限定（admin は常に可）。
// 権限のないサイトは名称・存在自体を表示しない（クライアント名の相互漏えい防止）。
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "施策WBS",
};

export default async function ProjectsPage() {
  const access = await getAccess();
  if (!access) redirect("/rank-tracker/login");

  const sites = PROJECT_SITES.filter((s) => canViewDomain(access, s.domain));
  if (sites.length === 0) redirect("/rank-tracker/dashboard");
  // 閲覧できるサイトが1つだけなら一覧を挟まず直接開く
  if (sites.length === 1) redirect(`/rank-tracker/projects/${sites[0].slug}`);

  return (
    <>
      <section className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">Projects</p>
          <h1 className="font-serif text-3xl md:text-4xl font-semibold">施策WBS</h1>
          <p className="mt-4 text-sm text-ink-soft max-w-2xl leading-relaxed">
            SEO施策の進捗・待ち・完了と効果をまとめた進行表です。サイトを選ぶと開きます。
          </p>
        </div>
      </section>
      <section className="py-10 md:py-14">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sites.map((site) => (
              <li key={site.slug}>
                <Link
                  href={`/rank-tracker/projects/${site.slug}`}
                  className="group flex items-center justify-between rounded-xl border border-line bg-white px-5 py-4 transition hover:border-bronze hover:shadow-sm"
                >
                  <span>
                    <span className="block font-medium">{site.label}</span>
                    <span className="mt-0.5 block text-xs text-ink-faint">{site.description}</span>
                  </span>
                  <span className="text-sm text-ink-faint transition group-hover:text-bronze-deep">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
