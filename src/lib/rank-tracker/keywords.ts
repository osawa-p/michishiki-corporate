// 順位計測ツールの既定値。
// 追跡キーワードは BigQuery の tracked_keywords テーブルで管理する
// （CRUDは src/lib/rank-tracker/bigquery.ts の listTrackedKeywords / addTrackedKeywords ほか）。
// 以前はここに TRACKED_KEYWORDS 配列をハードコードしていたが、UI/DB管理へ移行して撤去した。

// 自社ドメインの既定値（入力フォームのプレースホルダや一括登録の既定ドメイン等で使用）
export const DEFAULT_TARGET_DOMAIN = "michi-biki.jp";
