import type { Metadata } from "next";
import ContactForm from "@/components/ContactForm";

export const metadata: Metadata = {
  title: "お問い合わせ",
  description: "株式会社ミチビキへのお問い合わせフォーム",
};

export default function ContactPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="mb-12 text-center">
        <p className="text-blue-600 text-sm font-semibold tracking-widest mb-2">CONTACT</p>
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">お問い合わせ</h1>
        <p className="text-gray-600 text-sm">
          ご質問・ご相談・お見積りのご依頼はこちらからお気軽にどうぞ。<br />
          通常2営業日以内にご返信いたします。
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-8 md:p-10">
        <ContactForm />
      </div>
    </div>
  );
}
