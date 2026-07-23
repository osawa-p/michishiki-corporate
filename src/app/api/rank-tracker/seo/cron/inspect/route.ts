// SEO観測ツールのURL検査ローテーション専用エンドポイント。
// 以前は日次取り込み（../route.ts）のフェーズBとして同一関数内で実行していたが、
// GSC/GA4取り込み（フェーズA）が重くなった日に検査へ時間が回らず「1日1サイト」に
// 縮退したため、別インボケーションへ分離して独自の実行時間枠（maxDuration）を持たせた。
// Vercel Hobby は cron 2本上限で3本目を張れないため、日次取り込みcronの冒頭から
// HTTP で発火される（fan-out）。middleware は /api/rank-tracker/seo/cron 配下を
// 認証対象外にしており、CRON_SECRET の Bearer 照合が唯一のゲート。
//
// ■ チェーン実行（日次上限 > 1インボケーション処理量への対応）
// URL Inspection API のクォータは 2,000件/日・600件/分（プロパティ単位）だが、
// 1インボケーション（240秒）で捌けるのは千件前後。inspection_daily_limit を
// 大きく設定しても消化できるよう、時間切れ（timedOut）で終わったラウンドは
// 自分自身を ?round=N+1 で再発火して続きを処理する。日次予算はBQの実績
// （countInspectionsToday）から毎ラウンド差し引くため、多重実行しても
// 上限を超えない。全サイトの予算を消化し切る（timedOut せず完了する）か、
// MAX_ROUNDS 到達でチェーンは止まる。
//
// 既定では 202 を即返し、after() で応答後にローテーションを実行する（発火側の待ちを
// 数百msに抑えるため）。?sync=1 は1ラウンドだけ同期実行して結果JSONを返す
// （手動確認用・チェーンはしない）。
import { NextResponse } from "next/server";
import { after } from "next/server";
import {
  listSeoSites,
  listInspectionTargets,
  markUrlsInspected,
  insertInspections,
  countInspectionsToday,
} from "@/lib/seo-monitor/bigquery";
import { inspectUrl, classifyIndexTarget } from "@/lib/seo-monitor/google";
import { invalidateSeoCache } from "@/lib/seo-monitor/cached";
import type { GscInspectionRow } from "@/lib/seo-monitor/types";

export const runtime = "nodejs";
export const maxDuration = 300;

// 新しい処理を始めない残り時間のしきい値（maxDuration に対する余白）。
// 環境変数はローカルでのチェーン動作確認用（本番では未設定のまま）。
const TIME_BUDGET_MS = Number(process.env.SEO_INSPECT_BUDGET_MS ?? 240_000);
// URL検査の並列数。URL Inspection API は1コール6〜8秒かかるため、並列16で
// 実測110〜260件/分とクォータ（600件/分・プロパティ単位）に収まる。
// 32並列では初回稼働日に散発的な429（バースト超過とみられる）が出たため下げた。
const INSPECT_CONCURRENCY = 16;
// チェーンの安全弁。日次上限 1,800件×5サイト=9,000件/日 ÷ 1ラウンド500〜千件
// ≒ 10〜18ラウンドの想定に対して余裕を持たせた値。
const MAX_ROUNDS = 30;
// 一度検査したURLの再検査間隔（日）。小規模サイトが毎日同じURLを再検査して
// クォータを浪費しないための下限。プロパティのクォータはクライアント側の
// ツールと共有のことがある（例: rasik）ため、使い切らない運用にする。
const INSPECT_MIN_INTERVAL_DAYS = 7;
// 429（レート超過）を再試行するまでの待ち時間。分単位のレート枠が回復するのを待つ
const RETRY_WAIT_MS = 25_000;
// 一時エラー（5xx・ネットワーク断）でサイトを打ち切るまでの許容数
const MAX_TRANSIENT_FAILS = 12;

// GaxiosError などから HTTPステータスを取り出す（ネットワーク断は undefined）
function errorStatus(reason: unknown): number | undefined {
  if (reason && typeof reason === "object") {
    const r = reason as { response?: { status?: number }; status?: number; code?: unknown };
    if (typeof r.response?.status === "number") return r.response.status;
    if (typeof r.status === "number") return r.status;
    if (typeof r.code === "number") return r.code;
  }
  return undefined;
}

type InspectSummary = {
  site: string;
  inspected: number;
  excluded: number;
  errors: string[];
};

type RotationResult = {
  ok: boolean;
  timedOut: boolean;
  sites: number;
  failed: number;
  totalInspected: number;
  summary: InspectSummary[];
};

async function runRotation(): Promise<RotationResult> {
  const startedAt = Date.now();
  const timeLeft = () => TIME_BUDGET_MS - (Date.now() - startedAt);
  const fetchedAt = new Date().toISOString();

  const sites = await listSeoSites();
  const gscSites = sites.filter((s) => s.gsc_enabled && s.gsc_site_url);
  // 処理順を日替わりで回すことで、時間切れでも特定サイトが飢餓しないようにする
  const offset = gscSites.length > 0 ? new Date().getUTCDate() % gscSites.length : 0;
  const rotated = [...gscSites.slice(offset), ...gscSites.slice(0, offset)];

  let timedOut = false;
  const summaries: InspectSummary[] = [];

  for (const s of rotated) {
    if (timeLeft() <= 30_000) {
      timedOut = true;
      break;
    }
    // 日次予算の残り = 上限 − 当日実績。前のラウンドの消化分もここで差し引かれる
    const doneToday = await countInspectionsToday(s.site);
    const budget = s.inspection_daily_limit - doneToday;
    if (budget <= 0) continue;

    const sum: InspectSummary = { site: s.site, inspected: 0, excluded: 0, errors: [] };
    summaries.push(sum);
    try {
      const targets = await listInspectionTargets(s.site, budget, INSPECT_MIN_INTERVAL_DAYS);
      const inspRows: GscInspectionRow[] = [];
      const marks: Array<{ url: string; indexTarget: boolean; excludeReason: string | null }> = [];
      let aborted = false;
      let transientFails = 0;

      // 検査結果を1件ずつ振り分ける。戻り値は429で再試行すべきURL。
      // エラーは3分類: 429=レート/クォータ（再試行→ダメならサイト打ち切り）、
      // その他4xx=URL固有の恒久エラー（対象外化して先へ進む）、
      // 5xx・ネットワーク断=一時エラー（今回スキップ。多発時のみ打ち切り）。
      // 1件の失敗でサイト全体を打ち切らないこと（初回稼働日に散発エラーで
      // 検査が数十件で止まり、チェーンごと早期終了する事故があった）。
      const handleResults = (
        urls: string[],
        results: PromiseSettledResult<Awaited<ReturnType<typeof inspectUrl>>>[],
        isRetry: boolean
      ): string[] => {
        const retry: string[] = [];
        for (let j = 0; j < results.length; j++) {
          const res = results[j];
          const url = urls[j];
          if (res.status === "rejected") {
            const status = errorStatus(res.reason);
            if (status === 429) {
              if (isRetry) {
                console.error(`[seo-monitor] クォータ超過のため本日は打ち切り (${s.site})`);
                if (!sum.errors.includes("quota")) sum.errors.push("quota");
                aborted = true;
              } else {
                retry.push(url);
              }
            } else if (status != null && status >= 400 && status < 500) {
              console.error(`[seo-monitor] URL検査が拒否されました (${s.site} ${url}): HTTP ${status}`);
              marks.push({ url, indexTarget: false, excludeReason: `検査エラー（HTTP ${status}）` });
            } else {
              console.error(`[seo-monitor] URL検査に失敗 (${s.site} ${url}):`, res.reason);
              transientFails += 1;
              if (transientFails >= MAX_TRANSIENT_FAILS) {
                sum.errors.push("transient");
                aborted = true;
              }
            }
            continue;
          }
          const r = res.value;
          const cls = classifyIndexTarget(url, r);
          inspRows.push({
            site: s.site,
            url,
            inspected_at: fetchedAt,
            verdict: r.verdict,
            coverage_state: r.coverageState,
            indexing_state: r.indexingState,
            page_fetch_state: r.pageFetchState,
            robots_txt_state: r.robotsTxtState,
            google_canonical: r.googleCanonical,
            user_canonical: r.userCanonical,
            canonical_match:
              r.googleCanonical == null
                ? null
                : cls.excludeReason !== "正規URLが別（canonical不一致）",
            last_crawl_time: r.lastCrawlTime,
          });
          marks.push({ url, indexTarget: cls.indexTarget, excludeReason: cls.excludeReason });
        }
        return retry;
      };

      for (let i = 0; i < targets.length && !aborted; i += INSPECT_CONCURRENCY) {
        if (timeLeft() <= 30_000) {
          timedOut = true;
          break;
        }
        const batch = targets.slice(i, i + INSPECT_CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map((url) => inspectUrl(s.gsc_site_url!, url))
        );
        const retryUrls = handleResults(batch, results, false);
        if (retryUrls.length > 0 && !aborted) {
          // 429はバースト起因のことがあるため、間隔を空けて1回だけ再試行する
          if (timeLeft() <= RETRY_WAIT_MS + 30_000) {
            timedOut = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, RETRY_WAIT_MS));
          const retryResults = await Promise.allSettled(
            retryUrls.map((url) => inspectUrl(s.gsc_site_url!, url))
          );
          handleResults(retryUrls, retryResults, true);
        }
      }

      await insertInspections(inspRows);
      await markUrlsInspected(s.site, marks);
      sum.inspected = inspRows.length;
      sum.excluded = marks.filter((m) => !m.indexTarget).length;
    } catch (err) {
      console.error(`[seo-monitor] URL検査ローテーションに失敗 (${s.site}):`, err);
      sum.errors.push("inspection-rotation");
    }
  }

  invalidateSeoCache();

  const failed = summaries.filter((s) => s.errors.length > 0).length;
  const totalInspected = summaries.reduce((acc, s) => acc + s.inspected, 0);
  // 全サイト失敗（かつ処理対象があった）ときのみ ok=false（部分失敗は summary に残す）
  const ok = summaries.length === 0 || failed < summaries.length;
  return { ok, timedOut, sites: summaries.length, failed, totalInspected, summary: summaries };
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const reqUrl = new URL(request.url);
  const round = Math.max(1, Number(reqUrl.searchParams.get("round")) || 1);

  if (reqUrl.searchParams.get("sync") === "1") {
    try {
      const result = await runRotation();
      return NextResponse.json(result, { status: result.ok ? 200 : 500 });
    } catch (err) {
      console.error("[seo-monitor] URL検査ローテーションが失敗しました:", err);
      return NextResponse.json(
        { ok: false, error: "URL検査ローテーションに失敗しました。" },
        { status: 500 }
      );
    }
  }

  after(async () => {
    try {
      const result = await runRotation();
      console.log(
        `[seo-monitor] URL検査ローテーション完了 (round ${round}):`,
        JSON.stringify(result)
      );
      // 時間切れ＝まだ日次予算が残っている可能性が高いので、次のラウンドを発火する。
      // 進捗ゼロ（予算枯渇や全滅）のラウンドからは発火せず、チェーンは自然に止まる。
      if (result.timedOut && result.totalInspected > 0 && round < MAX_ROUNDS) {
        const base = process.env.VERCEL_PROJECT_PRODUCTION_URL
          ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
          : reqUrl.origin;
        const res = await fetch(
          `${base}/api/rank-tracker/seo/cron/inspect?round=${round + 1}`,
          { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(10_000) }
        );
        if (!res.ok) {
          console.error(`[seo-monitor] 次ラウンドの発火に失敗しました (round ${round + 1}):`, res.status);
        }
      } else if (round >= MAX_ROUNDS && result.timedOut) {
        console.error(`[seo-monitor] URL検査チェーンが MAX_ROUNDS(${MAX_ROUNDS}) に達しました`);
      }
    } catch (err) {
      console.error("[seo-monitor] URL検査ローテーションが失敗しました:", err);
    }
  });
  return NextResponse.json({ ok: true, accepted: true, round }, { status: 202 });
}
