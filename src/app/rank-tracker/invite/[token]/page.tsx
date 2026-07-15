import type { Metadata } from "next";
import InviteForm from "@/components/rank-tracker/InviteForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "招待の受諾",
};

type Props = { params: Promise<{ token: string }> };

export default async function InvitePage({ params }: Props) {
  const { token } = await params;

  return (
    <section className="py-16 md:py-24">
      <div className="max-w-md mx-auto px-4 sm:px-6">
        <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4 text-center">
          Rank Tracker
        </p>
        <h1 className="font-serif text-2xl md:text-3xl font-semibold text-center">
          パスワードの設定
        </h1>
        <p className="mt-3 mb-8 text-sm text-ink-soft text-center">
          順位計測ツールに招待されました。ログイン用のパスワードを設定してください。
        </p>
        <InviteForm token={token} />
      </div>
    </section>
  );
}
