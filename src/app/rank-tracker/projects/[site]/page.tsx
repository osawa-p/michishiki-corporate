import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess, canViewDomain } from "@/lib/rank-tracker/auth";
import { projectSiteBySlug } from "@/lib/rank-tracker/projects";
import ClientWbsBoard, { type ClientWbsData } from "@/components/rank-tracker/ClientWbsBoard";

// クライアント向け「施策WBS」本体。データは michi 側の wbs-client-publish.mjs が生成する
// src/data/wbs-client/<slug>.json（公開用に整形済み。内部メモは含まない）。
// JSON は server component でのみ読み込み、認証後に props で渡す（クライアントチャンクへ混入させない）。
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "施策WBS",
};

// slug → 公開JSON。新しいサイトを増やすときは projects.ts と併せてここに追加する
const DATA: Record<string, () => Promise<ClientWbsData>> = {
  rasik: () => import("@/data/wbs-client/rasik.json").then((m) => m.default as unknown as ClientWbsData),
};

export default async function ProjectSitePage({ params }: { params: Promise<{ site: string }> }) {
  const access = await getAccess();
  if (!access) redirect("/rank-tracker/login");

  // slug不明と権限なしを区別しない（他クライアントの存在をURL探索で推測させない）
  const { site: slug } = await params;
  const site = projectSiteBySlug(slug);
  const load = DATA[slug];
  if (!site || !load || !canViewDomain(access, site.domain)) redirect("/rank-tracker/projects");

  // 読み込み失敗（同期直後の欠損など）は空画面ではなく案内を出す
  let data: ClientWbsData;
  try {
    data = await load();
  } catch (err) {
    console.error("[rank-tracker] 施策WBSデータの読み込みに失敗しました:", err);
    return (
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="font-serif text-2xl font-semibold">{site.label} SEO施策WBS</h1>
        <p className="mt-4 rounded-xl border border-dashed border-line px-5 py-6 text-sm text-ink-faint">
          データを読み込めませんでした。しばらくしてから再度お開きください。続く場合は大沢までご連絡ください。
        </p>
      </section>
    );
  }
  return <ClientWbsBoard data={data} />;
}
