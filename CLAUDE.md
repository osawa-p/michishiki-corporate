# 株式会社ミチビキ 企業サイト

## プロジェクト概要
- **リポジトリ**: https://github.com/osawa-p/michishiki-corporate
- **本番URL**: https://michi-biki.jp
- **Vercel**: https://michishiki-corporate-16a4.vercel.app

## 技術スタック
- Next.js 15 (App Router) / TypeScript / Tailwind CSS v4
- お知らせ: Markdown + gray-matter + remark
- ホスティング: Vercel

## ブランチ運用
- `main` → 本番（Vercel自動デプロイ）
- `develop` → 開発統合
- `feature/*` → 機能開発 → PR → develop → main

## ページ構成
- `/` TOPページ
- `/about` 会社概要
- `/service` サービス紹介
- `/news` お知らせ一覧（Markdown）
- `/news/[slug]` お知らせ詳細
- `/recruit` 採用情報
- `/contact` お問い合わせフォーム

## お知らせ記事の追加方法
`src/content/news/` に Markdown ファイルを追加する。

```md
---
title: 記事タイトル
date: "2024-02-01"
category: お知らせ
excerpt: 記事の概要（一覧に表示）
---

本文をここに書く
```

## 未実装タスク（GitHub Issues 参照）
- お問い合わせフォーム送信機能（Resend等）
- OGP / メタタグ整備
- お知らせ記事の追加
