@echo off
rem SEO観測ツール: URL検査チェーンの午後発火（タスクスケジューラから毎日16:05に呼ばれる）。
rem
rem URL Inspection API のクォータ（プロパティ単位・2,000件/日）は太平洋時間の深夜
rem ＝日本時間16:00にリセットされる。rasik.style はプロパティのクォータを
rem クライアント側の外部ツールと共有しているとみられ、朝5:30のcron時点では
rem 枯渇していて429になる。リセット直後に発火してクォータを先取りする。
rem 朝の実行分で予算を消化済みのサイトは日次会計（countInspectionsToday）で
rem 自動スキップされるため、二重検査にはならない。
rem CRON_SECRET はリポジトリ直下の .cron-secret（gitignore対象）から読む。
set /p SECRET=<F:\michishiki-corporate\.cron-secret
curl -s -H "Authorization: Bearer %SECRET%" https://www.michi-biki.jp/api/rank-tracker/seo/cron/inspect >> "%TEMP%\seo-inspect-1605.log" 2>&1
echo. >> "%TEMP%\seo-inspect-1605.log"
