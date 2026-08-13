// 招待メールの送信（Resend）。問い合わせフォームと同じ RESEND_API_KEY / CONTACT_FROM_EMAIL を流用する。
// 送信失敗は招待の失敗にしない（招待リンクの手動共有でリカバリできる）ため、結果を返すだけにする。
import { Resend } from "resend";
import { ROLE_LABELS, type MemberRole } from "./roles";

export type InviteEmailResult = { sent: true } | { sent: false; reason: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// CONTACT_FROM_EMAIL は「お問い合わせ <noreply@...>」形式なので、アドレスだけ取り出して差出人名を付け替える
function inviteFrom(configured: string): string {
  const m = configured.match(/<([^>]+)>/);
  const addr = (m ? m[1] : configured).trim();
  return `ミチビキ順位計測ツール <${addr}>`;
}

export async function sendInviteEmail(input: {
  to: string;
  inviteUrl: string;
  role: MemberRole;
  domains: string[];
}): Promise<InviteEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.CONTACT_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    console.error(
      "[rank-tracker] 招待メールの送信に必要な環境変数が未設定です。" +
        " RESEND_API_KEY / CONTACT_FROM_EMAIL を設定してください。"
    );
    return { sent: false, reason: "メール送信の設定が未完了です" };
  }

  const roleLabel = ROLE_LABELS[input.role];
  const sitesLine = input.role === "admin" ? "全サイト" : input.domains.join(" / ");

  const textBody = [
    "株式会社ミチビキの順位計測ツールに招待されました。",
    "",
    "以下のリンクを開いてパスワードを設定すると、そのままログインしてご利用いただけます。",
    "",
    input.inviteUrl,
    "",
    `・リンクの有効期限: 7日間`,
    `・権限: ${roleLabel}`,
    `・対象サイト: ${sitesLine}`,
    "",
    "有効期限が切れた場合は、招待した担当者にリンクの再発行をご依頼ください。",
    "このメールに心当たりがない場合は、お手数ですが破棄してください。",
  ].join("\n");

  const htmlBody = `
    <div style="font-family: sans-serif; line-height: 1.7; color: #1f2937; max-width: 36rem;">
      <p>株式会社ミチビキの順位計測ツールに招待されました。</p>
      <p>以下のボタンからパスワードを設定すると、そのままログインしてご利用いただけます。</p>
      <p style="margin: 24px 0;">
        <a href="${escapeHtml(input.inviteUrl)}"
           style="display: inline-block; padding: 12px 28px; background: #1f2937; color: #ffffff; text-decoration: none; font-weight: bold;">
          パスワードを設定する
        </a>
      </p>
      <p style="font-size: 12px; color: #6b7280;">
        ボタンが開けない場合は次のURLをブラウザに貼り付けてください。<br />
        <a href="${escapeHtml(input.inviteUrl)}" style="color: #6b7280; word-break: break-all;">${escapeHtml(input.inviteUrl)}</a>
      </p>
      <table style="border-collapse: collapse; font-size: 14px; margin-top: 8px;">
        <tr><td style="padding: 2px 12px 2px 0; font-weight: bold;">有効期限</td><td>7日間</td></tr>
        <tr><td style="padding: 2px 12px 2px 0; font-weight: bold;">権限</td><td>${escapeHtml(roleLabel)}</td></tr>
        <tr><td style="padding: 2px 12px 2px 0; font-weight: bold;">対象サイト</td><td>${escapeHtml(sitesLine)}</td></tr>
      </table>
      <p style="font-size: 12px; color: #6b7280; margin-top: 24px;">
        有効期限が切れた場合は、招待した担当者にリンクの再発行をご依頼ください。<br />
        このメールに心当たりがない場合は、お手数ですが破棄してください。
      </p>
    </div>
  `;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: inviteFrom(fromEmail),
      to: input.to,
      subject: "【株式会社ミチビキ】順位計測ツールへの招待",
      text: textBody,
      html: htmlBody,
    });
    if (error) {
      console.error("[rank-tracker] 招待メールの送信に失敗:", error);
      return { sent: false, reason: "メール送信でエラーが発生しました" };
    }
    return { sent: true };
  } catch (err) {
    console.error("[rank-tracker] 招待メールの送信中に予期しないエラー:", err);
    return { sent: false, reason: "メール送信でエラーが発生しました" };
  }
}
