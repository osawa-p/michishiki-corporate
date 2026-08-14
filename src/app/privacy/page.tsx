import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "プライバシーポリシー",
  description:
    "株式会社ミチビキが運営するコーポレートサイトにおける個人情報の取り扱い、Cookie、GA4・GTM、お問い合わせフォームで取得する情報について定めています。",
  alternates: { canonical: "/privacy" },
};

type Section = {
  heading: string;
  body: React.ReactNode;
};

const sections: Section[] = [
  {
    heading: "1. 基本方針と適用範囲",
    body: (
      <>
        <p>
          株式会社ミチビキ（以下「当社」といいます）は、利用者の個人情報の重要性を認識し、個人情報の保護に関する法律（個人情報保護法）その他の関係法令を遵守して、個人情報を適切に取り扱います。
        </p>
        <p>
          本ポリシーは、当社が運営するコーポレートサイト（https://www.michi-biki.jp/、以下「本サイト」といいます）に適用されます。「うちの犬スタイル」等の当社サービスサイトには、各サイトに掲載するプライバシーポリシーが適用されます。
        </p>
      </>
    ),
  },
  {
    heading: "2. 取得する情報と取得方法",
    body: (
      <>
        <p>当社は、次の情報を取得することがあります。</p>
        <ul>
          <li>
            お問い合わせフォーム等に利用者が入力する情報（氏名、会社名、メールアドレス、お問い合わせ内容など）
          </li>
          <li>
            本サイトの閲覧に伴い自動的に送信される情報（Cookie、IPアドレス、ブラウザの種類、閲覧ページ、閲覧日時など）
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: "3. 利用目的",
    body: (
      <>
        <p>取得した情報は、次の目的の範囲内で利用します。</p>
        <ul>
          <li>お問い合わせへの回答、ご依頼いただいた業務の遂行およびそれらに付随する連絡のため</li>
          <li>本サイトの品質改善、利用状況の分析のため</li>
          <li>不正アクセス・不正利用の防止のため</li>
        </ul>
      </>
    ),
  },
  {
    heading: "4. Cookieの利用について",
    body: (
      <p>
        本サイトでは、利便性の向上やアクセス状況の分析のためにCookieを使用しています。Cookieには、利用者のブラウザや端末を識別するための情報が含まれる場合があり、他の情報と組み合わせて特定の個人と関連付けられることがあります。当社は、Cookie等を利用して取得した情報を、本サイトの利便性向上、利用状況の分析および品質改善のために利用します。利用者は、ブラウザの設定によりCookieの受け取りを拒否することができますが、その場合、本サイトの一部の機能が利用できなくなることがあります。
      </p>
    ),
  },
  {
    heading: "5. アクセス解析ツールについて",
    body: (
      <>
        <p>
          本サイトでは、Google LLCが提供するGoogle アナリティクス 4（GA4）を利用しています。GA4はCookie等を利用して、閲覧ページ、閲覧日時、参照元、端末・ブラウザ情報等のアクセス情報を収集し、Googleに送信します。当社は、これらの情報を個人を特定する目的では利用しません。
        </p>
        <p>
          また、本サイトでは、Google Tag Manager（GTM）を利用して、アクセス解析等のタグを管理・配信しています。GTMを通じて、GA4等の各種サービスが情報を収集する場合があります。データの収集・処理の仕組みについては、
          <a
            href="https://policies.google.com/technologies/partner-sites?hl=ja"
            target="_blank"
            rel="noopener noreferrer"
          >
            Googleのポリシーと規約（Googleのサービスを使用するサイトやアプリから収集した情報のGoogleによる使用）
          </a>
          をご確認ください。
        </p>
      </>
    ),
  },
  {
    heading: "6. 広告配信サービスについて",
    body: (
      <>
        <p>
          本サイトでは、現在広告を配信していません。当社が運営する「うちの犬スタイル」（https://trimming.michi-biki.jp/）では、第三者配信の広告サービス「Google AdSense」を利用しています。GoogleおよびGoogleのパートナーを含む第三者配信事業者は、広告配信に際し、利用者のブラウザにCookieを設定・読み取り、またはWebビーコンその他の技術を使用して情報を収集し、当該サイトや他のウェブサイトへの過去のアクセス情報に基づく広告（パーソナライズ広告）を配信することがあります。
        </p>
        <ul>
          <li>
            利用者は、
            <a href="https://adssettings.google.com/" target="_blank" rel="noopener noreferrer">
              広告設定
            </a>
            でパーソナライズ広告を無効にできます。
          </li>
          <li>
            また、
            <a href="https://optout.aboutads.info/" target="_blank" rel="noopener noreferrer">
              www.aboutads.info
            </a>
            にアクセスすることで、パーソナライズ広告に使用される第三者配信事業者のCookieを無効にできます。
          </li>
          <li>
            Googleによる広告Cookieの利用の詳細は、
            <a
              href="https://policies.google.com/technologies/ads?hl=ja"
              target="_blank"
              rel="noopener noreferrer"
            >
              Googleの広告に関するポリシーと規約
            </a>
            をご確認ください。
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: "7. 個人情報の第三者提供",
    body: (
      <p>
        当社は、本人の同意を得た場合または法令により認められる場合を除き、当社が保有する個人データを第三者に提供しません。なお、利用目的の達成に必要な範囲で、業務委託先に個人情報の取り扱いを委託する場合があります。
      </p>
    ),
  },
  {
    heading: "8. 業務委託に伴う取り扱い",
    body: (
      <p>
        当社は、利用目的の達成に必要な範囲内で、メール送信やサーバー運用などの業務を外部の事業者に委託し、その際に個人情報の取り扱いを委託することがあります。たとえば、お問い合わせフォームに入力された情報は、お問い合わせへの回答および連絡のため、Resendが提供するメール送信サービスを利用して取り扱います。Resendによる情報の取り扱いについては、
        <a
          href="https://resend.com/legal/privacy-policy"
          target="_blank"
          rel="noopener noreferrer"
        >
          Resendのプライバシーポリシー
        </a>
        をご確認ください。当社は、委託先を適切に選定し、必要かつ適切な監督を行います。
      </p>
    ),
  },
  {
    heading: "9. 安全管理措置",
    body: (
      <p>
        当社は、個人情報への不正アクセス、漏えい、滅失またはき損の防止のため、アクセス権限の管理、委託先の監督、漏えい等発生時の対応体制の整備その他必要かつ適切な安全管理措置を講じます。
      </p>
    ),
  },
  {
    heading: "10. 開示・訂正・利用停止等の請求",
    body: (
      <p>
        当社が保有する個人データについて、本人から開示、訂正、追加、削除、利用停止、消去、第三者提供の停止等のお申し出があった場合は、本人確認のうえ、法令に従って対応します。請求を希望される場合は、
        <Link href="/contact">お問い合わせフォーム</Link>
        よりご連絡ください。本人確認に必要な書類、代理人による請求方法、手数料および回答方法については、個別にご案内します。
      </p>
    ),
  },
  {
    heading: "11. 当社サービスサイトのプライバシーポリシー",
    body: (
      <p>
        当社が運営する犬のトリミングサロン検索サイト「うちの犬スタイル」における個人情報の取り扱いについては、同サイトの
        <a
          href="https://trimming.michi-biki.jp/privacy"
          target="_blank"
          rel="noopener noreferrer"
        >
          プライバシーポリシー
        </a>
        を併せてご確認ください。
      </p>
    ),
  },
  {
    heading: "12. プライバシーポリシーの改定",
    body: (
      <p>
        当社は、法令の改正やサービス内容の変更等に応じて、本ポリシーを改定することがあります。重要な変更を行う場合は、本サイト上でお知らせします。
      </p>
    ),
  },
  {
    heading: "13. お問い合わせ窓口",
    body: (
      <p>
        本ポリシーおよび個人情報の取り扱いに関するお問い合わせは、
        <Link href="/contact">お問い合わせフォーム</Link>よりご連絡ください。
        <br />
        事業者名: 株式会社ミチビキ
        <br />
        代表者: 代表取締役 大沢 翔己
        <br />
        所在地: 神奈川県横浜市港北区大曽根台32-2-2
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <>
      {/* Page Header */}
      <section className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">Privacy Policy</p>
          <h1 className="font-serif text-4xl md:text-5xl font-semibold">プライバシーポリシー</h1>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-12">
            {sections.map((section) => (
              <div key={section.heading} className="border-t border-line pt-8">
                <h2 className="font-serif text-xl md:text-2xl font-semibold mb-4">
                  {section.heading}
                </h2>
                <div className="text-sm text-ink-soft leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-bronze-deep">
                  {section.body}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-14 text-xs text-ink-faint">制定日: 2026年8月14日</p>
        </div>
      </section>
    </>
  );
}
