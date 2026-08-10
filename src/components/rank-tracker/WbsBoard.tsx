"use client";

import { useMemo, useState } from "react";

// WBSデータの型（実体は src/data/wbs-tasks.json。F:\michi\remedi\keisoku\tasks.js が正で、
// scripts/wbs-publish.mjs（michi側）が JSON へ変換して同期する）
export type WbsTask = {
  id: string;
  pj: string;
  task: string;
  dep: string;
  pri: 1 | 2 | 3;
  st: "todo" | "doing" | "wait" | "done";
  due: string;
};
export type WbsData = {
  updated: string;
  pjMeta: Record<string, { label: string; note: string; stale: boolean }>;
  tasks: WbsTask[];
};

const ST_META: Record<WbsTask["st"], { label: string; dot: string }> = {
  doing: { label: "▶ 進行中", dot: "#2a78d6" },
  todo: { label: "◻ 未着手", dot: "#8b877c" },
  wait: { label: "⏸ 待ち", dot: "#fab219" },
  done: { label: "✔ 完了", dot: "#0ca30c" },
};
const PRI_LABEL: Record<number, string> = { 1: "★ 最優先", 2: "高", 3: "通常" };
const ST_KEYS = ["doing", "todo", "wait", "done"] as const;

function dueState(t: WbsTask, today: number): "over" | "soon" | "" {
  if (t.st === "done" || !/^\d{4}-\d{2}-\d{2}$/.test(t.due)) return "";
  const diff = (new Date(`${t.due}T00:00:00`).getTime() - today) / 86400000;
  if (diff < 0) return "over";
  if (diff <= 3) return "soon";
  return "";
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs transition-colors ${
        on ? "border-ink bg-ink font-semibold text-paper" : "border-line bg-white/70 text-ink-soft hover:border-ink-faint"
      }`}
    >
      {children}
    </button>
  );
}

export default function WbsBoard({ data }: { data: WbsData }) {
  const [pj, setPj] = useState<string>("all");
  const [st, setSt] = useState<string>("all");
  const [q, setQ] = useState("");
  // 期限判定は閲覧時点の日付で行う（SSRとの差異を避けるためクライアント側でのみ計算）
  const today = useMemo(() => new Date(new Date().toDateString()).getTime(), []);

  const pjKeys = Object.keys(data.pjMeta);
  const query = q.trim().toLowerCase();
  const visible = (t: WbsTask) =>
    (pj === "all" || t.pj === pj) &&
    (st === "all" || t.st === st) &&
    (!query || `${t.task}${t.dep}${t.id}`.toLowerCase().includes(query));

  const all = data.tasks;
  const shown = all.filter(visible);
  const count = (s: WbsTask["st"]) => all.filter((t) => t.st === s).length;
  const overdue = all.filter((t) => dueState(t, today) === "over").length;
  const staleNote = pjKeys.filter((k) => data.pjMeta[k].stale).map((k) => data.pjMeta[k].label);

  const tiles: { label: string; value: number; note: string; cls?: string }[] = [
    { label: "全タスク", value: all.length, note: `表示中 ${shown.length}` },
    { label: "▶ 進行中", value: count("doing"), note: "同時進行レーン", cls: "text-[#2a78d6]" },
    { label: "◻ 未着手", value: count("todo"), note: `うち最優先 ${all.filter((t) => t.st === "todo" && t.pri === 1).length}` },
    { label: "⏸ 待ち・ブロック", value: count("wait"), note: "他者・前工程待ち" },
    { label: "⚠ 期限超過", value: overdue, note: "要棚卸し（鮮度注意）", cls: "text-[#d03b3b]" },
    { label: "✔ 完了", value: count("done"), note: "", cls: "text-[#0ca30c]" },
  ];

  return (
    <>
      <section className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">WBS</p>
          <h1 className="font-serif text-3xl md:text-4xl font-semibold">大沢タスクWBS</h1>
          <p className="mt-4 text-sm text-ink-soft leading-relaxed">
            全プロジェクト横断のタスクボード（管理者専用）。データ最終更新: {data.updated}。
            正は各プロジェクトの CURRENT.md（更新は F:\michi\remedi\keisoku\tasks.js → wbs-publish.mjs）。
          </p>
          {staleNote.length > 0 && (
            <p className="mt-3 inline-block rounded border border-line bg-white/70 px-3 py-2 text-xs text-ink-soft">
              ⚠️ 鮮度注意: {staleNote.join("、")} は CURRENT が古く、完了済みタスクが混在している可能性があります
            </p>
          )}
        </div>
      </section>

      <section className="py-8 md:py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* サマリータイル */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6 mb-6">
            {tiles.map((tl) => (
              <div key={tl.label} className="rounded-lg border border-line bg-white/70 px-3.5 py-3">
                <p className="text-xs text-ink-soft">{tl.label}</p>
                <p className={`text-2xl font-bold leading-tight ${tl.cls ?? "text-ink"}`}>{tl.value}</p>
                <p className="text-[11px] text-ink-faint">{tl.note}</p>
              </div>
            ))}
          </div>

          {/* フィルタ */}
          <div className="mb-6 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-ink-faint">PJ:</span>
            <Chip on={pj === "all"} onClick={() => setPj("all")}>すべて</Chip>
            {pjKeys.map((k) => (
              <Chip key={k} on={pj === k} onClick={() => setPj(k)}>{k}</Chip>
            ))}
            <span className="mx-2 hidden h-4 w-px bg-line sm:inline-block" />
            <span className="mr-1 text-xs text-ink-faint">状態:</span>
            <Chip on={st === "all"} onClick={() => setSt("all")}>すべて</Chip>
            {ST_KEYS.map((k) => (
              <Chip key={k} on={st === k} onClick={() => setSt(k)}>{ST_META[k].label}</Chip>
            ))}
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="検索…"
              className="ml-auto w-40 rounded border border-line bg-white/70 px-2.5 py-1 text-xs text-ink focus:outline-2 focus:outline-bronze-deep"
            />
          </div>

          {/* プロジェクト別テーブル */}
          {pjKeys.map((key) => {
            const meta = data.pjMeta[key];
            const rows = all.filter((t) => t.pj === key);
            const rowsShown = rows.filter(visible).sort((a, b) => a.pri - b.pri || a.id.localeCompare(b.id));
            if (rowsShown.length === 0) return null;
            return (
              <div key={key} className="mb-6 rounded-lg border border-line bg-white/70 p-4 sm:p-5">
                <h2 className="font-serif text-lg font-semibold">
                  {meta.label}
                  <span className="ml-2 font-sans text-xs font-normal text-ink-faint">
                    {rowsShown.length}/{rows.length}件
                  </span>
                </h2>
                <p className={`mb-3 mt-1 text-[11px] ${meta.stale ? "text-[#b3352e]" : "text-ink-faint"}`}>
                  {meta.stale ? "⚠️ " : ""}{meta.note}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[13px]">
                    <thead>
                      <tr className="border-b border-ink-faint/40 text-left text-[11px] text-ink-faint">
                        <th className="whitespace-nowrap px-2 py-1.5 font-medium">ID</th>
                        <th className="px-2 py-1.5 font-medium">タスク</th>
                        <th className="whitespace-nowrap px-2 py-1.5 font-medium">優先度</th>
                        <th className="whitespace-nowrap px-2 py-1.5 font-medium">状態</th>
                        <th className="whitespace-nowrap px-2 py-1.5 font-medium">期限</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rowsShown.map((t) => {
                        const ds = dueState(t, today);
                        return (
                          <tr key={t.id} className="border-b border-line last:border-b-0 align-top">
                            <td className="whitespace-nowrap px-2 py-2 text-xs text-ink-faint tabular-nums">{t.id}</td>
                            <td className="min-w-56 px-2 py-2 text-ink">
                              {t.task}
                              {t.dep && <span className="block text-[11px] text-ink-faint">└ {t.dep}</span>}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2">
                              <span className={t.pri === 1 ? "font-bold" : t.pri === 2 ? "font-semibold" : "text-ink-soft"}>
                                {PRI_LABEL[t.pri]}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-2 py-2">
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-paper px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: ST_META[t.st].dot }} />
                                {ST_META[t.st].label}
                              </span>
                            </td>
                            <td
                              className={`whitespace-nowrap px-2 py-2 tabular-nums ${
                                ds === "over" ? "font-bold text-[#b3352e]" : ds === "soon" ? "font-bold text-ink" : "text-ink-soft"
                              }`}
                            >
                              {t.due}
                              {ds === "over" ? " ⚠超過" : ds === "soon" ? " ⏰" : ""}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
