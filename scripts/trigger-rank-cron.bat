@echo off
rem 順位計測ツール: 順位計測cronの追加発火（タスクスケジューラから毎日12:00開始・3時間間隔で4回呼ばれる）。
rem
rem 朝6:00のVercel cronは1回あたり最大15KWの上限があり（maxDuration対策）、
rem 登録KWの必要量（daily 15KW＋every3days/weeklyの按分で約31KW/日、
rem 特にrasikのweekly 70KWが一斉に期限を迎える日は90KW超）を賄えず滞留が出る。
rem 午後にも発火して処理能力を確保する。期限到来KWが無ければ何も計測せず終わる
rem （no-op。JINAトークン消費は発生しない）ため、多めに発火しても安全。
rem サイト別の月次予算制御（site_settings.monthly_budget）はcron側で効いたまま。
rem CRON_SECRET はリポジトリ直下の .cron-secret（gitignore対象）から読む。
set /p SECRET=<F:\michishiki-corporate\.cron-secret
curl -s -H "Authorization: Bearer %SECRET%" https://www.michi-biki.jp/api/rank-tracker/cron >> "%TEMP%\rank-cron-drain.log" 2>&1
echo. >> "%TEMP%\rank-cron-drain.log"
