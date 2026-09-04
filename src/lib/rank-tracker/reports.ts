// 月次レポートのサイト別設定。一覧・ナビ・配信の全経路がこの設定×ACL
// （members.allowed_domains）でフィルタされる。クライアント名の相互漏えいを
// 防ぐため、閲覧権限のないサイトはURL・名称・存在自体を一切露出しないこと。
// クライアントコンポーネント（ナビ）からも参照するため、サーバー依存を持たせない。

export type ReportSite = {
  slug: string; // URLセグメント兼データディレクトリ名（src/data/reports/<slug>/）
  domain: string; // 閲覧権限の判定に使うターゲットドメイン（targetKey正規化済みの値）
  label: string; // 見出し表示名（そのサイトの許可メンバーと admin にのみ表示される）
  description: string; // 一覧での補足説明
};

export const REPORT_SITES: ReportSite[] = [
  {
    slug: "rasik",
    domain: "rasik.style",
    label: "RASIK",
    description: "月次オーガニックレポート（GA4実測）",
  },
  {
    slug: "cincia",
    domain: "cin-cia.com",
    label: "Cin-Cia Nail Academy",
    description: "月次オーガニックレポート（GA4・Search Console実測）",
  },
];

// ナビの「月次レポート」タブ表示判定に使う（いずれかのサイトの許可があれば表示）
export const REPORT_DOMAINS = REPORT_SITES.map((s) => s.domain);

export function reportSiteBySlug(slug: string): ReportSite | null {
  return REPORT_SITES.find((s) => s.slug === slug) ?? null;
}
