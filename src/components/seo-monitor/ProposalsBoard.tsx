"use client";

import { useMemo, useState } from "react";
import { PROPOSAL_STATUSES, type ProposalStatus, type SeoProposal } from "@/lib/seo-monitor/types";

// 週次AI提案の一覧＋対応記録。ステータス・メモはBQに保存され、
// 翌週の生成時に「前回までの対応状況」としてClaudeへ渡される（Phase 2）。
export default function ProposalsBoard({ initial }: { initial: SeoProposal[] }) {
  const [items, setItems] = useState(initial);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [kindFilter, setKindFilter] = useState<string>("");

  const filtered = useMemo(
    () =>
      items.filter(
        (p) =>
          (!statusFilter || p.status === statusFilter) && (!kindFilter || p.kind === kindFilter)
      ),
    [items, statusFilter, kindFilter]
  );

  const weeks = useMemo(() => {
    const map = new Map<string, SeoProposal[]>();
    for (const p of filtered) {
      const arr = map.get(p.week) ?? [];
      arr.push(p);
      map.set(p.week, arr);
    }
    return [...map.entries()];
  }, [filtered]);

  function onSaved(updated: SeoProposal) {
    setItems((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <label className="inline-flex items-center gap-2 text-ink-soft">
          ステータス
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-line bg-white px-2 py-1.5"
          >
            <option value="">すべて</option>
            {PROPOSAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-2 text-ink-soft">
          種別
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="border border-line bg-white px-2 py-1.5"
          >
            <option value="">すべて</option>
            <option value="seo">SEO</option>
            <option value="ux">UX</option>
          </select>
        </label>
        <span className="text-ink-faint">
          {filtered.length.toLocaleString("ja-JP")} / {items.length.toLocaleString("ja-JP")} 件
        </span>
      </div>

      {weeks.map(([week, proposals]) => (
        <div key={week}>
          <h2 className="text-sm font-semibold mb-3">
            {week} の週<span className="ml-2 text-[11px] font-normal text-ink-faint">{proposals.length}件</span>
          </h2>
          <div className="space-y-4">
            {proposals.map((p) => (
              <ProposalCard key={p.id} proposal={p} onSaved={onSaved} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function statusChipClass(s: ProposalStatus): string {
  switch (s) {
    case "実装する":
      return "bg-blue-50 text-blue-700";
    case "実装済み":
      return "bg-emerald-50 text-emerald-700";
    case "一部対応":
      return "bg-amber-50 text-amber-700";
    case "実装しない":
      return "bg-gray-100 text-gray-500";
    default:
      return "bg-red-50 text-red-700";
  }
}

function ProposalCard({
  proposal,
  onSaved,
}: {
  proposal: SeoProposal;
  onSaved: (p: SeoProposal) => void;
}) {
  const [status, setStatus] = useState<ProposalStatus>(proposal.status);
  const [memo, setMemo] = useState(proposal.memo ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const dirty = status !== proposal.status || memo !== (proposal.memo ?? "");

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/rank-tracker/seo/proposals", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: proposal.id, status, memo: memo || null }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setMessage(data.error ?? "保存に失敗しました。");
      } else {
        setMessage("保存しました。");
        onSaved({ ...proposal, status, memo: memo || null });
        setTimeout(() => setMessage(null), 2000);
      }
    } catch {
      setMessage("保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-line bg-white p-5">
      <div className="flex flex-wrap items-baseline gap-2">
        <span
          className={`inline-block px-2 py-0.5 text-[11px] font-semibold ${
            proposal.kind === "seo" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {proposal.kind === "seo" ? "SEO" : "UX"}
        </span>
        <span className={`inline-block px-2 py-0.5 text-[11px] font-semibold ${statusChipClass(proposal.status)}`}>
          {proposal.status}
        </span>
        <h3 className="text-sm font-semibold">{proposal.title}</h3>
        <span className="text-[11px] text-ink-faint">{proposal.site}</span>
      </div>
      {proposal.basis && <p className="mt-1.5 text-[11px] text-ink-faint">根拠: {proposal.basis}</p>}
      <p className="mt-2 text-sm text-ink-soft leading-relaxed whitespace-pre-wrap">{proposal.body}</p>
      {proposal.effect_note && (
        <p className="mt-2 text-xs text-emerald-700 bg-emerald-50 px-3 py-2">
          効果: {proposal.effect_note}
        </p>
      )}

      <div className="mt-4 pt-3 border-t border-line flex flex-wrap items-center gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as ProposalStatus)}
          className="border border-line bg-white px-2 py-1.5 text-xs"
        >
          {PROPOSAL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="メモ（例: 一部のみ対応、◯◯は保留）"
          maxLength={2000}
          className="flex-1 min-w-[220px] border border-line bg-white px-3 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-bronze-deep"
        />
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="px-4 py-1.5 text-xs font-semibold bg-bronze-deep text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {saving ? "保存中…" : "保存"}
        </button>
        {message && <span className="text-[11px] text-ink-soft">{message}</span>}
      </div>
    </div>
  );
}
