@echo off
rem SEO観測ツール: リメディGA4エクスポートの日次ミラー（タスクスケジューラから呼ばれる）
cd /d F:\michishiki-corporate
node scripts\mirror-remedy-ga4.mjs >> "%TEMP%\ga4-mirror.log" 2>&1
