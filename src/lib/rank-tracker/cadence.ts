// 定期取得の頻度定義。サーバー/クライアント両方から参照する（依存なし）。
// cron は毎日起動し、next_run_at が期限切れのキーワードだけを計測する。
// days は「計測後に次回をどれだけ先に置くか」の日数。

export const CADENCES = [
  { value: "daily", label: "毎日", days: 1 },
  { value: "thrice_weekly", label: "週3", days: 2 },
  { value: "every3days", label: "3日ごと", days: 3 },
  { value: "twice_weekly", label: "週2", days: 4 },
  { value: "weekly", label: "週1", days: 7 },
  { value: "monthly", label: "月1", days: 30 },
  { value: "stopped", label: "停止", days: null },
] as const;

export type Cadence = (typeof CADENCES)[number]["value"];

export const DEFAULT_CADENCE: Cadence = "weekly";

const VALUES = new Set<string>(CADENCES.map((c) => c.value));

export function isCadence(v: unknown): v is Cadence {
  return typeof v === "string" && VALUES.has(v);
}

export function cadenceLabel(v: string): string {
  return CADENCES.find((c) => c.value === v)?.label ?? v;
}
