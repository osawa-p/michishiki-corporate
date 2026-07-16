// 週次AI提案の生成。GSC・GA4の蓄積データをサイト単位で要約し、Claudeに
// ①SEO提案（サーチコンソール由来）②ユーザビリティ提案（GA4由来）を生成させて
// seo_proposals へ保存する。過去の提案とその対応状況（ステータス・メモ）も渡すことで、
// 「実装しない」と判断済みの提案を蒸し返さず、実装済み施策には効果の所見を付ける。
// 認証: ANTHROPIC_API_KEY（Vercel環境変数）。

import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import {
  fetchQuerySummary,
  fetchQueryPages,
  fetchRotationProgress,
  fetchLatestInspections,
  fetchGa4Summary,
  fetchGa4Channels,
  fetchGa4PageStats,
  listProposals,
  insertProposals,
} from "./bigquery";
import type { SeoSite, SeoProposal } from "./types";

const MODEL = "claude-opus-4-8";
const DAYS = 28;

// Claudeに強制する出力スキーマ（structured outputs）
const PROPOSAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["proposals"],
  properties: {
    proposals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "title", "body", "basis"],
        properties: {
          kind: { type: "string", enum: ["seo", "ux"] },
          title: { type: "string", description: "提案の見出し（40字以内目安）" },
          body: {
            type: "string",
            description: "提案の本文。何をなぜやるか、期待効果まで簡潔に（200字前後）",
          },
          basis: {
            type: "string",
            description: "根拠となる具体的なデータ（数値・URL・クエリ名を含める）",
          },
        },
      },
    },
  },
} as const;

// JSTで今週の月曜（YYYY-MM-DD）
export function currentWeekMonday(): string {
  const jst = new Date(Date.now() + 9 * 3600_000);
  const day = jst.getUTCDay(); // 0=日
  const diff = day === 0 ? 6 : day - 1;
  jst.setUTCDate(jst.getUTCDate() - diff);
  return jst.toISOString().slice(0, 10);
}

const nf = (n: number) => Math.round(n).toLocaleString("ja-JP");
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

// サイトの観測データを、プロンプトに収まるコンパクトな日本語サマリーへ整形する
async function buildDataSummary(s: SeoSite): Promise<string> {
  const parts: string[] = [];

  if (s.gsc_enabled) {
    const [queries, queryPages, rotation, stale] = await Promise.all([
      fetchQuerySummary(s.site, DAYS),
      fetchQueryPages(s.site, DAYS),
      fetchRotationProgress(s.site),
      fetchLatestInspections(s.site, { limit: 15, staleDaysOnly: s.stale_days }),
    ]);

    const topQueries = queries.slice(0, 25).map(
      (q) =>
        `- 「${q.query}」表示${nf(q.impressions)}・クリック${nf(q.clicks)}・CTR${pct(q.ctr)}・平均${q.position.toFixed(1)}位` +
        (q.pages >= 2 ? `・着地${q.pages}URL（カニバリ疑い）` : "")
    );
    parts.push(`## サーチコンソール（直近${DAYS}日）\n### 上位クエリ\n${topQueries.join("\n")}`);

    const cannibal = new Map<string, typeof queryPages>();
    for (const r of queryPages) {
      const arr = cannibal.get(r.query) ?? [];
      arr.push(r);
      cannibal.set(r.query, arr);
    }
    const cannibalLines = [...cannibal.entries()]
      .filter(([, pages]) => pages.length >= 2)
      .slice(0, 5)
      .map(
        ([query, pages]) =>
          `- 「${query}」: ${pages.map((p) => `${p.page}（${p.position.toFixed(1)}位）`).join(" / ")}`
      );
    if (cannibalLines.length > 0) {
      parts.push(`### カニバリ疑い（1クエリに複数URL着地）\n${cannibalLines.join("\n")}`);
    }

    parts.push(
      `### URL検査\nインデックス対象 ${nf(rotation.total)} URL・検査済み ${nf(rotation.inspected)}・検査で対象外化 ${nf(rotation.excluded)}`
    );
    if (stale.length > 0) {
      parts.push(
        `### 長期未クロール（${s.stale_days}日以上・最大15件）\n` +
          stale
            .map((u) => `- ${u.url}（${u.days_since_crawl}日・${u.coverage_state ?? "状態不明"}）`)
            .join("\n")
      );
    }
  }

  if (s.ga4_enabled) {
    const [summary, channels, pages] = await Promise.all([
      fetchGa4Summary(s.site, DAYS),
      fetchGa4Channels(s.site, DAYS),
      fetchGa4PageStats(s.site, DAYS),
    ]);
    const d = (cur: number, prev: number) =>
      prev > 0 ? `（前期間比${(((cur - prev) / prev) * 100).toFixed(1)}%）` : "";
    parts.push(
      `## GA4（直近${DAYS}日）\n` +
        `セッション ${nf(summary.sessions)}${d(summary.sessions, summary.prev_sessions)}・` +
        `自然検索 ${nf(summary.organic_sessions)}${d(summary.organic_sessions, summary.prev_organic_sessions)}・` +
        `キーイベント ${nf(summary.key_events)}${d(summary.key_events, summary.prev_key_events)}・` +
        `平均滞在 ${Math.round(summary.avg_engagement_secs)}秒・直帰率 ${pct(summary.bounce_rate)}`
    );
    parts.push(
      `### チャネル別セッション\n` +
        channels.map((c) => `- ${c.channel}: ${nf(c.sessions)}（CV ${nf(c.key_events)}）`).join("\n")
    );
    const topPages = pages.slice(0, 20).map(
      (p) =>
        `- ${p.page}: セッション${nf(p.sessions)}・CV${nf(p.key_events)}（CVR${pct(p.cvr)}）・滞在${Math.round(p.avg_engagement_secs)}秒・直帰${pct(p.bounce_rate)}`
    );
    parts.push(`### ランディングページ別（上位20）\n${topPages.join("\n")}`);
  }

  return parts.join("\n\n");
}

// 過去の提案と対応状況をプロンプト用に整形（直近20件）
async function buildHistorySummary(site: string): Promise<string> {
  const prior = (await listProposals(site)).slice(0, 20);
  if (prior.length === 0) return "（過去の提案はまだありません）";
  return prior
    .map(
      (p) =>
        `- [${p.week}] [${p.kind}] ${p.title} → ステータス: ${p.status}` +
        (p.memo ? `／メモ: ${p.memo}` : "")
    )
    .join("\n");
}

const SYSTEM_PROMPT = `あなたは経験豊富なSEOコンサルタントです。クライアントサイトの観測データ（Search Console・GA4）から、今週の改善提案を作成します。

ルール:
- SEO提案（kind: "seo"）はサーチコンソールのデータ（クエリ・カニバリ・インデックス状況）を根拠に、ユーザビリティ提案（kind: "ux"）はGA4のデータ（直帰率・CVR・滞在時間・導線）を根拠にする
- それぞれ1〜3件、合計は最大5件。データに基づく確度の高いものだけを出す。無理に件数を埋めない
- basis には根拠の数値・URL・クエリ名を具体的に書く
- 「過去の提案と対応状況」を必ず踏まえること: ステータスが「実装しない」の提案は再提案しない。「実装済み」「一部対応」の施策は、今週のデータに効果が見えていればそれに言及した上で次の一手を提案する。「未対応」で依然重要なものは理由を添えて再掲してよい
- 提案は具体的な作業レベルまで落とす（「◯◯を改善する」ではなく「◯◯ページのtitleを△△軸に変更し、□□からの内部リンクを追加する」）
- すべて日本語で書く`;

export type GenerationResult = {
  site: string;
  generated: number;
  skipped?: boolean;
  error?: string;
};

// 1サイト分の提案を生成して保存する
export async function generateProposalsForSite(
  s: SeoSite,
  week: string
): Promise<GenerationResult> {
  const [dataSummary, historySummary] = await Promise.all([
    buildDataSummary(s),
    buildHistorySummary(s.site),
  ]);

  if (dataSummary.trim() === "") {
    return { site: s.site, generated: 0, skipped: true };
  }

  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: PROPOSAL_SCHEMA } },
    messages: [
      {
        role: "user",
        content: `対象サイト: ${s.site}\n生成週: ${week} の週\n\n# 観測データ\n\n${dataSummary}\n\n# 過去の提案と対応状況\n\n${historySummary}\n\n上記を踏まえて、今週の提案を作成してください。`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    return { site: s.site, generated: 0, error: "生成が拒否されました（refusal）" };
  }

  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  const parsed = JSON.parse(text) as {
    proposals: Array<{ kind: "seo" | "ux"; title: string; body: string; basis: string }>;
  };

  const now = new Date().toISOString();
  const rows: SeoProposal[] = parsed.proposals.slice(0, 5).map((p) => ({
    id: randomUUID(),
    site: s.site,
    week,
    kind: p.kind === "ux" ? "ux" : "seo",
    title: p.title.slice(0, 200),
    body: p.body,
    basis: p.basis,
    status: "未対応",
    memo: null,
    effect_note: null,
    created_at: now,
    updated_at: now,
  }));

  const generated = await insertProposals(rows);
  return { site: s.site, generated };
}
