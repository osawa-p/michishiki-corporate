import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/rank-tracker/auth";
import WbsBoard, { type WbsData } from "@/components/rank-tracker/WbsBoard";
import wbsData from "@/data/wbs-tasks.json";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "WBS",
};

export default async function WbsPage() {
  // 全クライアント横断のタスク情報を含むため管理者専用（招待メンバーには見せない）
  const access = await getAccess();
  if (!access) redirect("/rank-tracker/login");
  if (access.role !== "admin") redirect("/rank-tracker/dashboard");

  return <WbsBoard data={wbsData as unknown as WbsData} />;
}
