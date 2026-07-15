// ターゲットドメインの正規化と検証。
// クライアントコンポーネントからも使うため、BigQuery クライアントに依存させない。

// URL貼り付けにも耐えるようホスト名だけを取り出し、小文字化・www. 除去する
// （serp_results.domain 側の正規化と揃える）。
export function targetKey(domain: string): string {
  let d = domain.trim().toLowerCase();
  d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // スキーム（https:// 等）
  d = d.split(/[/?#]/, 1)[0]; // パス・クエリ・フラグメント
  d = d.replace(/:\d*$/, ""); // ポート
  return d.replace(/^www\./, "");
}

// 正規化後のドメインがホスト名として妥当か（空白・記号の混入を弾く）
export function isValidTargetDomain(domain: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(domain);
}
