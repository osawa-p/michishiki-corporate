import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/rank-tracker/auth";
import WbsBoard, { type WbsData, type WbsKpiResults, type WbsAiLatest } from "@/components/rank-tracker/WbsBoard";
import { loadLatestByWbs } from "@/lib/rank-tracker/ai-staff";
import wbsData from "@/data/wbs-tasks.json";
// KPI自動計測結果はserver側でのみ読み込み、認証後にpropsで渡す（クライアントチャンクへの混入防止）
import wbsKpiResults from "@/data/wbs-kpi-results.json";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "WBS",
};

export default async function WbsPage() {
  // 全クライアント横断のタスク情報を含むため管理者専用（招待メンバーには見せない）
  const access = await getAccess();
  if (!access) redirect("/rank-tracker/login");
  if (access.role !== "admin") redirect("/rank-tracker/dashboard");

  // AI社員ボードの最新返答（WBS ID で結ぶ）。取れなくても WBS 自体は表示する
  let aiLatest: WbsAiLatest = {};
  try {
    const rows = await loadLatestByWbs();
    aiLatest = Object.fromEntries(
      Object.entries(rows).map(([id, r]) => [id, { taskId: r.task_id, taskStatus: r.task_status, summary: r.summary, verdict: r.verdict, runStatus: r.run_status, finishedAt: r.finished_at }]),
    );
  } catch (e) {
    console.error("[wbs] AI社員の最新返答の取得に失敗:", e);
  }

  return <WbsBoard data={wbsData as unknown as WbsData} kpiAuto={wbsKpiResults as unknown as WbsKpiResults} aiLatest={aiLatest} />;
}
