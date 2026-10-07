import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/rank-tracker/auth";
import { loadBoard, type BoardData } from "@/lib/rank-tracker/ai-staff";
import AiStaffBoard, { type WbsInfo } from "@/components/rank-tracker/AiStaffBoard";
// WBS（tasks.js 由来）の施策情報。WBS ID で結んで各行に状態を出す（管理者専用ページなので server 側で読んで props で渡す）
import wbsData from "@/data/wbs-tasks.json";

type WbsJson = { tasks?: { id: string; st: string; due: string; pri: number; task: string }[] };

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI社員",
};

export default async function AiStaffPage() {
  // 全クライアント横断の作業内容を含むため管理者専用（招待メンバーには見せない）
  const access = await getAccess();
  if (!access) redirect("/rank-tracker/login");
  if (access.role !== "admin") redirect("/rank-tracker/dashboard");

  const wbsMap: Record<string, WbsInfo> = Object.fromEntries(
    ((wbsData as unknown as WbsJson).tasks ?? []).map((t) => [t.id, { st: t.st, due: t.due, pri: t.pri, task: t.task }]),
  );

  let initial: BoardData | null = null;
  let loadError = false;
  try {
    initial = await loadBoard();
  } catch (e) {
    console.error("[ai-staff] ボードの取得に失敗:", e);
    loadError = true;
  }

  return (
    <>
      <section className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">AI Staff</p>
          <h1 className="font-serif text-3xl md:text-4xl font-semibold">AI社員</h1>
          <p className="mt-4 text-sm text-ink-soft max-w-2xl leading-relaxed">
            案件ごとの AI社員（案件リーダー・SEO担当・アクセス解析担当・反論担当）に指示を出し、返答を確認する作業ボードです。
            「実行」で依頼が登録され、手元の派遣係が5分以内に拾って処理します。先方への送付・サイトの公開・共有資料の上書きは行わず、確認待ちで止まります。
          </p>
        </div>
      </section>

      <section className="py-8 md:py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <AiStaffBoard initial={initial} loadError={loadError} wbs={wbsMap} />
        </div>
      </section>
    </>
  );
}
