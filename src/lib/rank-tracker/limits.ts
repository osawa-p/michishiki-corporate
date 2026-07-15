// サイト別の制限・クレジット（JINAトークン）計算。サーバー/クライアント両方から使う（依存なし）。
//
// クレジットの考え方:
//   JINA検索は1リクエスト（Google 1ページ≒10件）につき固定1万トークン。
//   深度d位までの計測 ≒ (ceil(d/10)+1)ページ → 30位=4万 / 50位=6万 / 100位=11万トークン。
import { CADENCES, type Cadence } from "./cadence";

export const DEPTH_OPTIONS = [30, 50, 100] as const;
export type Depth = (typeof DEPTH_OPTIONS)[number];

export function isDepth(v: unknown): v is Depth {
  return typeof v === "number" && (DEPTH_OPTIONS as readonly number[]).includes(v);
}

// 1回の計測で消費するトークン数（+1ページは取りこぼし緩衝分。jina.ts の maxPages と同じ式）
export function tokensPerMeasure(depth: number): number {
  return (Math.ceil(depth / 10) + 1) * 10_000;
}

const DAYS_BY_CADENCE = new Map<string, number | null>(CADENCES.map((c) => [c.value, c.days]));

export function cadenceDays(cadence: string): number | null {
  return DAYS_BY_CADENCE.get(cadence) ?? null;
}

// サイト別の制限。null は無制限。
export type SiteSettings = {
  domain: string;
  max_keywords: number | null;
  max_depth: number; // 30 / 50 / 100
  min_interval_days: number; // これ未満の間隔（=高頻度）は不可。1=毎日OK, 7=週1まで
  monthly_budget: number | null; // 月間クレジット予算（トークン）
};

export const DEFAULT_SITE_SETTINGS: Omit<SiteSettings, "domain"> = {
  max_keywords: null,
  max_depth: 100,
  min_interval_days: 1,
  monthly_budget: null,
};

// 頻度がサイト設定で許可されているか（停止は常に可）
export function isCadenceAllowed(cadence: Cadence, settings: Pick<SiteSettings, "min_interval_days">): boolean {
  const days = cadenceDays(cadence);
  if (days == null) return true; // stopped
  return days >= settings.min_interval_days;
}

// 予測月間消費（トークン）。サイトの深度設定で、有効キーワードが設定頻度どおり
// 30日間計測された場合の合計。複数サイトで同一キーワードを追跡している場合の
// 重複排除は行わない（サイト単位では上限側に倒した見積もりになる）。
export function predictMonthlyTokens(
  cadences: Cadence[],
  settings: Pick<SiteSettings, "max_depth">
): number {
  const per = tokensPerMeasure(settings.max_depth);
  let total = 0;
  for (const c of cadences) {
    const days = cadenceDays(c);
    if (days == null) continue;
    total += per * (30 / days);
  }
  return Math.round(total);
}

export function formatTokens(n: number): string {
  if (n >= 10_000) {
    const man = n / 10_000;
    return `${Number.isInteger(man) ? man : man.toFixed(1)}万`;
  }
  return String(n);
}
