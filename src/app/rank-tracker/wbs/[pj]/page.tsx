import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { canViewDomain, getAccess } from "@/lib/rank-tracker/auth";
import { WBS_SHARED_PROJECTS } from "@/lib/rank-tracker/wbs-share";
import WbsBoard, {
  type WbsData,
  type WbsKpiResults,
  type WbsTask,
} from "@/components/rank-tracker/WbsBoard";
import wbsData from "@/data/wbs-tasks.json";
// KPI自動計測結果はserver側でのみ読み込み、認証後にpropsで渡す（クライアントチャンクへの混入防止）
import wbsKpiResults from "@/data/wbs-kpi-results.json";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "施策スケジュール",
};

type Props = { params: Promise<{ pj: string }> };

// クライアント共有ビュー: 対象プロジェクトのタスクだけを、そのサイトのACL許可者（と admin）に見せる。
// 内部メモ（dep・PJメモ・再計測手順）は他クライアント情報や内部事情を含むため渡さない。
export default async function SharedWbsPage({ params }: Props) {
  const { pj } = await params;
  const share = WBS_SHARED_PROJECTS[pj];
  if (!share) notFound();

  const access = await getAccess();
  if (!access) redirect("/rank-tracker/login");
  if (!canViewDomain(access, share.domain)) redirect("/rank-tracker/dashboard");

  const src = wbsData as unknown as WbsData;
  const tasks = src.tasks
    .filter((t) => t.pj === pj)
    .map(
      (t): WbsTask => ({
        ...t,
        dep: "",
        kpi: t.kpi ? { ...t.kpi, queryRef: undefined } : undefined,
      })
    );
  const data: WbsData = {
    updated: src.updated,
    pjMeta: { [pj]: { label: src.pjMeta[pj]?.label ?? pj, note: "", stale: false } },
    tasks,
  };

  const auto = wbsKpiResults as unknown as WbsKpiResults;
  const ids = new Set(tasks.map((t) => t.id));
  const kpiAuto: WbsKpiResults = {
    measuredDate: auto.measuredDate,
    window: auto.window,
    results: Object.fromEntries(
      Object.entries(auto.results ?? {}).filter(([id]) => ids.has(id))
    ),
  };

  return <WbsBoard data={data} kpiAuto={kpiAuto} heading={share.heading} intro={share.intro} />;
}
