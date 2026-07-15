"use client";

// GTM/GA を公開ページに限定して読み込むゲート。
// /rank-tracker 配下は社内ツールのため計測しない。特に招待リンク
// （/rank-tracker/invite/<トークン>）はURL自体が資格情報であり、
// GTM経由で page_location として外部に送られるのを防ぐ必要がある。
import { usePathname } from "next/navigation";
import { GoogleTagManager } from "@next/third-parties/google";

export default function AnalyticsGate({ gtmId }: { gtmId: string }) {
  const pathname = usePathname();
  if (pathname.startsWith("/rank-tracker")) return null;
  return <GoogleTagManager gtmId={gtmId} />;
}
