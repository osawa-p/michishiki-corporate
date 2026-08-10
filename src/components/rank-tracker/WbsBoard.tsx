"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  start?: string; // 任意（YYYY-MM-DD）。ガントの棒の開始日
};
export type WbsData = {
  updated: string;
  pjMeta: Record<string, { label: string; note: string; stale: boolean }>;
  tasks: WbsTask[];
};

// ステータス配色（検証済みステータスパレット。マーカー・バーのみに使い、テキストはinkを保つ）
const ST_COLOR: Record<WbsTask["st"], string> = {
  doing: "#2a78d6",
  todo: "#8b877c",
  wait: "#fab219",
  done: "#0ca30c",
};
const OVER_COLOR = "#b3352e";
const ST_META: Record<WbsTask["st"], string> = {
  doing: "進行中",
  todo: "未着手",
  wait: "待ち",
  done: "完了",
};
const PRI_LABEL: Record<number, string> = { 1: "最優先", 2: "高", 3: "通常" };
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
      className={`inline-flex min-h-9 items-center whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze/40 focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${
        on
          ? "border-bronze bg-bronze/10 font-semibold text-bronze-deep"
          : "border-line bg-white/70 text-ink-soft hover:border-bronze/60 hover:bg-white"
      }`}
    >
      {children}
    </button>
  );
}

// 依存メモ内のタスクID（R-01等）をクリック可能にする（クリックで詳細パネルを開く）
function DepText({ text, onOpen }: { text: string; onOpen: (id: string) => void }) {
  return (
    <>
      {text.split(ID_RE).map((p, i) =>
        /^[A-Z]-\d{2}$/.test(p) ? (
          <button
            key={i}
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpen(p); }}
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

// 消化状況スタックバー（完了→進行中→待ち→未着手。件数比で分割）
function StackBar({ tasks, h = "h-2.5" }: { tasks: WbsTask[]; h?: string }) {
  const total = tasks.length;
  if (!total) return null;
  return (
    <div className={`flex ${h} w-full gap-px overflow-hidden rounded-full`} role="img"
      aria-label={BAR_ORDER.map((s) => `${ST_META[s]} ${tasks.filter((t) => t.st === s).length}件`).join("、")}>
      {BAR_ORDER.map((s) => {
        const n = tasks.filter((t) => t.st === s).length;
        return n > 0 ? (
          <div key={s} title={`${ST_META[s]} ${n}件`} style={{ flexGrow: n, background: ST_COLOR[s] }} />
        ) : null;
      })}
    </div>
  );
}

function StatusPill({ st }: { st: WbsTask["st"] }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper/80 px-2.5 py-1 text-xs font-medium text-ink-soft">
      <span className="h-2 w-2 rounded-full" style={{ background: ST_COLOR[st] }} />
      {ST_META[st]}
    </span>
  );
}

// ガントチャート（絞り込み連動。軸レンジは全タスク基準で固定し、フィルタで行だけ増減する）
function Gantt({
  rows: rowTasks, domainTasks, pjKeys, pjMeta, today, selectedId, onOpen,
}: {
  rows: WbsTask[];
  domainTasks: WbsTask[];
  pjKeys: string[];
  pjMeta: WbsData["pjMeta"];
  today: number;
  selectedId: string | null;
  onOpen: (id: string) => void;
}) {
  const dated = rowTasks.filter((t) => isIso(t.due));
  if (dated.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-white/80 p-5 text-xs leading-5 text-ink-soft">
        現在の絞り込みに日付確定タスクがありません（期限が「近日」「継続」等のタスクは下の一覧に表示されます）
      </div>
    );
  }

  const domain = domainTasks.filter((t) => isIso(t.due));
  const dEnds = domain.map((t) => ms(t.due));
  const dStarts = domain.map((t) => (isIso(t.start) ? ms(t.start) : today));
  const min = Math.min(...dStarts, ...dEnds, today) - 2 * DAY;
  const max = Math.max(...dEnds, today) + 3 * DAY;

  const W = 1040, LW = 296, PADR = 24, RH = 32, PJH = 30, TOP = 44;
  const x = (v: number) => LW + ((v - min) / (max - min)) * (W - LW - PADR);
  // 今日バッジ（端で切れないようclamp。近接する週目盛りは非表示にして重なりを防ぐ）
  const badgeX = Math.min(Math.max(x(today), LW + 34), W - PADR - 34);

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
  const H = acc + 12;

  // 週目盛り（月曜。今日バッジと重なる位置は除外）
  const ticks: number[] = [];
  for (let d = min; d <= max; d += DAY) {
    if (new Date(d).getDay() === 1 && Math.abs(x(d) - x(today)) >= 48) ticks.push(d);
  }
  const fmt = (v: number) => { const d = new Date(v); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const short = (s: string, n = 15) => (s.length > n ? `${s.slice(0, n)}…` : s);
  let taskIdx = 0;

  return (
    <div className="rounded-xl border border-line bg-white/80 p-4 shadow-[0_1px_2px_rgba(28,27,24,0.04)] sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-serif text-lg font-semibold">ガントチャート</h3>
        <p className="text-xs leading-5 text-ink-soft">棒＝開始〜期限（開始日未設定は破線）／赤＝超過／◆＝完了。クリックで詳細</p>
      </div>
      <div className="mt-3 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-gutter:stable]">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full min-w-[1040px]" role="group" aria-label="ガントチャート">
          {/* 週目盛り */}
          {ticks.map((tk) => (
            <g key={tk}>
              <line x1={x(tk)} y1={TOP - 8} x2={x(tk)} y2={H - 10} stroke="#e2ded2" strokeWidth="1" />
              <text x={x(tk)} y={TOP - 14} textAnchor="middle" fontSize="11" fill="#8b877c">{fmt(tk)}</text>
            </g>
          ))}
          {/* 今日ライン＋バッジ */}
          <line x1={x(today)} y1={TOP - 8} x2={x(today)} y2={H - 10} stroke="#a17c3f" strokeWidth="1.5" strokeDasharray="4 3" />
          <g>
            <rect x={badgeX - 34} y={TOP - 34} width="68" height="20" rx="10" fill="#f6f4ef" stroke="#a17c3f" strokeWidth="1" />
            <text x={badgeX} y={TOP - 20} textAnchor="middle" fontSize="11" fontWeight="700" fill="#86672f">今日 {fmt(today)}</text>
          </g>
          {/* ラベル列との境界 */}
          <line x1={LW - 12} y1={TOP - 8} x2={LW - 12} y2={H - 10} stroke="#e2ded2" strokeWidth="1" />

          {rows.map((r, i) => {
            const y = ys[i];
            if (r.kind === "pj") {
              return (
                <g key={`pj-${r.label}`}>
                  <rect x={0} y={y} width={W} height={PJH} fill="#f6f4ef" fillOpacity="0.9" />
                  <line x1={0} y1={y + PJH} x2={W} y2={y + PJH} stroke="#e2ded2" strokeWidth="1" />
                  <text x={6} y={y + 20} fontSize="13" fontWeight="700" fill="#1c1b18" fontFamily="var(--font-shippori-mincho), serif">
                    {r.label}
                  </text>
                </g>
              );
            }
            const t = r.t;
            const zebra = taskIdx % 2 === 1;
            taskIdx += 1;
            const cy = y + RH / 2;
            const e0 = ms(t.due);
            const hasStart = isIso(t.start);
            const s0 = hasStart ? ms(t.start!) : today;
            const over = e0 < today && t.st !== "done";
            const selected = selectedId === t.id;
            return (
              <g
                key={t.id}
                onClick={() => onOpen(t.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(t.id); } }}
                role="button"
                tabIndex={0}
                style={{ cursor: "pointer" }}
                className="focus-visible:outline-2 focus-visible:outline-[#86672f]"
                aria-label={`${t.id} ${t.task} の詳細を開く`}
              >
                <title>{`${t.id} ${t.task}｜${ST_META[t.st]}｜期限 ${t.due}${hasStart ? `（開始 ${t.start}）` : ""}${over ? "・超過" : ""}`}</title>
                {zebra && <rect x={0} y={y} width={W} height={RH} fill="#f6f4ef" fillOpacity="0.35" />}
                {selected && (
                  <>
                    <rect x={0} y={y} width={W} height={RH} fill="#a17c3f" fillOpacity="0.08" />
                    <rect x={0} y={y} width={2.5} height={RH} fill="#a17c3f" />
                  </>
                )}
                <rect x={0} y={y} width={W} height={RH} fill="transparent" />
                <line x1={0} y1={y + RH} x2={W} y2={y + RH} stroke="#e2ded2" strokeWidth="0.6" />
                <text x={10} y={cy + 4} fontSize="12" fill="#8b877c">{t.id}</text>
                <text x={54} y={cy + 4} fontSize="12" fill={over ? OVER_COLOR : "#1c1b18"} fontWeight={t.pri === 1 ? 700 : 400}>
                  {short(t.task)}
                </text>
                {t.st === "done" ? (
                  <rect x={x(e0) - 5} y={cy - 5} width={10} height={10} fill={ST_COLOR.done}
                    transform={`rotate(45 ${x(e0)} ${cy})`} stroke="#f6f4ef" strokeWidth="1.5" />
                ) : (
                  <>
                    {hasStart && s0 < e0 && (
                      <rect x={x(s0)} y={cy - 5} width={Math.max(x(e0) - x(s0), 3)} height={10} rx="5"
                        fill={ST_COLOR[t.st]} fillOpacity="0.88" stroke="#f6f4ef" strokeWidth="1" />
                    )}
                    {!hasStart && !over && today < e0 && (
                      <line x1={x(today)} y1={cy} x2={x(e0)} y2={cy}
                        stroke={ST_COLOR[t.st]} strokeWidth="2.5" strokeDasharray="3 4" strokeOpacity="0.6" strokeLinecap="round" />
                    )}
                    {over && (
                      <rect x={x(e0)} y={cy - 5} width={Math.max(x(today) - x(e0), 3)} height={10} rx="5"
                        fill={OVER_COLOR} fillOpacity="0.88" stroke="#f6f4ef" strokeWidth="1" />
                    )}
                    <circle cx={x(e0)} cy={cy} r="4" fill={over ? OVER_COLOR : ST_COLOR[t.st]} stroke="#f6f4ef" strokeWidth="1.5" />
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

// 詳細パネル（PC=右ドロワー / スマホ=ボトムシート）
function DetailPanel({
  task, data, today, backId, onOpen, onBack, onClose, onFilter,
}: {
  task: WbsTask;
  data: WbsData;
  today: number;
  backId: string | null;
  onOpen: (id: string) => void;
  onBack: () => void;
  onClose: () => void;
  onFilter: (id: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState(false);

  // モーダル挙動: Escで閉じる／Tabフォーカストラップ／背景スクロール抑止／閉時に起点へフォーカス復帰
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "Tab" && panelRef.current) {
        const els = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        const active = document.activeElement;
        if (!panelRef.current.contains(active)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      opener?.focus?.();
    };
  }, [onClose]);

  // タスク切替時: 本文を先頭へ・タイトルにフォーカス
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    titleRef.current?.focus();
    setCopied(false);
  }, [task.id]);

  const meta = data.pjMeta[task.pj];
  const ds = dueState(task, today);
  const diffDays = isIso(task.due) ? Math.round((ms(task.due) - today) / DAY) : null;
  const refIds = Array.from(new Set(task.dep.match(ID_RE) ?? [])).filter((id) => id !== task.id);
  const refTasks = refIds
    .map((id) => data.tasks.find((t) => t.id === id))
    .filter((t): t is WbsTask => !!t);

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex gap-4 border-b border-line/70 py-3 text-sm leading-6 last:border-b-0">
      <span className="w-20 shrink-0 text-xs leading-6 text-ink-soft">{label}</span>
      <span className="min-w-0 flex-1 text-ink">{value}</span>
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wbs-detail-title"
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-2xl border-t border-line bg-paper pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-16px_40px_rgba(28,27,24,0.14)] sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:h-dvh sm:max-h-none sm:w-full sm:max-w-[28rem] sm:rounded-none sm:border-l sm:border-t-0 sm:pb-0 sm:shadow-[-16px_0_40px_rgba(28,27,24,0.12)]"
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line sm:hidden" />
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs tracking-[0.2em] uppercase text-bronze">
              {meta?.label ?? task.pj} <span className="ml-1 tracking-normal text-ink-faint">{task.id}</span>
            </p>
            <h3 id="wbs-detail-title" ref={titleRef} tabIndex={-1}
              className="mt-1.5 font-serif text-lg font-semibold leading-snug text-ink focus-visible:outline-none">
              {task.task}
            </h3>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <StatusPill st={task.st} />
              <span className={`inline-flex items-center rounded-full border border-line bg-paper/80 px-2.5 py-1 text-xs font-medium ${task.pri === 1 ? "font-semibold text-ink" : "text-ink-soft"}`}>
                優先度: {PRI_LABEL[task.pri]}
              </span>
              {ds === "over" && (
                <span className="inline-flex items-center rounded-full border border-[#a14d43]/25 bg-[#a14d43]/[0.06] px-2.5 py-1 text-xs font-semibold text-[#8f403a]">
                  期限超過
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line bg-white/70 text-ink-soft transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze/40 sm:h-9 sm:w-9"
          >
            ✕
          </button>
        </div>

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6 sm:py-5">
          {backId && (
            <button type="button" onClick={onBack}
              className="mb-3 text-xs font-medium text-bronze-deep underline decoration-dotted underline-offset-2">
              ← {backId} に戻る
            </button>
          )}
          {row("期限", (
            <span className={`tabular-nums ${ds === "over" ? "font-semibold text-[#8f403a]" : ""}`}>
              {task.due}
              {diffDays !== null && task.st !== "done" && (
                <span className="ml-2 text-xs text-ink-soft">
                  {diffDays < 0 ? `${-diffDays}日超過` : diffDays === 0 ? "今日まで" : `あと${diffDays}日`}
                </span>
              )}
            </span>
          ))}
          {row("開始", isIso(task.start)
            ? <span className="tabular-nums">{task.start}</span>
            : <span className="text-ink-faint">未設定（ガントでは今日〜期限の破線で表示）</span>)}
          {task.dep && row("依存・補足", <DepText text={task.dep} onOpen={onOpen} />)}
          {refTasks.length > 0 &&
            row("関連タスク", (
              <span className="flex flex-col gap-1.5">
                {refTasks.map((rt) => (
                  <button key={rt.id} type="button" onClick={() => onOpen(rt.id)}
                    className="text-left text-sm leading-6 text-bronze-deep underline decoration-dotted underline-offset-2">
                    {rt.id} {rt.task}
                  </button>
                ))}
              </span>
            ))}
          {meta && row("PJメモ", (
            <span className={`text-xs leading-5 ${meta.stale ? "text-[#8f403a]" : "text-ink-soft"}`}>
              {meta.stale ? "⚠ " : ""}{meta.note}
            </span>
          ))}
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-line px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-ink-faint">データ更新: {data.updated}</p>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button type="button"
              onClick={() => { navigator.clipboard?.writeText(task.id); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}
              className="min-h-11 whitespace-nowrap rounded-md border border-line bg-white/70 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-white sm:min-h-9">
              {copied ? "コピーしました" : "IDをコピー"}
            </button>
            <button type="button" onClick={() => { onFilter(task.id); onClose(); }}
              className="min-h-11 whitespace-nowrap rounded-md border border-bronze/40 bg-bronze/10 px-3 py-1.5 text-xs font-semibold text-bronze-deep transition-colors hover:bg-bronze/15 sm:min-h-9">
              一覧で絞り込む
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function WbsBoard({ data }: { data: WbsData }) {
  const [pj, setPj] = useState<string>("all");
  const [st, setSt] = useState<string>("all");
  const [q, setQ] = useState("");
  // 詳細パネルの状態（back=直前に見ていたタスクへの1段戻り）
  const [panel, setPanel] = useState<{ id: string; back: string | null } | null>(null);
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
  const hasFilter = pj !== "all" || st !== "all" || query !== "";
  const doneRate = all.length ? Math.round((count("done") / all.length) * 100) : 0;

  const openTask = useCallback((id: string) => {
    setPanel((p) => ({ id, back: p && p.id !== id ? p.id : p?.back ?? null }));
  }, []);
  const closePanel = useCallback(() => setPanel(null), []);
  const backPanel = useCallback(() => {
    setPanel((p) => (p?.back ? { id: p.back, back: null } : p));
  }, []);
  const filterToId = useCallback((id: string) => { setPj("all"); setSt("all"); setQ(id); }, []);

  const selected = panel ? all.find((t) => t.id === panel.id) ?? null : null;

  const tiles: { label: string; value: number; note: string; accent?: string }[] = [
    { label: "全タスク", value: all.length, note: `表示中 ${shown.length}` },
    { label: "進行中", value: count("doing"), note: "同時進行レーン", accent: ST_COLOR.doing },
    { label: "未着手", value: count("todo"), note: `うち最優先 ${all.filter((t) => t.st === "todo" && t.pri === 1).length}`, accent: ST_COLOR.todo },
    { label: "待ち・ブロック", value: count("wait"), note: "他者・前工程待ち", accent: ST_COLOR.wait },
    { label: "期限超過", value: overdue, note: "要棚卸し（鮮度注意）", accent: OVER_COLOR },
    { label: "完了", value: count("done"), note: `完了率 ${doneRate}%`, accent: ST_COLOR.done },
  ];

  return (
    <>
      <section className="border-b border-line">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">WBS</p>
          <h1 className="font-serif text-3xl md:text-4xl font-semibold">大沢タスクWBS</h1>
          <p className="mt-4 text-sm text-ink-soft leading-relaxed">
            全プロジェクト横断のタスクボード（管理者専用）。データ最終更新: {data.updated}。
            正は各プロジェクトの CURRENT.md（tasks.js を編集すると auto-sync が自動反映）。
          </p>
          {staleNote.length > 0 && (
            <p className="mt-3 inline-block rounded border border-line bg-white/60 px-3 py-2 text-xs leading-5 text-ink-soft">
              ⚠ 鮮度注意: {staleNote.join("、")} は CURRENT が古く、完了済みタスクが混在している可能性があります
            </p>
          )}
        </div>
      </section>

      <section className="py-8 md:py-12">
        <div className="max-w-7xl mx-auto space-y-10 px-4 sm:px-6 lg:px-8">
          {/* ===== 全体状況 ===== */}
          <div className="space-y-4">
            <h2 className="font-serif text-xl font-semibold text-ink">全体状況</h2>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              {tiles.map((tl) => (
                <div key={tl.label} className="rounded-xl border border-line bg-white/50 px-4 py-3">
                  <p className="flex items-center gap-1.5 text-xs text-ink-soft">
                    {tl.accent && <span className="h-2 w-2 rounded-full" style={{ background: tl.accent }} />}
                    {tl.label}
                  </p>
                  <p className="mt-0.5 text-2xl font-semibold leading-tight text-ink tabular-nums tracking-tight">{tl.value}</p>
                  <p className="text-xs leading-5 text-ink-faint">{tl.note}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-line bg-white/[0.65] px-4 py-3.5 sm:px-5">
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-ink-soft">
                  全体進捗 <span className="ml-1 tabular-nums">{count("done")}/{all.length} 完了（{doneRate}%）</span>
                </p>
                <div className="flex flex-wrap items-center gap-3 text-xs leading-5 text-ink-soft">
                  {BAR_ORDER.map((s) => (
                    <span key={s} className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: ST_COLOR[s] }} />
                      {ST_META[s]}
                    </span>
                  ))}
                  {overdue > 0 && (
                    <span className="inline-flex items-center rounded-full border border-[#a14d43]/25 bg-[#a14d43]/[0.06] px-2.5 py-0.5 font-semibold text-[#8f403a]">
                      期限超過 {overdue}件
                    </span>
                  )}
                </div>
              </div>
              <StackBar tasks={all} />
            </div>
          </div>

          {/* ===== スケジュール ===== */}
          <div className="space-y-4">
            <h2 className="font-serif text-xl font-semibold text-ink">スケジュール</h2>
            {/* フィルタ（ガント・一覧の両方に効く） */}
            <div className="grid gap-3 rounded-xl border border-line bg-white/60 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 w-16 text-xs text-ink-soft">プロジェクト</span>
                  <Chip on={pj === "all"} onClick={() => setPj("all")}>すべて</Chip>
                  {pjKeys.map((k) => (
                    <Chip key={k} on={pj === k} onClick={() => setPj(k)}>{k}</Chip>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 w-16 text-xs text-ink-soft">状態</span>
                  <Chip on={st === "all"} onClick={() => setSt("all")}>すべて</Chip>
                  {ST_KEYS.map((k) => (
                    <Chip key={k} on={st === k} onClick={() => setSt(k)}>{ST_META[k]}</Chip>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="タスク・ID・メモを検索"
                  aria-label="タスクを検索"
                  className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze/40 sm:w-64"
                />
                {hasFilter && (
                  <button type="button" onClick={() => { setPj("all"); setSt("all"); setQ(""); }}
                    className="whitespace-nowrap text-xs font-medium text-bronze-deep underline decoration-dotted underline-offset-2">
                    クリア
                  </button>
                )}
              </div>
              <p className="text-xs text-ink-faint lg:col-span-2">
                {all.length}件中 {shown.length}件を表示
              </p>
            </div>

            <Gantt rows={shown} domainTasks={all} pjKeys={pjKeys} pjMeta={data.pjMeta}
              today={today} selectedId={panel?.id ?? null} onOpen={openTask} />
          </div>

          {/* ===== プロジェクト別タスク ===== */}
          <div className="space-y-5">
            <h2 className="font-serif text-xl font-semibold text-ink">プロジェクト別タスク</h2>
            {pjKeys.map((key) => {
              const meta = data.pjMeta[key];
              const rows = all.filter((t) => t.pj === key);
              const rowsShown = rows.filter(visible).sort((a, b) => a.pri - b.pri || a.id.localeCompare(b.id));
              if (rowsShown.length === 0) return null;
              const doneN = rows.filter((t) => t.st === "done").length;
              return (
                <div key={key} className="overflow-hidden rounded-xl border border-line bg-white/70">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-bronze/[0.04] px-5 py-4">
                    <div>
                      <h3 className="font-serif text-lg font-semibold leading-tight">
                        {meta.label}
                        <span className="ml-2 font-sans text-xs font-normal text-ink-soft tabular-nums">
                          {rowsShown.length}/{rows.length}件・完了 {doneN}
                        </span>
                      </h3>
                      <p className={`mt-1 text-xs leading-5 ${meta.stale ? "text-[#8f403a]" : "text-ink-soft"}`}>
                        {meta.stale ? "⚠ " : ""}{meta.note}
                      </p>
                    </div>
                    <div className="w-full sm:w-56"><StackBar tasks={rows} h="h-2" /></div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px] table-fixed border-collapse text-sm">
                      <thead>
                        <tr className="bg-paper/70 text-left text-xs text-ink-soft">
                          <th className="w-20 px-4 py-2.5 font-medium">ID</th>
                          <th className="px-4 py-2.5 font-medium">タスク</th>
                          <th className="w-24 px-4 py-2.5 font-medium">優先度</th>
                          <th className="w-32 px-4 py-2.5 font-medium">状態</th>
                          <th className="w-36 px-4 py-2.5 text-right font-medium">期限</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rowsShown.map((t) => {
                          const ds = dueState(t, today);
                          const isSel = panel?.id === t.id;
                          return (
                            <tr
                              key={t.id}
                              onClick={() => openTask(t.id)}
                              className={`group cursor-pointer border-b border-line/80 align-top transition-colors last:border-b-0 hover:bg-bronze/[0.05] ${
                                isSel ? "bg-bronze/[0.08] shadow-[inset_3px_0_0_#a17c3f]" : ""
                              }`}
                            >
                              <td className="px-4 py-3 text-xs leading-6 text-ink-soft tabular-nums">{t.id}</td>
                              <td className="px-4 py-3 leading-6 text-ink">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); openTask(t.id); }}
                                  className={`text-left leading-6 underline-offset-2 group-hover:underline group-hover:decoration-bronze/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze/40 ${t.pri === 1 ? "font-semibold" : ""}`}
                                >
                                  {t.task}
                                </button>
                                {t.dep && (
                                  <span className="mt-0.5 block truncate text-xs leading-5 text-ink-faint" title={t.dep}>
                                    └ <DepText text={t.dep} onOpen={openTask} />
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 leading-6">
                                <span className={t.pri === 1 ? "font-semibold text-ink" : "text-ink-soft"}>{PRI_LABEL[t.pri]}</span>
                              </td>
                              <td className="px-4 py-3 leading-6"><StatusPill st={t.st} /></td>
                              <td className={`px-4 py-3 text-right leading-6 tabular-nums ${
                                ds === "over" ? "font-semibold text-[#8f403a]" : ds === "soon" ? "font-semibold text-ink" : "text-ink-soft"
                              }`}>
                                {t.due}{ds === "over" ? " ⚠" : ds === "soon" ? " ⏰" : ""}
                                <span className="ml-1.5 inline-block text-ink-faint transition-transform group-hover:translate-x-0.5">›</span>
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
        </div>
      </section>

      {selected && (
        <DetailPanel
          task={selected}
          data={data}
          today={today}
          backId={panel?.back ?? null}
          onOpen={openTask}
          onBack={backPanel}
          onClose={closePanel}
          onFilter={filterToId}
        />
      )}
    </>
  );
}
