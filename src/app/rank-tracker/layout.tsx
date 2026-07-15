import type { Metadata } from "next";
import RankTrackerNav from "@/components/rank-tracker/RankTrackerNav";

// 社内専用ツール。robots noindex をここで集約し、配下の全ページ（計測 / キーワード管理 /
// ダッシュボード）へ継承させる（各ページで個別に指定する必要がなくなる）。
export const metadata: Metadata = {
  title: { default: "順位計測ツール", template: "%s | 順位計測ツール" },
  robots: { index: false, follow: false },
};

export default function RankTrackerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <RankTrackerNav />
      {children}
    </>
  );
}
