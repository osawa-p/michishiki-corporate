import { NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";

type ContactPayload = {
  name?: string;
  company?: string;
  email?: string;
  subject?: string;
  message?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(request: Request) {
  let payload: ContactPayload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const name = payload.name?.trim() ?? "";
  const company = payload.company?.trim() ?? "";
  const email = payload.email?.trim() ?? "";
  const subject = payload.subject?.trim() ?? "";
  const message = payload.message?.trim() ?? "";

  // 必須項目のバリデーション
  if (!name || !email || !subject || !message) {
    return NextResponse.json(
      { ok: false, error: "必須項目が入力されていません。" },
      { status: 400 }
    );
  }

  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.CONTACT_TO_EMAIL;
  const fromEmail = process.env.CONTACT_FROM_EMAIL;

  if (!apiKey || !toEmail || !fromEmail) {
    console.error(
      "[contact] メール送信に必要な環境変数が未設定です。" +
        " RESEND_API_KEY / CONTACT_TO_EMAIL / CONTACT_FROM_EMAIL を設定してください。"
    );
    return NextResponse.json(
      { ok: false, error: "サーバーのメール送信設定が未完了です。" },
      { status: 500 }
    );
  }

  const textBody = [
    "お問い合わせフォームより新しいメッセージが届きました。",
    "",
    `お名前: ${name}`,
    `会社名: ${company || "（未入力）"}`,
    `メールアドレス: ${email}`,
    `お問い合わせ種別: ${subject}`,
    "",
    "お問い合わせ内容:",
    message,
  ].join("\n");

  const htmlBody = `
    <div style="font-family: sans-serif; line-height: 1.6; color: #1f2937;">
      <p>お問い合わせフォームより新しいメッセージが届きました。</p>
      <table style="border-collapse: collapse;">
        <tr><td style="padding: 4px 12px 4px 0; font-weight: bold;">お名前</td><td>${escapeHtml(name)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; font-weight: bold;">会社名</td><td>${escapeHtml(company) || "（未入力）"}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; font-weight: bold;">メールアドレス</td><td>${escapeHtml(email)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; font-weight: bold;">お問い合わせ種別</td><td>${escapeHtml(subject)}</td></tr>
      </table>
      <p style="font-weight: bold; margin-bottom: 4px;">お問い合わせ内容:</p>
      <p style="white-space: pre-wrap;">${escapeHtml(message)}</p>
    </div>
  `;

  try {
    const resend = new Resend(apiKey);

    const { error } = await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      replyTo: email,
      subject: `【お問い合わせ】${subject} - ${name} 様`,
      text: textBody,
      html: htmlBody,
    });

    if (error) {
      console.error("[contact] Resend送信エラー:", error);
      return NextResponse.json({ ok: false, error: "メール送信に失敗しました。" }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[contact] メール送信中に予期しないエラーが発生しました:", err);
    return NextResponse.json({ ok: false, error: "メール送信に失敗しました。" }, { status: 500 });
  }
}
