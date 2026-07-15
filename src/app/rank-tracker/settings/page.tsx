import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/rank-tracker/auth";
import { buildSiteSettingsView, type SiteSettingsView } from "@/lib/rank-tracker/settings-view";
import SettingsManager from "@/components/rank-tracker/SettingsManager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "サイト設定",
};

export default async function SettingsPage() {
  // サイト別制限の管理は管理者のみ
  const access = await getAccess();
  if (!access) redirect("/rank-tracker/login");
  if (access.role !== "admin") redirect("/rank-tracker/dashboard");

  let initial: SiteSettingsView[] = [];
  let loadError = false;
  try {
    initial = await buildSiteSettingsView();
  } catch (e) {
    console.error("[rank-tracker] サイト設定の取得に失敗:", e);
    loadError = true;
  }

  return (
    <>
      <section className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">Site Settings</p>
          <h1 className="font-serif text-3xl md:text-4xl font-semibold">サイト別の制限・クレジット</h1>
          <p className="mt-4 text-sm text-ink-soft max-w-2xl leading-relaxed">
            サイトごとに登録できるキーワード数・計測深度・使える頻度・月間クレジット予算を設定します。
            制限を超える登録や頻度変更はブロックされ、予算に達したサイトの定期計測は翌月まで停止します。
            クレジット＝JINAトークン（1計測 ≒ 100位で11万・50位で6万・30位で4万）。
          </p>
        </div>
      </section>

      <section className="py-10 md:py-14">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <SettingsManager initial={initial} loadError={loadError} />
        </div>
      </section>
    </>
  );
}
