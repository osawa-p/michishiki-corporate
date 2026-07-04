import type { Metadata } from "next";
import ContactForm from "@/components/ContactForm";

export const metadata: Metadata = {
  title: "お問い合わせ",
  description: "株式会社ミチビキへのお問い合わせフォーム",
};

export default function ContactPage() {
  return (
    <>
      {/* Page Header */}
      <section className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">Contact</p>
          <h1 className="font-serif text-4xl md:text-5xl font-semibold mb-6">お問い合わせ</h1>
          <p className="text-ink-soft text-sm leading-relaxed max-w-xl">
            ご質問・ご相談・お見積りのご依頼はこちらからお気軽にどうぞ。
            通常2営業日以内にご返信いたします。
          </p>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white/60 border border-line p-8 md:p-12">
            <ContactForm />
          </div>
        </div>
      </section>
    </>
  );
}
