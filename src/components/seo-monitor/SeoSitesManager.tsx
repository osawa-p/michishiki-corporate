"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_SEO_SITE, type SeoSite } from "@/lib/seo-monitor/types";

type FormState = {
  site: string;
  gsc_enabled: boolean;
  gsc_site_url: string;
  ga4_enabled: boolean;
  ga4_property_id: string;
  sitemap_url: string;
  inspection_daily_limit: string;
  stale_days: string;
};

const EMPTY: FormState = {
  site: "",
  gsc_enabled: false,
  gsc_site_url: "",
  ga4_enabled: false,
  ga4_property_id: "",
  sitemap_url: "",
  inspection_daily_limit: String(DEFAULT_SEO_SITE.inspection_daily_limit),
  stale_days: String(DEFAULT_SEO_SITE.stale_days),
};

function toForm(s: SeoSite): FormState {
  return {
    site: s.site,
    gsc_enabled: s.gsc_enabled,
    gsc_site_url: s.gsc_site_url ?? "",
    ga4_enabled: s.ga4_enabled,
    ga4_property_id: s.ga4_property_id ?? "",
    sitemap_url: s.sitemap_url ?? "",
    inspection_daily_limit: String(s.inspection_daily_limit),
    stale_days: String(s.stale_days),
  };
}

export default function SeoSitesManager({
  initial,
  loadError,
}: {
  initial: SeoSite[];
  loadError: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/rank-tracker/seo/sites", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          site: form.site,
          gsc_enabled: form.gsc_enabled,
          gsc_site_url: form.gsc_site_url || null,
          ga4_enabled: form.ga4_enabled,
          ga4_property_id: form.ga4_property_id || null,
          sitemap_url: form.sitemap_url || null,
          inspection_daily_limit: Number(form.inspection_daily_limit),
          stale_days: Number(form.stale_days),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setMessage(data.error ?? "保存に失敗しました。");
      } else {
        setMessage("保存しました。");
        setForm(EMPTY);
        setEditing(false);
        router.refresh();
      }
    } catch {
      setMessage("保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <p className="text-sm text-red-700">
        設定の取得に失敗しました。時間をおいて再読み込みしてください。
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {initial.length === 0 ? (
        <p className="text-sm text-ink-soft">
          まだ対象サイトがありません。下のフォームから追加してください。
        </p>
      ) : (
        <div className="overflow-x-auto border border-line bg-white">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-paper text-ink-soft">
                <th className="px-3 py-2 text-left">サイト</th>
                <th className="px-3 py-2 text-left">GSC取得</th>
                <th className="px-3 py-2 text-left">URL検査/日</th>
                <th className="px-3 py-2 text-left">GA4取得</th>
                <th className="px-3 py-2 text-left">GA4プロパティ</th>
                <th className="px-3 py-2 text-left">未クロールしきい値</th>
                <th className="px-3 py-2 text-left"></th>
              </tr>
            </thead>
            <tbody>
              {initial.map((s) => (
                <tr key={s.site} className="border-t border-line">
                  <td className="px-3 py-2 font-semibold">{s.site}</td>
                  <td className="px-3 py-2">
                    {s.gsc_enabled ? (
                      <span className="inline-block px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700">
                        有効
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 text-[11px] font-semibold bg-gray-100 text-gray-500">
                        対象外
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {s.gsc_enabled ? `${s.inspection_daily_limit}件` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {s.ga4_enabled ? (
                      <span className="inline-block px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700">
                        有効
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 text-[11px] font-semibold bg-gray-100 text-gray-500">
                        対象外
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{s.ga4_property_id ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{s.stale_days}日</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => {
                        setForm(toForm(s));
                        setEditing(true);
                        setMessage(null);
                      }}
                      className="text-bronze-deep underline hover:no-underline"
                    >
                      編集
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="border border-line bg-white p-6">
        <h2 className="text-sm font-semibold mb-4">{editing ? `${form.site} の設定` : "サイトを追加"}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs text-ink-soft">
            ドメイン（例: michi-biki.jp）
            <input
              type="text"
              value={form.site}
              disabled={editing}
              onChange={(e) => set("site", e.target.value)}
              className="mt-1 w-full border border-line bg-white px-3 py-2 text-sm disabled:bg-paper"
            />
          </label>
          <label className="text-xs text-ink-soft">
            sitemap URL（空欄なら https://ドメイン/sitemap.xml）
            <input
              type="text"
              value={form.sitemap_url}
              onChange={(e) => set("sitemap_url", e.target.value)}
              className="mt-1 w-full border border-line bg-white px-3 py-2 text-sm"
            />
          </label>

          <div className="sm:col-span-2 border-t border-line pt-4">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.gsc_enabled}
                onChange={(e) => set("gsc_enabled", e.target.checked)}
              />
              サーチコンソール取得を有効にする
            </label>
            <p className="mt-1 text-[11px] text-ink-faint">
              クライアント要件でGSCが使えないサイト（例: もしも様）はOFFのまま。GA4のみの表示になります。
            </p>
          </div>
          <label className="text-xs text-ink-soft">
            GSCプロパティ（sc-domain:example.com または https://example.com/）
            <input
              type="text"
              value={form.gsc_site_url}
              onChange={(e) => set("gsc_site_url", e.target.value)}
              className="mt-1 w-full border border-line bg-white px-3 py-2 text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="text-xs text-ink-soft">
              URL検査/日（1〜2000）
              <input
                type="number"
                value={form.inspection_daily_limit}
                onChange={(e) => set("inspection_daily_limit", e.target.value)}
                className="mt-1 w-full border border-line bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs text-ink-soft">
              未クロールしきい値（日）
              <input
                type="number"
                value={form.stale_days}
                onChange={(e) => set("stale_days", e.target.value)}
                className="mt-1 w-full border border-line bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="sm:col-span-2 border-t border-line pt-4">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.ga4_enabled}
                onChange={(e) => set("ga4_enabled", e.target.checked)}
              />
              GA4取得を有効にする
            </label>
          </div>
          <label className="text-xs text-ink-soft">
            GA4プロパティID（数値。例: 123456789）
            <input
              type="text"
              value={form.ga4_property_id}
              onChange={(e) => set("ga4_property_id", e.target.value)}
              className="mt-1 w-full border border-line bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving || !form.site}
            className="px-5 py-2 text-sm font-semibold bg-bronze-deep text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            {saving ? "保存中…" : "保存"}
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setForm(EMPTY);
                setEditing(false);
                setMessage(null);
              }}
              className="text-xs text-ink-soft underline hover:no-underline"
            >
              キャンセル
            </button>
          )}
          {message && <span className="text-xs text-ink-soft">{message}</span>}
        </div>
        <p className="mt-4 text-[11px] text-ink-faint leading-relaxed">
          事前準備: BigQueryと同じサービスアカウントを、Search Console プロパティ（制限付き以上）と
          GA4 プロパティ（閲覧者）に追加してください。追加されていないと取得はエラーになります。
        </p>
      </div>
    </div>
  );
}
