// Google OAuth のリフレッシュトークンを取得するローカル用スクリプト。
// SEO観測ツールを「運用者のGoogleアカウント」で認証するための一度きりのセットアップ。
//
// 事前準備（GCPコンソール・一度だけ）:
//   1. APIとサービス → 認証情報 → OAuthクライアントIDを作成（種類: ウェブアプリケーション）
//   2. 承認済みリダイレクトURIに http://localhost:53682/callback を追加
//   3. OAuth同意画面を「本番」に公開する（テストのままだとトークンが7日で失効）
//   4. Search Console API と Google Analytics Data API を有効化
//
// 実行:
//   GOOGLE_OAUTH_CLIENT_ID=xxx GOOGLE_OAUTH_CLIENT_SECRET=yyy node scripts/get-google-oauth-token.mjs
//   → 表示されたURLをブラウザで開き、GSC/GA4にアクセスできるGoogleアカウントで許可
//   → 表示された GOOGLE_OAUTH_REFRESH_TOKEN を .env.local と Vercel の環境変数に設定
import http from "node:http";
import { OAuth2Client } from "google-auth-library";

const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("GOOGLE_OAUTH_CLIENT_ID と GOOGLE_OAUTH_CLIENT_SECRET を環境変数で渡してください。");
  process.exit(1);
}

const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}/callback`;
const client = new OAuth2Client(clientId, clientSecret, REDIRECT);

const url = client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent", // 毎回リフレッシュトークンを発行させる
  scope: [
    "https://www.googleapis.com/auth/webmasters.readonly",
    "https://www.googleapis.com/auth/analytics.readonly",
  ],
});

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url ?? "/", REDIRECT);
  if (u.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }
  const code = u.searchParams.get("code");
  if (!code) {
    res.writeHead(400).end("認可コードがありません。");
    return;
  }
  try {
    const { tokens } = await client.getToken(code);
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("認証が完了しました。このタブは閉じてください。トークンはターミナルに表示されています。");
    console.log("\n────────────────────────────────────────");
    if (tokens.refresh_token) {
      console.log("以下を .env.local と Vercel の環境変数に設定してください:\n");
      console.log(`GOOGLE_OAUTH_CLIENT_ID=${clientId}`);
      console.log(`GOOGLE_OAUTH_CLIENT_SECRET=${clientSecret}`);
      console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
    } else {
      console.log("refresh_token が返りませんでした。同意画面で一度アクセス権を削除してから再実行してください。");
    }
    console.log("────────────────────────────────────────\n");
  } catch (err) {
    res.writeHead(500).end("トークン交換に失敗しました。ターミナルを確認してください。");
    console.error("トークン交換に失敗:", err?.message ?? err);
  } finally {
    server.close();
  }
});

server.listen(PORT, () => {
  console.log("以下のURLをブラウザで開いて、GSC/GA4にアクセスできるアカウントで許可してください:\n");
  console.log(url + "\n");
});
