import { redirect } from "next/navigation";

// ツールの入口はダッシュボード（日常利用は「確認 > 設定 > 単発計測」の順のため）。
// 旧URLのブックマーク互換もこのリダイレクトで維持する。
export default function RankTrackerIndexPage() {
  redirect("/rank-tracker/dashboard");
}
