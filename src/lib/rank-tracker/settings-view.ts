// サイト設定画面/APIで使う集計ビュー（設定＋当月消費＋予測消費＋頻度分布）。
import {
  listTrackedDomains,
  listTrackedKeywords,
  listSiteSettings,
  fetchMonthlyConsumption,
} from "./bigquery";
import type { Cadence } from "./cadence";
import { DEFAULT_SITE_SETTINGS, predictMonthlyTokens } from "./limits";

export type SiteSettingsView = {
  domain: string;
  max_keywords: number | null;
  max_depth: number;
  min_interval_days: number;
  monthly_budget: number | null;
  configured: boolean; // site_settings に行があるか
  keywords: number;
  cadence_counts: Partial<Record<Cadence, number>>;
  used_tokens: number;
  measurements: number;
  predicted_tokens: number;
};

export async function buildSiteSettingsView(): Promise<SiteSettingsView[]> {
  const [domains, allKeywords, settings, consumption] = await Promise.all([
    listTrackedDomains(),
    listTrackedKeywords(),
    listSiteSettings(),
    fetchMonthlyConsumption(),
  ]);
  const settingsBy = new Map(settings.map((s) => [s.domain, s]));
  const usedBy = new Map(consumption.map((c) => [c.domain, c]));

  // 「設定はあるがキーワードが0件」のサイトも編集できるよう、両方の和集合を対象にする
  const names = [
    ...new Set([...domains.map((d) => d.domain), ...settings.map((s) => s.domain)]),
  ].sort();

  return names.map((domain) => {
    const s = settingsBy.get(domain);
    const eff = s ?? { domain, ...DEFAULT_SITE_SETTINGS };
    const kws = allKeywords.filter((k) => k.target_domain === domain);
    const counts: Partial<Record<Cadence, number>> = {};
    for (const k of kws) counts[k.cadence] = (counts[k.cadence] ?? 0) + 1;
    const used = usedBy.get(domain);
    return {
      domain,
      max_keywords: eff.max_keywords,
      max_depth: eff.max_depth,
      min_interval_days: eff.min_interval_days,
      monthly_budget: eff.monthly_budget,
      configured: !!s,
      keywords: kws.length,
      cadence_counts: counts,
      used_tokens: used?.tokens ?? 0,
      measurements: used?.measurements ?? 0,
      predicted_tokens: predictMonthlyTokens(kws.map((k) => k.cadence), eff),
    };
  });
}
