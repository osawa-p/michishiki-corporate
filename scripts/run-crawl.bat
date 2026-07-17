@echo off
rem SEO観測ツール: Screaming Frog日次クロール（タスクスケジューラから呼ばれる）
cd /d F:\michishiki-corporate
node scripts\crawl-seo.mjs >> "%TEMP%\seo-crawl.log" 2>&1
