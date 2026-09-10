"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";

// クライアント向け「施策WBS」。データは src/data/wbs-client/<slug>.json
// （michi 側 wbs-client-publish.mjs が tasks.js＋公開文面から生成。内部メモは含まない）。
// 認証済み server component（projects/[site]/page.tsx）から props で受け取る。

export type ClientWbsStatus = "todo" | "doing" | "wait" | "done" | "skipped" | "paused";
export type ClientWbsKpi = {
  kgi: string;
  metrics: { name: string; baseline: string; current: string; target: string; asof: string }[];
  source: string;
  next: string;
};
export type ClientWbsTask = {
  id: string;
  title: string;
  area: string;
  owner: string;
  waitFor: string;
  status: ClientWbsStatus;
  pri: 1 | 2 | 3;
  start: string | null;
  due: string;
  dueDate: string | null;
  now: string;
  reason: string;
  next: string;
  outcome: string;
  effort: Record<string, number>;
  links: { label: string; url: string }[];
  kpi?: ClientWbsKpi;
};
export type ClientWbsData = {
  site: { slug: string; domain: string; label: string; client: string; since: string };
  updated: string;
  generatedAt: string;
  effortNote: Record<string, string>;
  overhead: Record<string, { label: string; hours: number }[]>;
  tasks: ClientWbsTask[];
};

const STATUS_LABEL: Record<ClientWbsStatus, string> = {
  doing: "進行中",
  wait: "待ち",
  todo: "予定",
  done: "完了",
  skipped: "未実行",
  paused: "中断",
};
// ステータス配色（マーカー・バーのみ。文字は墨色を保つ）
const STATUS_COLOR: Record<ClientWbsStatus, string> = {
  doing: "#2a78d6",
  wait: "#d9960b",
  todo: "#8b877c",
  done: "#0ca30c",
  skipped: "#b3b0a6",
  paused: "#b3b0a6",
};
const STATUS_ORDER: ClientWbsStatus[] = ["wait", "doing", "todo", "done", "paused", "skipped"];
const AREA_ORDER = ["カテゴリ上位表示", "テクニカル", "計測・データ", "サイト改善", "コンテンツ（LIFE）", "AI検索（AEO）", "レポート"];
const DAY = 86400000;

const isIso = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const ms = (iso: string) => Date.parse(`${iso}T00:00:00+09:00`);
const ym = (iso: string) => iso.slice(0, 7);
const monthLabel = (m: string) => `${m.slice(0, 4)}年${Number(m.slice(5))}月`;
const fmtDate = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
const sumEffort = (t: ClientWbsTask, month?: string) =>
  Object.entries(t.effort).reduce((a, [k, v]) => a + (!month || k === month ? v : 0), 0);
const fmtH = (h: number) => (h % 1 === 0 ? `${h}` : h.toFixed(1));

// 前後の月を列挙（YYYY-MM）
function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

// 月フィルタ: その月に稼働があった／期間が重なる施策
function inMonth(t: ClientWbsTask, month: string): boolean {
  if (t.effort[month]) return true;
  const s = t.start ?? t.dueDate;
  const e = t.dueDate ?? t.start;
  if (!s || !e) return t.status === "doing" || t.status === "wait";
  return ym(s) <= month && month <= ym(e);
}

function StatusPill({ st, small }: { st: ClientWbsStatus; small?: boolean }) {
  const dashed = st === "skipped" || st === "paused";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border bg-white font-medium text-ink whitespace-nowrap ${
        small ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      } ${dashed ? "border-dashed border-ink-faint/60" : "border-line"}`}
    >
      <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[st] }} />
      {STATUS_LABEL[st]}
    </span>
  );
}

function Chip({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className={`rounded-full border px-3 py-1 text-xs whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-bronze-deep ${
        on ? "border-bronze bg-bronze/10 text-bronze-deep font-semibold" : "border-line bg-white text-ink-soft hover:border-bronze"
      }`}
    >
      {children}
    </button>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-line bg-white px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] text-ink-faint">
        {accent && <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: accent }} />}
        {label}
      </div>
      <div className="mt-1 font-serif text-2xl font-semibold text-ink leading-none">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-ink-faint">{sub}</div>}
    </div>
  );
}

function EffectText({ t }: { t: ClientWbsTask }) {
  if (t.kpi?.metrics?.length) {
    const m = t.kpi.metrics[0];
    return (
      <span className="text-ink">
        {m.name}: {m.baseline} → <span className="font-semibold">{m.current}</span>
      </span>
    );
  }
  if (t.outcome) return <span className="text-ink">{t.outcome}</span>;
  if (t.status === "done") return <span className="text-ink-faint">効果測定なし（対応完了）</span>;
  return <span className="text-ink-faint">効果測定前</span>;
}

function Period({ t }: { t: ClientWbsTask }) {
  const s = t.start ? fmtDate(t.start) : null;
  const e = t.dueDate ? fmtDate(t.dueDate) : t.due;
  return (
    <span className="whitespace-nowrap tabular-nums">
      {s ? `${s}〜${e}` : e}
    </span>
  );
}

// ---- 詳細ドロワー ------------------------------------------------------------------------
function DetailPanel({ t, onClose, months }: { t: ClientWbsTask; onClose: () => void; months: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>("a[href],button,[tabindex]:not([tabindex='-1'])");
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus();
    };
  }, [onClose]);

  const effortMonths = months.filter((m) => t.effort[m]);
  return (
    <div className="fixed inset-0 z-40 print:hidden" role="dialog" aria-modal="true" aria-labelledby={`wbs-detail-${t.id}`}>
      <button type="button" aria-label="閉じる" className="absolute inset-0 bg-night/30" onClick={onClose} />
      <div
        ref={ref}
        className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-2xl bg-paper shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[520px] sm:rounded-none"
      >
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-line bg-paper/95 px-5 py-4 backdrop-blur">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill st={t.status} />
              <span className="text-[11px] text-ink-faint">{t.area}</span>
            </div>
            <h2 id={`wbs-detail-${t.id}`} className="mt-2 font-serif text-lg font-semibold leading-snug text-ink">
              {t.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-soft hover:border-bronze focus-visible:outline-2 focus-visible:outline-bronze-deep"
          >
            閉じる
          </button>
        </div>
        <div className="space-y-5 px-5 py-5 text-sm leading-relaxed text-ink">
          <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-ink-faint">期間</dt>
            <dd><Period t={t} /></dd>
            <dt className="text-ink-faint">担当</dt>
            <dd>{t.owner}</dd>
            {t.waitFor && (
              <>
                <dt className="text-ink-faint">待ち先</dt>
                <dd className="font-medium">{t.waitFor}</dd>
              </>
            )}
          </dl>
          <section>
            <h3 className="text-xs font-semibold tracking-wide text-bronze-deep">現在地</h3>
            <p className="mt-1">{t.now}</p>
          </section>
          {t.reason && (
            <section>
              <h3 className="text-xs font-semibold tracking-wide text-bronze-deep">判断の記録</h3>
              <p className="mt-1">{t.reason}</p>
            </section>
          )}
          {t.next && (
            <section>
              <h3 className="text-xs font-semibold tracking-wide text-bronze-deep">次に起きること</h3>
              <p className="mt-1">{t.next}</p>
            </section>
          )}
          <section>
            <h3 className="text-xs font-semibold tracking-wide text-bronze-deep">効果</h3>
            {t.kpi ? (
              <div className="mt-2 overflow-x-auto rounded-lg border border-line bg-white">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-paper text-left text-ink-faint">
                      <th className="px-3 py-2 font-medium">指標</th>
                      <th className="px-3 py-2 font-medium">基準</th>
                      <th className="px-3 py-2 font-medium">現在</th>
                      <th className="px-3 py-2 font-medium">目標</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.kpi.metrics.map((m) => (
                      <tr key={m.name} className="border-t border-line">
                        <td className="px-3 py-2">{m.name}</td>
                        <td className="px-3 py-2 tabular-nums">{m.baseline}</td>
                        <td className="px-3 py-2 font-semibold tabular-nums">{m.current}</td>
                        <td className="px-3 py-2">{m.target}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="border-t border-line px-3 py-2 text-[11px] text-ink-faint">
                  目的: {t.kpi.kgi}　｜　出典: {t.kpi.source}　｜　次回判定: {t.kpi.next}
                </p>
              </div>
            ) : (
              <p className="mt-1"><EffectText t={t} /></p>
            )}
          </section>
          <section>
            <h3 className="text-xs font-semibold tracking-wide text-bronze-deep">工数</h3>
            {effortMonths.length ? (
              <ul className="mt-1 flex flex-wrap gap-2">
                {effortMonths.map((m) => (
                  <li key={m} className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs">
                    {monthLabel(m)} <span className="font-semibold tabular-nums">{fmtH(t.effort[m])}h</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-ink-faint">施策単位の工数記録なし（定例・調整の稼働に含む）</p>
            )}
          </section>
          {t.links.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold tracking-wide text-bronze-deep">関連資料</h3>
              <ul className="mt-1 space-y-1">
                {t.links.map((l) => (
                  <li key={l.url}>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-bronze-deep underline decoration-bronze/40 underline-offset-2 hover:decoration-bronze-deep">
                      {l.label} ↗
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- タイムライン（月単位） ---------------------------------------------------------------
function Timeline({ tasks, months, today, onOpen }: { tasks: ClientWbsTask[]; months: string[]; today: number | null; onOpen: (id: string) => void }) {
  const first = ms(`${months[0]}-01`);
  const lastM = months[months.length - 1];
  const end = new Date(Number(lastM.slice(0, 4)), Number(lastM.slice(5)), 1).getTime(); // 翌月1日
  const span = end - first;
  const pct = (t: number) => Math.min(100, Math.max(0, ((t - first) / span) * 100));
  const rows = tasks.filter((t) => t.start || t.dueDate);
  if (!rows.length) return <p className="rounded-xl border border-dashed border-line px-5 py-6 text-sm text-ink-faint">表示できる期間つきの施策がありません。</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white">
      <div className="min-w-[720px]">
        <div className="grid" style={{ gridTemplateColumns: "minmax(220px,1.2fr) 3fr" }}>
          <div className="border-b border-line px-4 py-2 text-[11px] text-ink-faint">施策</div>
          <div className="relative border-b border-line">
            <div className="flex">
              {months.map((m) => (
                <div key={m} className="flex-1 border-l border-line px-2 py-2 text-[11px] text-ink-faint">{monthLabel(m)}</div>
              ))}
            </div>
          </div>
          {rows.map((t) => {
            const s = ms(t.start ?? t.dueDate!);
            const e = ms(t.dueDate ?? t.start!) + DAY;
            const l = pct(s);
            const w = Math.max(1.2, pct(e) - l);
            return (
              <div key={t.id} className="contents">
                <button
                  type="button"
                  onClick={() => onOpen(t.id)}
                  className="flex items-center gap-2 border-t border-line px-4 py-2 text-left text-xs text-ink hover:bg-paper focus-visible:outline-2 focus-visible:outline-bronze-deep"
                >
                  <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_COLOR[t.status] }} />
                  <span className="truncate">{t.title}</span>
                </button>
                <div className="relative border-t border-line">
                  <div className="absolute inset-0 flex" aria-hidden>
                    {months.map((m) => <div key={m} className="flex-1 border-l border-line/70" />)}
                  </div>
                  {today !== null && today >= first && today <= end && (
                    <div aria-hidden className="absolute inset-y-0 w-px bg-bronze" style={{ left: `${pct(today)}%` }} />
                  )}
                  <div
                    role="img"
                    aria-label={`${t.title} ${t.start ? fmtDate(t.start) : ""}〜${t.dueDate ? fmtDate(t.dueDate) : t.due}`}
                    className={`absolute top-1/2 h-3 -translate-y-1/2 rounded-full ${t.status === "skipped" || t.status === "paused" ? "opacity-40" : ""}`}
                    style={{ left: `${l}%`, width: `${w}%`, background: STATUS_COLOR[t.status] }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---- 本体 ------------------------------------------------------------------------------
const subscribeNoop = () => () => {};
const todayClient = () => Math.floor(Date.now() / DAY) * DAY; // 日単位で丸め、同一レンダー内で安定させる
const todayServer = () => null;

export default function ClientWbsBoard({ data }: { data: ClientWbsData }) {
  // 「今日」はサーバー描画では未確定（null）にし、クライアントで日付を確定する（SSR不一致の回避）
  const today = useSyncExternalStore(subscribeNoop, todayClient, todayServer);
  // 絞り込み状態はURLから初期化する（共有したURLで同じ表示になる）
  const sp = useSearchParams();
  const [month, setMonth] = useState<string>(() => sp.get("m") ?? "");
  const [statuses, setStatuses] = useState<Set<ClientWbsStatus>>(
    () => new Set((sp.get("st")?.split(",").filter((s) => s in STATUS_LABEL) ?? []) as ClientWbsStatus[]),
  );
  const [areas, setAreas] = useState<Set<string>>(() => new Set(sp.get("area")?.split(",").filter(Boolean) ?? []));
  const [q, setQ] = useState(() => sp.get("q") ?? "");
  const [view, setView] = useState<"list" | "timeline">(() => (sp.get("v") === "timeline" ? "timeline" : "list"));
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (today === null) return;
    try {
      const p = new URLSearchParams();
      if (month) p.set("m", month);
      if (statuses.size) p.set("st", [...statuses].join(","));
      if (areas.size) p.set("area", [...areas].join(","));
      if (q) p.set("q", q);
      if (view === "timeline") p.set("v", "timeline");
      const s = p.toString();
      window.history.replaceState(null, "", s ? `?${s}` : window.location.pathname);
    } catch {
      // 共有用URLの更新は補助機能
    }
  }, [month, statuses, areas, q, view, today]);

  const months = useMemo(() => {
    const ymsAll = data.tasks.flatMap((t) => [t.start, t.dueDate].filter(isIso).map(ym)).concat(Object.keys(data.overhead));
    const max = [...ymsAll, data.updated.slice(0, 7)].sort().pop()!;
    return monthRange(data.site.since, max);
  }, [data]);
  const currentMonth = data.updated.slice(0, 7);

  const toggle = <T,>(set: Set<T>, v: T, setter: (s: Set<T>) => void) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    setter(n);
  };
  const reset = () => {
    setMonth("");
    setStatuses(new Set());
    setAreas(new Set());
    setQ("");
  };
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.tasks.filter(
      (t) =>
        (!month || inMonth(t, month)) &&
        (!statuses.size || statuses.has(t.status)) &&
        (!areas.size || areas.has(t.area)) &&
        (!needle || [t.title, t.now, t.reason, t.next, t.outcome, t.owner, t.waitFor].join(" ").toLowerCase().includes(needle)),
    );
  }, [data.tasks, month, statuses, areas, q]);

  const counts = useMemo(() => {
    const c: Record<ClientWbsStatus, number> = { todo: 0, doing: 0, wait: 0, done: 0, skipped: 0, paused: 0 };
    for (const t of data.tasks) c[t.status] += 1;
    return c;
  }, [data.tasks]);
  const monthEffort = useMemo(() => {
    const tasksH = data.tasks.reduce((a, t) => a + (t.effort[currentMonth] ?? 0), 0);
    const ovH = (data.overhead[currentMonth] ?? []).reduce((a, r) => a + r.hours, 0);
    return { tasksH, ovH, total: tasksH + ovH };
  }, [data, currentMonth]);

  // いま止まっている施策: 待ち／期限超過の予定・進行中
  const stalled = useMemo(() => {
    return data.tasks
      .filter((t) => t.status === "wait" || (today !== null && t.dueDate !== null && (t.status === "todo" || t.status === "doing") && ms(t.dueDate) + DAY <= today))
      .sort((a, b) => (a.status === b.status ? 0 : a.status === "wait" ? -1 : 1));
  }, [data.tasks, today]);

  const groups = useMemo(() => {
    const byArea = new Map<string, ClientWbsTask[]>();
    for (const t of filtered) byArea.set(t.area, [...(byArea.get(t.area) ?? []), t]);
    const order = (t: ClientWbsTask) => STATUS_ORDER.indexOf(t.status) * 10 + t.pri;
    return [...byArea.entries()]
      .sort((a, b) => AREA_ORDER.indexOf(a[0]) - AREA_ORDER.indexOf(b[0]))
      .map(([area, ts]) => [area, ts.sort((a, b) => order(a) - order(b))] as const);
  }, [filtered]);

  const openTask = useCallback((id: string) => setOpen(id), []);
  const closeTask = useCallback(() => setOpen(null), []);
  const selected = open ? data.tasks.find((t) => t.id === open) ?? null : null;
  const stale = today !== null && (today - ms(data.updated)) / DAY > 7;
  const filterActive = !!(month || statuses.size || areas.size || q);

  return (
    <>
      {/* ヘッダー */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-10 lg:px-8">
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-bronze">Projects / {data.site.label}</p>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-serif text-3xl font-semibold md:text-4xl">{data.site.label} SEO施策WBS</h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
                {data.site.client}様向けに大沢が進めているSEO施策の進行表です。進行中・待ち・完了に加え、見送りや中断の判断理由と工数を記録しています。対象期間: {monthLabel(data.site.since)}〜
              </p>
            </div>
            <div className="text-right text-xs text-ink-faint">
              <div>
                更新日 <span className="font-semibold text-ink tabular-nums">{data.updated}</span>
              </div>
              {stale && <div className="mt-1 rounded-md bg-bronze/10 px-2 py-1 text-bronze-deep">更新から7日以上経過しています</div>}
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="進行中" value={`${counts.doing}`} accent={STATUS_COLOR.doing} />
            <StatCard label="待ち（判断・実装待ち）" value={`${counts.wait}`} accent={STATUS_COLOR.wait} />
            <StatCard label="予定" value={`${counts.todo}`} accent={STATUS_COLOR.todo} />
            <StatCard label="完了" value={`${counts.done}`} sub={`未実行 ${counts.skipped}・中断 ${counts.paused}`} accent={STATUS_COLOR.done} />
            <StatCard
              label={`${monthLabel(currentMonth)}の工数`}
              value={`${fmtH(monthEffort.total)}h`}
              sub={`施策 ${fmtH(monthEffort.tasksH)}h＋定例等 ${fmtH(monthEffort.ovH)}h${data.effortNote[currentMonth] ? "・" + data.effortNote[currentMonth] : ""}`}
            />
          </div>
        </div>
      </section>

      {/* いま止まっている施策 */}
      {stalled.length > 0 && (
        <section className="border-b border-line bg-white/60">
          <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-serif text-xl font-semibold">ご判断・ご対応をお願いしたい施策</h2>
              <span className="text-xs text-ink-faint">{stalled.length}件</span>
            </div>
            <p className="mt-1 text-xs text-ink-faint">他の方の判断・実装を待っている施策と、期限を過ぎた大沢の施策です。定例の議題にそのままお使いください。</p>
            <ul className="mt-4 grid gap-3 md:grid-cols-2">
              {stalled.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => openTask(t.id)}
                    className="flex w-full flex-col gap-2 rounded-xl border border-line bg-white px-4 py-3 text-left transition hover:border-bronze hover:shadow-sm focus-visible:outline-2 focus-visible:outline-bronze-deep"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill st={t.status} small />
                      <span className="text-[11px] text-ink-faint">{t.area}</span>
                      <span className="ml-auto text-[11px] text-ink-faint">期限 <Period t={t} /></span>
                    </div>
                    <div className="font-medium leading-snug text-ink">{t.title}</div>
                    <div className="text-xs text-ink-soft">
                      {t.status === "wait" ? (
                        <>
                          <span className="font-semibold text-ink">待ち先: {t.waitFor}</span>
                          {t.next && <span className="block mt-0.5">再開に必要なこと: {t.next}</span>}
                        </>
                      ) : (
                        <span>期限超過（大沢）: {t.now}</span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* 絞り込み */}
      <div className="sticky top-[49px] z-20 border-b border-line bg-paper/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2.5 sm:px-6 lg:px-8">
          <label className="flex items-center gap-1 text-xs text-ink-soft">
            <span className="sr-only">月で絞り込み</span>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink focus-visible:outline-2 focus-visible:outline-bronze-deep"
            >
              <option value="">すべての月</option>
              {months.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
          </label>
          <span aria-hidden className="mx-1 h-4 w-px bg-line" />
          {STATUS_ORDER.map((st) => (
            <Chip key={st} on={statuses.has(st)} onClick={() => toggle(statuses, st, setStatuses)}>
              <span aria-hidden className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: STATUS_COLOR[st] }} />
              {STATUS_LABEL[st]} {counts[st]}
            </Chip>
          ))}
          <span aria-hidden className="mx-1 hidden h-4 w-px bg-line sm:inline-block" />
          <div className="flex flex-wrap gap-1.5">
            {AREA_ORDER.filter((a) => data.tasks.some((t) => t.area === a)).map((a) => (
              <Chip key={a} on={areas.has(a)} onClick={() => toggle(areas, a, setAreas)}>{a}</Chip>
            ))}
          </div>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="施策名・内容で検索"
            aria-label="施策名・内容で検索"
            className="min-w-[160px] flex-1 rounded-full border border-line bg-white px-3 py-1 text-xs text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-bronze-deep"
          />
          <div className="ml-auto flex items-center gap-1">
            {filterActive && (
              <button type="button" onClick={reset} className="rounded-full px-3 py-1 text-xs text-ink-faint hover:text-bronze-deep">
                絞り込みを解除
              </button>
            )}
            <div role="group" aria-label="表示切替" className="flex overflow-hidden rounded-full border border-line bg-white text-xs">
              {(["list", "timeline"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  className={`px-3 py-1 ${view === v ? "bg-bronze/10 font-semibold text-bronze-deep" : "text-ink-soft hover:text-bronze-deep"}`}
                >
                  {v === "list" ? "一覧" : "タイムライン"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 本体 */}
      <section className="py-8 md:py-10">
        <div className="mx-auto max-w-6xl space-y-10 px-4 sm:px-6 lg:px-8">
          <p className="text-xs text-ink-faint">
            {filtered.length}件を表示{filterActive ? "（絞り込み中）" : ""}
          </p>
          {view === "timeline" ? (
            <Timeline tasks={filtered} months={month ? [month] : months} today={today} onOpen={openTask} />
          ) : groups.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-5 py-6 text-sm text-ink-faint">条件に合う施策がありません。</p>
          ) : (
            groups.map(([area, ts]) => (
              <div key={area}>
                <div className="flex items-baseline gap-3">
                  <h2 className="font-serif text-xl font-semibold">{area}</h2>
                  <span className="text-xs text-ink-faint">{ts.length}件</span>
                </div>
                {/* PC: 表 */}
                <div className="mt-3 hidden overflow-x-auto rounded-xl border border-line bg-white md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-paper text-left text-[11px] text-ink-faint">
                        <th className="px-3 py-2 font-medium">状態</th>
                        <th className="px-3 py-2 font-medium">施策</th>
                        <th className="px-3 py-2 font-medium">期間</th>
                        <th className="px-3 py-2 font-medium">担当・待ち先</th>
                        <th className="px-3 py-2 font-medium">現在地</th>
                        <th className="px-3 py-2 text-right font-medium">工数</th>
                        <th className="px-3 py-2 font-medium">効果</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ts.map((t) => (
                        <tr key={t.id} className="border-t border-line align-top hover:bg-paper/60">
                          <td className="px-3 py-2.5"><StatusPill st={t.status} small /></td>
                          <td className="px-3 py-2.5">
                            <button
                              type="button"
                              onClick={() => openTask(t.id)}
                              className="text-left font-medium text-ink underline-offset-2 hover:text-bronze-deep hover:underline focus-visible:outline-2 focus-visible:outline-bronze-deep"
                            >
                              {t.title}
                            </button>
                            {t.reason && (t.status === "skipped" || t.status === "paused") && (
                              <div className="mt-1 text-xs text-ink-soft">理由: {t.reason}</div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-ink-soft"><Period t={t} /></td>
                          <td className="px-3 py-2.5 text-xs">
                            <div>{t.owner}</div>
                            {t.waitFor && <div className="text-ink-soft">待ち: {t.waitFor}</div>}
                          </td>
                          <td className="max-w-[26rem] px-3 py-2.5 text-xs leading-relaxed text-ink-soft">{t.now}</td>
                          <td className="px-3 py-2.5 text-right text-xs tabular-nums">{sumEffort(t) ? `${fmtH(sumEffort(t))}h` : "—"}</td>
                          <td className="max-w-[18rem] px-3 py-2.5 text-xs leading-relaxed"><EffectText t={t} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* スマホ: カード */}
                <ul className="mt-3 space-y-2 md:hidden">
                  {ts.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => openTask(t.id)}
                        className="w-full rounded-xl border border-line bg-white px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-bronze-deep"
                      >
                        <div className="flex items-center gap-2">
                          <StatusPill st={t.status} small />
                          <span className="ml-auto text-[11px] text-ink-faint"><Period t={t} /></span>
                        </div>
                        <div className="mt-1.5 font-medium leading-snug text-ink">{t.title}</div>
                        <div className="mt-1 text-xs leading-relaxed text-ink-soft">{t.now}</div>
                        <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-ink-faint">
                          <span>{t.owner}{t.waitFor ? `／待ち: ${t.waitFor}` : ""}</span>
                          {sumEffort(t) > 0 && <span className="tabular-nums">工数 {fmtH(sumEffort(t))}h</span>}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}

          {/* 凡例・用語 */}
          <div className="rounded-xl border border-line bg-white px-5 py-4 text-xs leading-relaxed text-ink-soft">
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {STATUS_ORDER.map((st) => (
                <span key={st} className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[st] }} />
                  <span className="font-medium text-ink">{STATUS_LABEL[st]}</span>
                  <span>
                    {st === "wait" && "＝他の方の判断・実装を待っている"}
                    {st === "skipped" && "＝検討のうえ実施しないと判断した"}
                    {st === "paused" && "＝着手後に止めている（再開条件あり）"}
                    {st === "doing" && "＝大沢が作業中"}
                    {st === "todo" && "＝着手前"}
                    {st === "done" && "＝対応が終わり効果を監視中／完了"}
                  </span>
                </span>
              ))}
            </div>
            <p className="mt-3">
              工数は施策単位で記録できたものを表示しています。定例・議事録・調整などの稼働は上部の「工数」カードに含めています。
              {Object.entries(data.effortNote).map(([m, n]) => ` ${monthLabel(m)}: ${n}。`)}
            </p>
          </div>
        </div>
      </section>

      {selected && <DetailPanel t={selected} onClose={closeTask} months={months} />}
    </>
  );
}
