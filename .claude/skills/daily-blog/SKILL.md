---
name: daily-blog
description: 話題のトピックを調査してブログ記事を1本執筆し、レビュー用のPRを作成する。毎日のブログ更新、記事の自動作成、トレンド記事の執筆を頼まれたときに使う。
---

# 日次ブログ記事の作成

株式会社ミチビキ（SEO・AXO/LLMO・CVR改善・データ活用のWebマーケティング支援会社）のブログ記事を1本作成し、レビュー用のPRを出す。

## 手順

### 1. 既存記事の確認（重複防止）

`src/content/blog/` の全ファイルの frontmatter（title / date / category）を確認し、直近30記事のトピックを把握する。既出のトピックと実質的に重複する記事は書かない。切り口が明確に異なる場合のみ可。

### 2. トレンド調査

#### 2-a. X(Twitter) のバズ投稿調査（SocialData API — キーがある場合のみ）

環境変数 `SOCIALDATA_API_KEY` が設定されている場合、SocialData API で X 上の実際のバズ投稿を調査する。**キーが未設定なら黙って 2-b のみで調査する（エラーにしない）。**

```bash
# 例: 直近1週間・反応の多いSEO/LLMO関連の日本語投稿（since はJSTで7日前）
curl -s "https://api.socialdata.tools/twitter/search?query=$(python -c "import urllib.parse;print(urllib.parse.quote('(SEO OR LLMO OR AIO OR AI検索) min_faves:100 lang:ja since:YYYY-MM-DD'))")&type=Top" \
  -H "Authorization: Bearer $SOCIALDATA_API_KEY" -H "Accept: application/json"
```

- クエリは X の高度な検索演算子がそのまま使える（`min_faves:` `min_retweets:` `lang:ja` `since:` など）
- **`since:`（JSTで7日前）は必ず入れること。** 付けないと数年前のバズ投稿が上位に混ざり、話題性の判断を誤る
- 2〜4クエリ程度に留める（従量課金: $0.20/1000ツイート。1回の実行で合計500ツイート以内を目安）
- レスポンスの `tweets[]` から `full_text` と `favorite_count` を見て、何が・なぜ話題かを把握する
- バズ投稿は「話題の種」として使い、**事実確認は必ず 2-b のWeb検索で一次情報に当たる**（投稿内容を裏取りなしに事実として書かない）

#### 2-b. Web検索

WebSearch で以下の観点から「今まさに話題になっているもの」を探す（当日〜直近1週間）。

- Google のアルゴリズムアップデート・検索仕様変更・Search Console 等のニュース
- AI検索（AI Overviews / ChatGPT search / Perplexity 等）とLLMO・AXOの動向
- X(Twitter) でWebマーケティング界隈が話題にしているトピック（まとめ記事・業界メディア経由で調査）
- SEO・コンテンツマーケティング・CVR改善・アクセス解析の新事例やベストプラクティス

検索例: 「SEO ニュース 今週」「Google アルゴリズム アップデート 最新」「AI Overviews 影響」「LLMO 対策」など。日付を絞って最新情報を得ること。

### 3. トピック選定

以下の基準で1つ選ぶ。

- **話題性**: 直近で実際に議論・報道されている（Xのバズ投稿データがあればエンゲージメント数も判断材料にする）
- **事業関連性**: 会社のサービス（SEO / AXO・LLMO / CVR / データ活用）に紐づく
- **読者価値**: 中小企業のWeb担当者・経営者が「自社はどうすべきか」を持ち帰れる
- **非重複**: 手順1で確認した既存記事と被らない

### 4. 記事の執筆

`src/content/blog/<slug>.md` を作成する。slug は英語ケバブケース（例: `google-core-update-2026-07`）。

```md
---
title: 記事タイトル（32字以内目安・検索意図を意識）
date: "YYYY-MM-DD"（今日の日付。JST基準: `TZ=Asia/Tokyo date +%Y-%m-%d` で取得すること）
category: SEO / AXO・LLMO / CVR改善 / データ活用 / コラム のいずれか
excerpt: 記事の要約（80〜120字。一覧とmeta descriptionに使われる）
---

本文
```

本文の要件:

- 1,500〜2,500字。構成は「導入（なぜ今この話題か）→ H2見出し2〜4個（`##`）→ まとめ（読者が取るべきアクション）」
- です・ます調。丁寧で信頼感のあるトーン。煽り表現・誇大表現は使わない（ブランドトーン: 紺×生成り、真面目で親身）
- 事実（アップデート内容・統計・発表）は調査で得た情報のみを書き、憶測を事実のように書かない
- 記事末尾に「参考」として出典リンクを1〜3件、Markdownリンクで載せる
- 自社サービスへの誘導は最後に1文まで（控えめに）。リンクは `/service` 配下へ

### 5. PR作成

1. `main` を pull し、`feature/blog-YYYYMMDD` ブランチを作成（日付はJST基準）
2. 記事ファイルをコミット（メッセージ: `feat: ブログ記事「タイトル」を追加`）
3. push して `main` 向けの PR を作成。PR本文に以下を含める:
   - 選んだトピックと「なぜ今か」（話題性の根拠となるURL）
   - 検討したが選ばなかった候補トピック2〜3件（翌日以降の参考）
4. **PRはマージしない**（公開判断は人間のレビュー後）

## 注意

- 1回の実行で作る記事は1本のみ
- ビルド確認は不要（Markdown追加のみのため）。frontmatter の YAML が正しいことだけ確認する
- 当日分の記事PR（`feature/blog-YYYYMMDD`）が既に存在する場合は新たに作らず、その旨を報告して終了する
