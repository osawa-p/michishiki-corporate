"use client";

import { useState } from "react";
import { sendGTMEvent } from "@next/third-parties/google";

type FormState = {
  name: string;
  company: string;
  email: string;
  subject: string;
  message: string;
};

const initialForm: FormState = {
  name: "",
  company: "",
  email: "",
  subject: "",
  message: "",
};

export default function ContactForm() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { id, value } = e.target;
    setForm((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // 必須項目のバリデーション
    if (!form.name.trim() || !form.email.trim() || !form.subject.trim() || !form.message.trim()) {
      setStatus("error");
      setErrorMessage("必須項目（お名前・メールアドレス・お問い合わせ種別・お問い合わせ内容）をご入力ください。");
      return;
    }

    setStatus("submitting");
    setErrorMessage("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        throw new Error("送信に失敗しました");
      }

      setStatus("success");
      sendGTMEvent({ event: "generate_lead", form_subject: form.subject });
      setForm(initialForm);
    } catch {
      setStatus("error");
      setErrorMessage("送信に失敗しました。お手数ですが、時間をおいて再度お試しください。");
    }
  };

  if (status === "success") {
    return (
      <div className="text-center py-8">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-paper border border-bronze/40">
          <svg
            className="h-8 w-8 text-bronze-deep"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="font-serif text-xl font-semibold text-ink mb-3">お問い合わせありがとうございます</h2>
        <p className="text-ink-soft text-sm">
          お問い合わせを受け付けました。<br />
          通常2営業日以内にご返信いたします。今しばらくお待ちください。
        </p>
      </div>
    );
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit} noValidate>
      {status === "error" && errorMessage && (
        <div className="bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-ink mb-2" htmlFor="name">
          お名前 <span className="text-bronze-deep">*</span>
        </label>
        <input
          id="name"
          type="text"
          required
          value={form.name}
          onChange={handleChange}
          placeholder="山田 太郎"
          className="w-full px-4 py-3 bg-white border border-line text-sm focus:outline-none focus:border-bronze"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-ink mb-2" htmlFor="company">
          会社名
        </label>
        <input
          id="company"
          type="text"
          value={form.company}
          onChange={handleChange}
          placeholder="株式会社〇〇"
          className="w-full px-4 py-3 bg-white border border-line text-sm focus:outline-none focus:border-bronze"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-ink mb-2" htmlFor="email">
          メールアドレス <span className="text-bronze-deep">*</span>
        </label>
        <input
          id="email"
          type="email"
          required
          value={form.email}
          onChange={handleChange}
          placeholder="example@mail.com"
          className="w-full px-4 py-3 bg-white border border-line text-sm focus:outline-none focus:border-bronze"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-ink mb-2" htmlFor="subject">
          お問い合わせ種別 <span className="text-bronze-deep">*</span>
        </label>
        <select
          id="subject"
          required
          value={form.subject}
          onChange={handleChange}
          className="w-full px-4 py-3 bg-white border border-line text-sm focus:outline-none focus:border-bronze"
        >
          <option value="">選択してください</option>
          <option>サービスに関するご質問</option>
          <option>お見積りのご依頼</option>
          <option>採用に関するお問い合わせ</option>
          <option>その他</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-semibold text-ink mb-2" htmlFor="message">
          お問い合わせ内容 <span className="text-bronze-deep">*</span>
        </label>
        <textarea
          id="message"
          required
          rows={6}
          value={form.message}
          onChange={handleChange}
          placeholder="お問い合わせ内容をご記入ください"
          className="w-full px-4 py-3 bg-white border border-line text-sm focus:outline-none focus:border-bronze resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full py-3.5 bg-ink text-paper text-sm font-semibold hover:bg-bronze-deep transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {status === "submitting" ? "送信中..." : "送信する"}
      </button>
    </form>
  );
}
