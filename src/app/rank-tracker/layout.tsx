import type { Metadata } from "next";
import RankTrackerNav from "@/components/rank-tracker/RankTrackerNav";
import { getAccess } from "@/lib/rank-tracker/auth";

// 社内専用ツール。robots noindex をここで集約し、配下の全ページ（ダッシュボード /
// キーワード管理 / 計測 / メンバー管理 / ログイン）へ継承させる。
export const metadata: Metadata = {
  title: { default: "順位計測ツール", template: "%s | 順位計測ツール" },
  robots: { index: false, follow: false },
};

export default async function RankTrackerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ナビの出し分け（管理者/閲覧のみ/未ログイン）のためにセッションを読む
  const access = await getAccess();
  return (
    <>
      <RankTrackerNav role={access?.role ?? null} email={access?.email ?? null} />
      {children}
    </>
  );
}
