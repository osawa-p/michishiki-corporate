// クライアント向け「施策WBS」のサイト別設定。月次レポート（reports.ts）と同じACL方針:
// 一覧・ナビ・配信の全経路をこの設定×ACL（members.allowed_domains）でフィルタし、
// 閲覧権限のないサイトはURL・名称・存在自体を露出しない。
// クライアントコンポーネント（ナビ）からも参照するため、サーバー依存を持たせない。

export type ProjectSite = {
  slug: string; // URLセグメント兼データファイル名（src/data/wbs-client/<slug>.json）
  domain: string; // 閲覧権限の判定に使うターゲットドメイン（targetKey正規化済みの値）
  label: string; // 見出し表示名
  description: string; // 一覧での補足説明
};

export const PROJECT_SITES: ProjectSite[] = [
  {
    slug: "rasik",
    domain: "rasik.style",
    label: "RASIK",
    description: "SEO施策の進捗・待ち・完了と効果（大沢が更新）",
  },
];

// ナビの「施策WBS」タブ表示判定に使う（いずれかのサイトの許可があれば表示）
export const PROJECT_DOMAINS = PROJECT_SITES.map((s) => s.domain);

export function projectSiteBySlug(slug: string): ProjectSite | null {
  return PROJECT_SITES.find((s) => s.slug === slug) ?? null;
}
