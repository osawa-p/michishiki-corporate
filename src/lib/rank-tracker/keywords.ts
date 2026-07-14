// 定期自動計測（Vercel Cron）で追跡するキーワード一覧。
// まずは配列で管理し、必要に応じてUI/DB管理へ拡張する。

export type TrackedKeyword = {
  keyword: string;
  domain: string;
};

// 自社ドメインの既定値
export const DEFAULT_TARGET_DOMAIN = "michi-biki.jp";

export const TRACKED_KEYWORDS: TrackedKeyword[] = [
  { keyword: "生成AI 研修", domain: DEFAULT_TARGET_DOMAIN },
];
