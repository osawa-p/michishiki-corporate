"use client";

import { useMemo, useState } from "react";

// WBSデータの型（実体は src/data/wbs-tasks.json。F:\michi\remedi\keisoku\tasks.js が正で、
// michi側の auto-sync（wbs-publish.mjs）が JSON へ変換して自動同期する）
export type WbsTask = {
  id: string;
  pj: string;
  task: string;
  dep: string;
  pri: 1 | 2 | 3;
  st: "todo" | "doing" | "wait" | "done";
  due: string;
  start?: string; // 任意（YYYY-MM-DD）。ガントの棒の開始日。省略時は今日〜due
};
export type WbsData = {
  updated: string;
  pjMeta: Record<string, { label: string; note: string; stale: boolean }>;
  tasks: WbsTask[];
};

// ステータス配色（検証済みステータスパレット。色単独に依存せず常にラベル併記）
const ST_COLOR: Record<WbsTask["st"], string> = {
  doing: "#2a78d6",
  todo: "#8b877c",
  wait: "#fab219",
  done: "#0ca30c",
};
const OVER_COLOR = "#d03b3b";
const ST_META: Record<WbsTask["st"], string> = {
  doing: "▶ 進行中",
  todo: "◻ 未着手",
  wait: "⏸ 待ち",
  done: "✔ 完了",
};
const PRI_LABEL: Record<number, string> = { 1: "★ 最優先", 2: "高", 3: "通常" };
const ST_KEYS = ["doing", "todo", "wait", "done"] as const;
const BAR_ORDER = ["done", "doing", "wait", "todo"] as const;
const DAY = 86400000;
const ID_RE = /([A-Z]-\d{2})/g;

const isIso = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const ms = (d: string) => new Date(`${d}T00:00:00`).getTime();

function dueState(t: WbsTask, today: number): "over" | "soon" | "" {
  if (t.st === "done" || !isIso(t.due)) return "";
  const diff = (ms(t.due) - today) / DAY;
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

// 依存メモ内のタスクID（R-01等）をクリック可能にする（クリックで該当タスクを検索）
function DepText({ text, onPick }: { text: string; onPick: (id: string) => void }) {
  return (
    <>
      {text.split(ID_RE).map((p, i) =>
        /^[A-Z]-\d{2}$/.test(p) ? (
          <button
            key={i}
            type="button"
            onClick={() => onPick(p)}
            className="font-semibold text-bronze-deep underline decoration-dotted underline-offset-2"
          >
            {p}
          </button>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

// PJ別の消化状況スタックバー（完了→進行中→待ち→未着手。2pxギャップで面を区切る）
function StackBar({ tasks }: { tasks: WbsTask[] }) {
  const total = tasks.length;
  if (!total) return null;
  return (
    <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-[4px]" role="img"
      aria-label={BAR_ORDER.map((s) => `${ST_META[s]} ${tasks.filter((t) => t.st === s).length}件`).join("、")}>
      {BAR_ORDER.map((s) => {
        const n = tasks.filter((t) => t.st === s).length;
        return n > 0 ? (
          <div key={s} title={`${ST_META[s]} ${n}件`} style={{ width: `${(n / total) * 100}%`, background: ST_COLOR[s] }} />
        ) : null;
      })}
    </div>
  );
}

// ガントチャート（フィルタ結果と連動。ISO期限を持つタスクのみ描画）
// 棒 = start（省略時は今日）〜 due。期限超過は due〜今日 を赤で表示。完了は◆マーカー。
function Gantt({
  tasks, pjKeys, pjMeta, today, onPick,
}: {
  tasks: WbsTask[];
  pjKeys: string[];
  pjMeta: WbsData["pjMeta"];
  today: number;
  onPick: (id: string) => void;
}) {
  const dated = tasks.filter((t) => isIso(t.due));
  if (dated.length === 0) {
    return (
      <div className="mb-6 rounded-lg border border-line bg-white/70 p-4 text-xs text-ink-faint">
        ガント: 現在の絞り込みに日付確定タスクがありません（期限が「近日」「継続」等のタスクは表に表示されます）
      </div>
    );
  }

  const starts = dated.map((t) => (isIso(t.start) ? ms(t.start) : today));
  const ends = dated.map((t) => ms(t.due));
  const min = Math.min(...starts, ...ends, today) - 2 * DAY;
  const max = Math.max(...ends, today) + 3 * DAY;

  const W = 940, LW = 264, PADR = 16, RH = 26, PJH = 22, TOP = 28;
  const x = (v: number) => LW + ((v - min) / (max - min)) * (W - LW - PADR);

  // 行リスト（PJ見出し行＋タスク行）
  type Row = { kind: "pj"; label: string } | { kind: "task"; t: WbsTask };
  const rows: Row[] = [];
  for (const k of pjKeys) {
    const g = dated.filter((t) => t.pj === k).sort((a, b) => ms(a.due) - ms(b.due) || a.pri - b.pri);
    if (g.length) {
      rows.push({ kind: "pj", label: pjMeta[k]?.label.split("（")[0] ?? k });
      g.forEach((t) => rows.push({ kind: "task", t }));
    }
  }
  const ys: number[] = [];
  let acc = TOP;
  rows.forEach((r) => { ys.push(acc); acc += r.kind === "pj" ? PJH : RH; });
  const H = acc + 14;

  // 週目盛り（月曜）
  const ticks: number[] = [];
  for (let d = min; d <= max; d += DAY) if (new Date(d).getDay() === 1) ticks.push(d);
  const fmt = (v: number) => { const d = new Date(v); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const short = (s: string, n = 17) => (s.length > n ? `${s.slice(0, n)}…` : s);

  return (
    <div className="mb-6 rounded-lg border border-line bg-white/70 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold">ガントチャート</h2>
        <p className="text-[11px] text-ink-faint">絞り込みと連動。棒=開始（未設定は今日）〜期限、赤=期限超過、◆=完了。クリックで該当タスクへ</p>
      </div>
      <div className="mt-2 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[760px]" role="img" aria-label="ガントチャート">
          {/* 週目盛り */}
          {ticks.map((tk) => (
            <g key={tk}>
              <line x1={x(tk)} y1={TOP - 6} x2={x(tk)} y2={H - 12} stroke="#e2ded2" strokeWidth="1" />
              <text x={x(tk)} y={TOP - 10} textAnchor="middle" fontSize="10" fill="#8b877c">{fmt(tk)}</text>
            </g>
          ))}
          {/* 今日ライン */}
          <line x1={x(today)} y1={TOP - 6} x2={x(today)} y2={H - 12} stroke="#a17c3f" strokeWidth="1.5" strokeDasharray="4 3" />
          <text x={x(today)} y={TOP - 10} textAnchor="middle" fontSize="10" fontWeight="700" fill="#86672f">今日 {fmt(today)}</text>

          {rows.map((r, i) => {
            const y = ys[i];
            if (r.kind === "pj") {
              return (
                <text key={`pj-${r.label}`} x={4} y={y + 15} fontSize="11.5" fontWeight="700" fill="#1c1b18" fontStyle="normal">
                  {r.label}
                </text>
              );
            }
            const t = r.t;
            const cy = y + RH / 2;
            const e0 = ms(t.due);
            const s0 = isIso(t.start) ? ms(t.start) : today;
            const over = e0 < today && t.st !== "done";
            const barStart = Math.min(s0, e0);
            const ds = dueState(t, today);
            const labelFill = over ? OVER_COLOR : "#56534a";
            return (
              <g key={t.id} onClick={() => onPick(t.id)} style={{ cursor: "pointer" }}>
                <title>{`${t.id} ${t.task}｜${ST_META[t.st]}｜期限 ${t.due}${isIso(t.start) ? `（開始 ${t.start}）` : ""}${over ? "・⚠超過" : ds === "soon" ? "・⏰間近" : ""}`}</title>
                <rect x={0} y={y} width={W} height={RH} fill="transparent" />
                <line x1={LW} y1={cy} x2={W - PADR} y2={cy} stroke="#e2ded2" strokeWidth="0.6" />
                <text x={10} y={cy + 3.5} fontSize="10.5" fill={labelFill} fontWeight={t.pri === 1 ? 700 : 400}>
                  {t.id} {short(t.task)}{over ? " ⚠" : ""}
                </text>
                {t.st === "done" ? (
                  <rect x={x(e0) - 5} y={cy - 5} width={10} height={10} fill={ST_COLOR.done}
                    transform={`rotate(45 ${x(e0)} ${cy})`} stroke="#ffffff" strokeWidth="1.5" />
                ) : (
                  <>
                    {barStart < e0 && (
                      <rect x={x(barStart)} y={cy - 6} width={Math.max(x(e0) - x(barStart), 3)} height={12} rx="4"
                        fill={ST_COLOR[t.st]} stroke="#ffffff" strokeWidth="1" />
                    )}
                    {over && (
                      <rect x={x(e0)} y={cy - 6} width={Math.max(x(today) - x(e0), 3)} height={12} rx="4"
                        fill={OVER_COLOR} stroke="#ffffff" strokeWidth="1" />
                    )}
                    <circle cx={x(e0)} cy={cy} r="3" fill={over ? OVER_COLOR : ST_COLOR[t.st]} stroke="#ffffff" strokeWidth="1.5" />
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
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
  const pickId = (id: string) => { setPj("all"); setSt("all"); setQ(id); };

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
            正は各プロジェクトの CURRENT.md（tasks.js を編集すると auto-sync が自動反映）。
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
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6 mb-4">
            {tiles.map((tl) => (
              <div key={tl.label} className="rounded-lg border border-line bg-white/70 px-3.5 py-3">
                <p className="text-xs text-ink-soft">{tl.label}</p>
                <p className={`text-2xl font-bold leading-tight ${tl.cls ?? "text-ink"}`}>{tl.value}</p>
                <p className="text-[11px] text-ink-faint">{tl.note}</p>
              </div>
            ))}
          </div>

          {/* 全体進捗バー＋凡例 */}
          <div className="mb-4 rounded-lg border border-line bg-white/70 px-4 py-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-ink-soft">全体進捗（{count("done")}/{all.length} 完了）</p>
              <div className="flex flex-wrap gap-3 text-[11px] text-ink-soft">
                {BAR_ORDER.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: ST_COLOR[s] }} />
                    {ST_META[s]}
                  </span>
                ))}
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: OVER_COLOR }} />⚠ 期限超過
                </span>
              </div>
            </div>
            <StackBar tasks={all} />
          </div>

          {/* フィルタ（ガント・テーブル両方に効く） */}
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-ink-faint">PJ:</span>
            <Chip on={pj === "all"} onClick={() => setPj("all")}>すべて</Chip>
            {pjKeys.map((k) => (
              <Chip key={k} on={pj === k} onClick={() => setPj(k)}>{k}</Chip>
            ))}
            <span className="mx-2 hidden h-4 w-px bg-line sm:inline-block" />
            <span className="mr-1 text-xs text-ink-faint">状態:</span>
            <Chip on={st === "all"} onClick={() => setSt("all")}>すべて</Chip>
            {ST_KEYS.map((k) => (
              <Chip key={k} on={st === k} onClick={() => setSt(k)}>{ST_META[k]}</Chip>
            ))}
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="検索…"
              className="ml-auto w-40 rounded border border-line bg-white/70 px-2.5 py-1 text-xs text-ink focus:outline-2 focus:outline-bronze-deep"
            />
          </div>

          {/* ガントチャート（絞り込み連動） */}
          <Gantt tasks={shown} pjKeys={pjKeys} pjMeta={data.pjMeta} today={today} onPick={pickId} />

          {/* プロジェクト別テーブル */}
          {pjKeys.map((key) => {
            const meta = data.pjMeta[key];
            const rows = all.filter((t) => t.pj === key);
            const rowsShown = rows.filter(visible).sort((a, b) => a.pri - b.pri || a.id.localeCompare(b.id));
            if (rowsShown.length === 0) return null;
            const doneN = rows.filter((t) => t.st === "done").length;
            return (
              <div key={key} className="mb-6 rounded-lg border border-line bg-white/70 p-4 sm:p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-serif text-lg font-semibold">
                    {meta.label}
                    <span className="ml-2 font-sans text-xs font-normal text-ink-faint">
                      {rowsShown.length}/{rows.length}件・完了 {doneN}
                    </span>
                  </h2>
                  <div className="w-40 sm:w-56"><StackBar tasks={rows} /></div>
                </div>
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
                              {t.dep && (
                                <span className="block text-[11px] text-ink-faint">
                                  └ <DepText text={t.dep} onPick={pickId} />
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2">
                              <span className={t.pri === 1 ? "font-bold" : t.pri === 2 ? "font-semibold" : "text-ink-soft"}>
                                {PRI_LABEL[t.pri]}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-2 py-2">
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-paper px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: ST_COLOR[t.st] }} />
                                {ST_META[t.st]}
                              </span>
                            </td>
                            <td
                              className={`whitespace-nowrap px-2 py-2 tabular-nums ${
                                ds === "over" ? "font-bold text-[#b3352e]" : ds === "soon" ? "font-bold text-ink" : "text-ink-soft"
                              }`}
                            >
                              {t.due}
                              {isIso(t.start) && <span className="block text-[10px] text-ink-faint">開始 {t.start}</span>}
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
