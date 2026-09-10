"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// クライアント向け「施策WBS」。データは src/data/wbs-client/<slug>.json
// （michi 側 wbs-client-publish.mjs が tasks.js＋公開文面から生成。内部メモは含まない）。
// 認証済み server component（projects/[site]/page.tsx）から props で受け取る。
// 画面構成（GPT-6 Astra 設計・実装監修 2026-09-10）: 売上・変化・成果／次の節目 → ご判断・ご確認
// （判断依頼＋待ち＋期限超過）→ 一覧（領域別）／工程表 → 月間工数。
// 絞り込み状態はURL（?m=&st=&area=&v=&q=）を正とし、共有したURLで同じ表示になる。
// 日付はすべて日本時間（JST）で判定する。

export type ClientWbsStatus = "todo" | "doing" | "wait" | "done" | "skipped" | "paused";
export type ClientWbsKpi = {
  kgi: string;
  metrics: { name: string; baseline: string; current: string; target: string; asof: string }[];
  source: string;
  next: string;
};
export type ClientWbsDecision = { ask: string; who: string; by: string; replyTo: string };
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
  impact: string;
  stoppedOn: string | null;
  decision: ClientWbsDecision | null;
  noEffect: boolean;
  effort: Record<string, number>;
  links: { label: string; url: string }[];
  kpi?: ClientWbsKpi;
};
export type ClientWbsData = {
  site: { slug: string; domain: string; label: string; client: string; since: string };
  updated: string;
  summary: {
    asOf: string;
    kpi?: { label: string; actual: string; target: string; rate: string; yoy: string; note: string; link?: { label: string; url: string } };
    changes: string[];
    unmeasured: string[];
    milestones: { date: string; label: string }[];
  };
  effortNote: Record<string, string>;
  overhead: Record<string, { label: string; hours: number }[]>;
  tasks: ClientWbsTask[];
};

const STATUS_LABEL: Record<ClientWbsStatus, string> = {
  doing: "進行中",
  wait: "待ち",
  todo: "予定",
  done: "完了",
  skipped: "見送り",
  paused: "中断",
};
const STATUS_HELP: Record<ClientWbsStatus, string> = {
  doing: "大沢が作業中",
  wait: "他の方の判断・実装を待っている",
  todo: "着手前",
  done: "対応が終わり、効果を監視中または完了",
  skipped: "検討のうえ実施しないと判断した",
  paused: "着手後に止めている（再開条件あり）",
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
const JST = 9 * 3600000;
const ALL = "all";
const AUTO = "auto"; // 対象月の既定＝日本時間の当月
// 補助テキスト: スマホは14px以上、PCは12px。色は ink-soft（白地でコントラスト比 4.5:1 以上）
const META = "text-sm md:text-xs text-ink-soft";

const isIso = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const ms = (iso: string) => Date.parse(`${iso}T00:00:00+09:00`); // JSTの0時
const isoJst = (t: number) => new Date(t + JST).toISOString().slice(0, 10); // JSTの日付
const ym = (iso: string) => iso.slice(0, 7);
const monthLabel = (m: string) => `${m.slice(0, 4)}年${Number(m.slice(5))}月`;
const fmtDate = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
const fmtH = (h: number) => (h % 1 === 0 ? `${h}` : h.toFixed(1));
const isActive = (t: ClientWbsTask) => t.status === "doing" || t.status === "wait" || t.status === "todo";
const nextMonth = (m: string) => {
  const [y, mm] = m.split("-").map(Number);
  return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`;
};

// 前後の月を列挙（YYYY-MM）
function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to && out.length < 120) {
    out.push(cur);
    cur = nextMonth(cur);
  }
  return out;
}

// 対象月の定義: その月に稼働を記録した施策、または期間がその月と重なる施策。
// 期限未定（開始日あり・期限なし）は開始月以降ずっと対象（開区間）。日付のない施策は進行中・待ち・予定のものだけ。
// 期限を過ぎて未完了の施策は、期限月から当月まで繰り越して表示する。
function inMonth(t: ClientWbsTask, month: string, todayYm: string | null): boolean {
  if (month === ALL) return true;
  if (t.effort[month]) return true;
  const s = t.start ? ym(t.start) : null;
  const e = t.dueDate ? ym(t.dueDate) : null;
  if (s && e && s <= month && month <= e) return true;
  if (s && !e && isActive(t) && s <= month) return true;
  if (!s && e && month === e) return true;
  if (!s && !e && isActive(t)) return true;
  if (e && isActive(t) && todayYm && e < month && month <= todayYm) return true; // 期限超過の繰越
  return false;
}
const isOverdue = (t: ClientWbsTask, todayIso: string | null) =>
  todayIso !== null && t.dueDate !== null && (t.status === "todo" || t.status === "doing") && t.dueDate < todayIso;

function StatusPill({ st, small }: { st: ClientWbsStatus; small?: boolean }) {
  const dashed = st === "skipped" || st === "paused";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border bg-white font-medium text-ink whitespace-nowrap ${
        small ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm md:text-xs"
      } ${dashed ? "border-dashed border-ink-soft/50" : "border-line"}`}
      title={STATUS_HELP[st]}
    >
      <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[st] }} />
      {STATUS_LABEL[st]}
    </span>
  );
}

function OverdueBadge() {
  return <span className="rounded-md bg-[#b3352e]/10 px-1.5 py-0.5 text-xs font-semibold text-[#8f2a24]">期限超過</span>;
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-3 py-1.5 text-sm md:py-1 md:text-xs whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-bronze-deep ${
        on ? "border-bronze bg-bronze/10 text-bronze-deep font-semibold" : "border-line bg-white text-ink-soft hover:border-bronze"
      }`}
    >
      {children}
    </button>
  );
}

function Period({ t }: { t: ClientWbsTask }) {
  const s = t.start ? fmtDate(t.start) : null;
  const e = t.dueDate ? fmtDate(t.dueDate) : t.due;
  return (
    <span className="whitespace-nowrap tabular-nums">
      {s ? `${s}〜${e}` : e}
      {!t.dueDate && <span className="ml-1">（時期未定）</span>}
    </span>
  );
}

// 一覧の「次の対応・担当」: 次に起きること（無ければ現在地）＋担当／待ち先
function NextText({ t }: { t: ClientWbsTask }) {
  const who = t.waitFor ? `${t.owner}／待ち: ${t.waitFor}` : t.owner;
  return (
    <>
      <span className="text-ink">{t.next || t.now}</span>
      <span className={`mt-0.5 block ${META}`}>{who}</span>
    </>
  );
}

// 効果: KPIあり→基準→現在（測定日）、結果文あり→そのまま、対象外→明示、完了で未測定→未測定、それ以外→測定前
function EffectText({ t }: { t: ClientWbsTask }) {
  if (t.kpi?.metrics?.length) {
    const m = t.kpi.metrics[0];
    return (
      <span className="text-ink">
        {m.name}: {m.baseline} → <span className="font-semibold">{m.current}</span>
        <span className="ml-1 text-ink-soft">（{m.asof}時点）</span>
      </span>
    );
  }
  if (t.outcome) return <span className="text-ink">{t.outcome}</span>;
  if (t.noEffect) return <span className="text-ink-soft">効果測定の対象外（回答・報告・データ提供）</span>;
  if (t.status === "done") return <span className="text-ink-soft">効果は未測定</span>;
  return <span className="text-ink-soft">効果測定前</span>;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold tracking-wide text-bronze-deep">{children}</h3>;
}

// ---- 詳細ドロワー ------------------------------------------------------------------------
function DetailPanel({ t, onClose, months, todayIso }: { t: ClientWbsTask; onClose: () => void; months: string[]; todayIso: string | null }) {
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
        className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-2xl bg-paper shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[540px] sm:rounded-none"
      >
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-line bg-paper/95 px-5 py-4 backdrop-blur">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill st={t.status} />
              {isOverdue(t, todayIso) && <OverdueBadge />}
              <span className={META}>{t.area}</span>
            </div>
            <h2 id={`wbs-detail-${t.id}`} className="mt-2 font-serif text-lg font-semibold leading-snug text-ink">
              {t.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-line bg-white px-3 py-1.5 text-sm text-ink-soft hover:border-bronze focus-visible:outline-2 focus-visible:outline-bronze-deep md:text-xs"
          >
            閉じる
          </button>
        </div>
        <div className="space-y-5 px-5 py-5 text-base leading-relaxed text-ink sm:text-sm">
          <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2">
            <dt className="text-ink-soft">期間</dt>
            <dd><Period t={t} /></dd>
            <dt className="text-ink-soft">担当</dt>
            <dd>{t.owner}</dd>
            {t.waitFor && (
              <>
                <dt className="text-ink-soft">待ち先</dt>
                <dd className="font-medium">{t.waitFor}</dd>
              </>
            )}
            {t.stoppedOn && (
              <>
                <dt className="text-ink-soft">{t.status === "paused" ? "中断日" : "停止日"}</dt>
                <dd className="tabular-nums">{t.stoppedOn}</dd>
              </>
            )}
          </dl>
          {t.decision && (
            <section className="rounded-lg border border-bronze/40 bg-bronze/5 px-4 py-3">
              <SectionHeading>ご判断のお願い</SectionHeading>
              <p className="mt-1">{t.decision.ask}</p>
              <p className="mt-1 text-sm text-ink-soft">
                判断者: {t.decision.who}　｜　回答期限: {t.decision.by}
                {t.decision.replyTo && <>　｜　回答先: {t.decision.replyTo}</>}
              </p>
            </section>
          )}
          <section>
            <SectionHeading>現在地</SectionHeading>
            <p className="mt-1">{t.now}</p>
          </section>
          {t.impact && (
            <section>
              <SectionHeading>止まっていることの影響</SectionHeading>
              <p className="mt-1">{t.impact}</p>
            </section>
          )}
          {t.reason && (
            <section>
              <SectionHeading>判断の記録</SectionHeading>
              <p className="mt-1">{t.reason}</p>
            </section>
          )}
          {t.next && (
            <section>
              <SectionHeading>{t.status === "wait" || t.status === "paused" ? "再開に必要なこと" : "次に起きること"}</SectionHeading>
              <p className="mt-1">{t.next}</p>
            </section>
          )}
          <section>
            <SectionHeading>効果</SectionHeading>
            {t.kpi ? (
              <div className="mt-2 overflow-x-auto rounded-lg border border-line bg-white">
                <table className="w-full text-sm md:text-xs">
                  <thead>
                    <tr className="bg-paper text-left text-ink-soft">
                      <th className="px-3 py-2 font-medium">指標</th>
                      <th className="px-3 py-2 font-medium">基準</th>
                      <th className="px-3 py-2 font-medium">現在</th>
                      <th className="px-3 py-2 font-medium">目標</th>
                      <th className="px-3 py-2 font-medium">測定日</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.kpi.metrics.map((m) => (
                      <tr key={m.name} className="border-t border-line">
                        <td className="px-3 py-2">{m.name}</td>
                        <td className="px-3 py-2 tabular-nums">{m.baseline}</td>
                        <td className="px-3 py-2 font-semibold tabular-nums">{m.current}</td>
                        <td className="px-3 py-2">{m.target}</td>
                        <td className="px-3 py-2 tabular-nums">{m.asof}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="border-t border-line px-3 py-2 text-sm text-ink-soft md:text-xs">
                  目的: {t.kpi.kgi}　｜　出典: {t.kpi.source}　｜　次回判定: {t.kpi.next}
                </p>
              </div>
            ) : (
              <p className="mt-1"><EffectText t={t} /></p>
            )}
          </section>
          <section>
            <SectionHeading>工数</SectionHeading>
            {effortMonths.length ? (
              <ul className="mt-1 flex flex-wrap gap-2">
                {effortMonths.map((m) => (
                  <li key={m} className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm md:text-xs">
                    {monthLabel(m)} <span className="font-semibold tabular-nums">{fmtH(t.effort[m])}h</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-ink-soft">施策単位の工数記録なし（定例・調整の稼働に含む）</p>
            )}
          </section>
          {t.links.length > 0 && (
            <section>
              <SectionHeading>関連資料</SectionHeading>
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

// ---- 工程表（月単位） ---------------------------------------------------------------------
function Timeline({ tasks, months, todayIso, onOpen }: { tasks: ClientWbsTask[]; months: string[]; todayIso: string | null; onOpen: (id: string) => void }) {
  const first = ms(`${months[0]}-01`);
  const end = ms(`${nextMonth(months[months.length - 1])}-01`); // 翌月1日（JST）
  const span = end - first;
  const pct = (t: number) => Math.min(100, Math.max(0, ((t - first) / span) * 100));
  const rows = tasks.filter((t) => t.start || t.dueDate);
  const undated = tasks.filter((t) => !t.start && !t.dueDate);
  const today = todayIso ? ms(todayIso) : null;
  if (!rows.length) return <p className="rounded-xl border border-dashed border-line px-5 py-6 text-sm text-ink-soft">表示できる期間つきの施策がありません。</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft md:hidden">工程表は横にスクロールできます。スマホでは「一覧」の方が読みやすくなっています。</p>
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <div className="min-w-[720px]">
          <div className="grid" style={{ gridTemplateColumns: "minmax(240px,1.2fr) 3fr" }}>
            <div className="border-b border-line px-4 py-2 text-xs text-ink-soft">施策</div>
            <div className="relative border-b border-line">
              <div className="flex">
                {months.map((m) => (
                  <div key={m} className="flex-1 border-l border-line px-2 py-2 text-xs text-ink-soft">{monthLabel(m)}</div>
                ))}
              </div>
            </div>
            {rows.map((t) => {
              const s = ms(t.start ?? t.dueDate!);
              const e = ms(t.dueDate ?? t.start!) + DAY;
              const l = pct(s);
              const w = Math.max(1.2, pct(e) - l);
              const label = `${t.title}（${STATUS_LABEL[t.status]}）${t.start ? fmtDate(t.start) : ""}〜${t.dueDate ? fmtDate(t.dueDate) : t.due}`;
              return (
                <div key={t.id} className="contents">
                  <button
                    type="button"
                    onClick={() => onOpen(t.id)}
                    className="flex items-center gap-2 border-t border-line px-4 py-2 text-left text-sm text-ink hover:bg-paper focus-visible:outline-2 focus-visible:outline-bronze-deep md:text-xs"
                  >
                    <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_COLOR[t.status] }} />
                    <span className="leading-snug">{t.title}</span>
                    <span className="sr-only">（{STATUS_LABEL[t.status]}）</span>
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
                      aria-label={label}
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
      {undated.length > 0 && (
        <p className="text-sm text-ink-soft md:text-xs">時期未定のため工程表に出していない施策: {undated.map((t) => t.title).join("、")}</p>
      )}
    </div>
  );
}

// ---- 本体 ------------------------------------------------------------------------------
const subscribeNoop = () => () => {};
const todayIsoClient = () => isoJst(Date.now()); // 日単位（JST）の文字列＝同一日内で安定
const todayIsoServer = () => null;
const AREA_SET = new Set(AREA_ORDER);

export default function ClientWbsBoard({ data }: { data: ClientWbsData }) {
  // 「今日」はサーバー描画では未確定（null）にし、クライアントでJSTの日付を確定する（SSR不一致の回避）
  const todayIso = useSyncExternalStore(subscribeNoop, todayIsoClient, todayIsoServer);
  const todayYm = todayIso ? ym(todayIso) : null;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const months = useMemo(() => {
    const yms = data.tasks
      .flatMap((t) => [t.start, t.dueDate].filter(isIso).map(ym).concat(Object.keys(t.effort)))
      .concat(Object.keys(data.overhead), [ym(data.updated)], todayYm ? [todayYm] : []);
    return monthRange(data.site.since, yms.sort().pop()!);
  }, [data, todayYm]);

  // 絞り込み状態はURLから毎回導出する（不正値は無視）。月の既定＝当月（JST）。当月が未確定の間は内容確認日の月
  const mParam = params.get("m") ?? "";
  const month = mParam === ALL || months.includes(mParam) ? mParam : AUTO;
  const effectiveMonth = month === AUTO ? (todayYm ?? ym(data.updated)) : month;
  const statuses = useMemo(
    () => new Set((params.get("st") ?? "").split(",").filter((s): s is ClientWbsStatus => s in STATUS_LABEL)),
    [params],
  );
  const areas = useMemo(() => new Set((params.get("area") ?? "").split(",").filter((a) => AREA_SET.has(a))), [params]);
  const view: "list" | "timeline" = params.get("v") === "timeline" ? "timeline" : "list";
  const urlQ = params.get("q") ?? "";
  const [q, setQ] = useState(urlQ); // 入力中はローカル（IME対応）。300ms後にURLへ反映
  const [filtersOpen, setFiltersOpen] = useState(() => !!(params.get("st") || params.get("area") || params.get("q")));
  const [showAllAsks, setShowAllAsks] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  // URLの検索パラメータを1つだけ書き換える（無関係なパラメータとハッシュは保持）
  const setParam = useCallback(
    (key: string, value: string) => {
      const p = new URLSearchParams(window.location.search);
      if (value) p.set(key, value);
      else p.delete(key);
      const qs = p.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}${window.location.hash}`, { scroll: false });
    },
    [router, pathname],
  );
  useEffect(() => {
    const v = q.trim();
    if (v === urlQ) return;
    const id = setTimeout(() => setParam("q", v), 300);
    return () => clearTimeout(id);
  }, [q, urlQ, setParam]);

  const toggleIn = (key: "st" | "area", set: Set<string>, v: string) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    setParam(key, [...n].join(","));
  };
  const resetFilters = () => {
    setQ("");
    const p = new URLSearchParams(window.location.search);
    ["st", "area", "q"].forEach((k) => p.delete(k));
    const qs = p.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}${window.location.hash}`, { scroll: false });
  };

  const filtered = useMemo(() => {
    const needle = urlQ.trim().toLowerCase();
    return data.tasks.filter(
      (t) =>
        inMonth(t, effectiveMonth, todayYm) &&
        (!statuses.size || statuses.has(t.status)) &&
        (!areas.size || areas.has(t.area)) &&
        (!needle || [t.title, t.now, t.reason, t.next, t.outcome, t.owner, t.waitFor, t.impact, t.decision?.ask ?? ""].join(" ").toLowerCase().includes(needle)),
    );
  }, [data.tasks, effectiveMonth, todayYm, statuses, areas, urlQ]);

  // 全期間の状態別件数（補助情報）
  const counts = useMemo(() => {
    const c: Record<ClientWbsStatus, number> = { todo: 0, doing: 0, wait: 0, done: 0, skipped: 0, paused: 0 };
    for (const t of data.tasks) c[t.status] += 1;
    return c;
  }, [data.tasks]);

  // ご判断・ご確認（全期間）: 判断依頼あり＋待ち＋期限超過。回答期限／期限の近い順→優先度順
  const asks = useMemo(() => {
    const key = (t: ClientWbsTask) => {
      const d = t.decision?.by ?? t.dueDate;
      return (d ? ms(d) : Number.MAX_SAFE_INTEGER / 10) * 10 + t.pri;
    };
    return data.tasks.filter((t) => t.decision || t.status === "wait" || isOverdue(t, todayIso)).sort((a, b) => key(a) - key(b));
  }, [data.tasks, todayIso]);
  const asksShown = showAllAsks ? asks : asks.slice(0, 3);

  // 月間工数: 対象月の施策別（多い順）＋定例等
  const effort = useMemo(() => {
    const byTask = data.tasks
      .filter((t) => t.effort[effectiveMonth])
      .map((t) => ({ id: t.id, title: t.title, hours: t.effort[effectiveMonth] }))
      .sort((a, b) => b.hours - a.hours);
    const tasksH = byTask.reduce((a, r) => a + r.hours, 0);
    const overhead = data.overhead[effectiveMonth] ?? [];
    const ovH = overhead.reduce((a, r) => a + r.hours, 0);
    return { byTask, tasksH, overhead, ovH, total: tasksH + ovH, note: data.effortNote[effectiveMonth] ?? "" };
  }, [data, effectiveMonth]);

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
  const stale = todayIso !== null && (ms(todayIso) - ms(data.updated)) / DAY > 7;
  const filterActive = !!(statuses.size || areas.size || urlQ);
  const upcoming = data.summary.milestones.filter((m) => todayIso === null || m.date >= todayIso);
  const kpi = data.summary.kpi;

  return (
    <>
      {/* ドロワー表示中は背景を操作不能にする（inert） */}
      <div inert={selected ? true : undefined}>
        {/* ヘッダー: 売上・変化・成果／次の節目 */}
        <section className="border-b border-line">
          <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6 md:py-9 lg:px-8">
            <p className="mb-3 text-xs uppercase tracking-[0.3em] text-bronze">Projects / {data.site.label}</p>
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <div>
                <h1 className="font-serif text-3xl font-semibold md:text-4xl">{data.site.label} SEO施策WBS</h1>
                <p className="mt-2 max-w-2xl text-base leading-relaxed text-ink-soft sm:text-sm">
                  {data.site.client}様向けに大沢が進めているSEO施策の進行表です。ご判断・ご確認をお願いしたい事項を先頭に、施策ごとの現在地・次の対応・判断の記録・工数・効果を掲載しています。
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-ink-soft md:text-xs">
                <label className="flex items-center gap-2">
                  <span>対象月</span>
                  <select
                    value={month === AUTO ? AUTO : month}
                    onChange={(e) => setParam("m", e.target.value === AUTO ? "" : e.target.value)}
                    className="rounded-full border border-line bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-bronze-deep"
                  >
                    <option value={AUTO}>当月（{monthLabel(todayYm ?? ym(data.updated))}）</option>
                    {months.map((m) => (
                      <option key={m} value={m}>{monthLabel(m)}</option>
                    ))}
                    <option value={ALL}>全期間（{monthLabel(data.site.since)}〜）</option>
                  </select>
                </label>
                <span>
                  内容確認日 <span className="font-semibold text-ink tabular-nums">{data.updated}</span>
                  <span className="ml-1">（データは15分ごとに自動同期）</span>
                </span>
                {stale && <span className="rounded-md bg-bronze/10 px-2 py-1 text-bronze-deep">確認から7日以上経過しています</span>}
              </div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {kpi && (
                <div className="rounded-xl border border-line bg-white px-5 py-4">
                  <h2 className="text-xs font-semibold tracking-wide text-bronze-deep">{kpi.label}</h2>
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-serif text-2xl font-semibold tabular-nums text-ink">{kpi.actual}</span>
                    <span className="text-sm text-ink-soft">目標 {kpi.target}（達成率 <span className="font-semibold text-ink">{kpi.rate}</span>）</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">{kpi.yoy}。{kpi.note}</p>
                  {kpi.link && (
                    <a href={kpi.link.url} className="mt-2 inline-block text-sm text-bronze-deep underline decoration-bronze/40 underline-offset-2 hover:decoration-bronze-deep">
                      {kpi.link.label} →
                    </a>
                  )}
                </div>
              )}
              <div className="rounded-xl border border-line bg-white px-5 py-4">
                <h2 className="text-xs font-semibold tracking-wide text-bronze-deep">前回定例からの変化・成果（{fmtDate(data.summary.asOf)}時点）</h2>
                <ul className="mt-2 space-y-1.5 text-base leading-relaxed text-ink sm:text-sm">
                  {data.summary.changes.map((c) => (
                    <li key={c} className="flex gap-2"><span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-bronze" />{c}</li>
                  ))}
                </ul>
                {data.summary.unmeasured.length > 0 && (
                  <p className="mt-3 text-sm leading-relaxed text-ink-soft">効果測定前: {data.summary.unmeasured.join("／")}</p>
                )}
              </div>
              <div className="rounded-xl border border-line bg-white px-5 py-4">
                <h2 className="text-xs font-semibold tracking-wide text-bronze-deep">次の節目</h2>
                {upcoming.length ? (
                  <ol className="mt-2 space-y-1.5 text-base leading-relaxed text-ink sm:text-sm">
                    {upcoming.map((m) => (
                      <li key={m.date + m.label} className="flex gap-3">
                        <span className="w-14 shrink-0 tabular-nums text-ink-soft">{fmtDate(m.date)}</span>
                        <span>{m.label}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-2 text-sm text-ink-soft">次回の節目は未設定です（次の定例で更新します）。</p>
                )}
                <p className="mt-3 text-sm text-ink-soft md:text-xs">
                  全期間の件数: {STATUS_ORDER.map((st) => `${STATUS_LABEL[st]} ${counts[st]}`).join("・")}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ご判断・ご確認 */}
        <section className="border-b border-line bg-white/60">
          <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-serif text-xl font-semibold">ご判断・ご確認をお願いしたい施策</h2>
              <span className={META}>全期間 {asks.length}件（ご判断のお願い、他の方の判断・実装待ち、期限を過ぎた大沢の施策）</span>
            </div>
            {asks.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-line px-5 py-5 text-sm text-ink-soft">現在、ご判断をお願いしている施策はありません。</p>
            ) : (
              <>
                <ul className="mt-4 grid gap-3 md:grid-cols-3">
                  {asksShown.map((t) => {
                    const overdue = isOverdue(t, todayIso);
                    const d = t.decision;
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => openTask(t.id)}
                          className="flex h-full w-full flex-col gap-2 rounded-xl border border-line bg-white px-4 py-3 text-left transition hover:border-bronze hover:shadow-sm focus-visible:outline-2 focus-visible:outline-bronze-deep"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            {d ? <span className="rounded-full bg-bronze/10 px-2 py-0.5 text-xs font-semibold text-bronze-deep">ご判断のお願い</span> : <StatusPill st={t.status} small />}
                            {overdue && <OverdueBadge />}
                            <span className={`ml-auto ${META}`}>
                              {d ? `回答期限 ${fmtDate(d.by)}` : <>期限 <Period t={t} /></>}
                            </span>
                          </div>
                          <div className="text-base font-medium leading-snug text-ink sm:text-sm">{t.title}</div>
                          <dl className="grid grid-cols-[3.5rem_1fr] gap-x-2 gap-y-1 text-sm md:text-xs">
                            <dt className="text-ink-soft">依頼</dt>
                            <dd className="font-medium text-ink">{d ? d.ask : t.status === "wait" ? t.next || "ご判断・ご対応" : "期限の見直し（大沢）"}</dd>
                            <dt className="text-ink-soft">影響</dt>
                            <dd className="text-ink-soft">{t.impact || t.now}</dd>
                            <dt className="text-ink-soft">判断者</dt>
                            <dd className="text-ink-soft">{d ? d.who : t.waitFor ? `${t.waitFor} ／ 大沢` : t.owner}</dd>
                            <dt className="text-ink-soft">回答先</dt>
                            <dd className="text-ink-soft">{d?.replyTo || "次回定例またはSlack"}</dd>
                          </dl>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {asks.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowAllAsks((v) => !v)}
                    aria-expanded={showAllAsks}
                    className="mt-3 text-sm text-bronze-deep underline decoration-bronze/40 underline-offset-2 hover:decoration-bronze-deep md:text-xs"
                  >
                    {showAllAsks ? "上位3件だけ表示する" : `すべて表示する（${asks.length}件）`}
                  </button>
                )}
              </>
            )}
          </div>
        </section>

        {/* 表示切替・絞り込み */}
        <div className="sticky top-[49px] z-20 border-b border-line bg-paper/95 backdrop-blur print:hidden">
          <div className="mx-auto max-w-6xl px-4 py-2 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center gap-2">
              <div role="group" aria-label="表示切替" className="flex overflow-hidden rounded-full border border-line bg-white text-sm md:text-xs">
                {(["list", "timeline"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setParam("v", v === "timeline" ? "timeline" : "")}
                    aria-pressed={view === v}
                    className={`px-3 py-1.5 ${view === v ? "bg-bronze/10 font-semibold text-bronze-deep" : "text-ink-soft hover:text-bronze-deep"}`}
                  >
                    {v === "list" ? "一覧" : "工程表"}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setFiltersOpen((v) => !v)}
                aria-expanded={filtersOpen}
                className={`rounded-full border px-3 py-1.5 text-sm md:text-xs ${filterActive ? "border-bronze bg-bronze/10 font-semibold text-bronze-deep" : "border-line bg-white text-ink-soft hover:border-bronze"}`}
              >
                絞り込み{filterActive ? "（適用中）" : ""} {filtersOpen ? "▴" : "▾"}
              </button>
              <p role="status" aria-live="polite" className={META}>
                {effectiveMonth === ALL ? "全期間" : monthLabel(effectiveMonth)}の施策 {filtered.length}件
              </p>
              {filterActive && (
                <button type="button" onClick={resetFilters} className="ml-auto text-sm text-ink-soft hover:text-bronze-deep md:text-xs">
                  絞り込みを解除
                </button>
              )}
            </div>
            {filtersOpen && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 pb-1">
                {STATUS_ORDER.map((st) => (
                  <Chip key={st} on={statuses.has(st)} onClick={() => toggleIn("st", statuses, st)}>
                    <span aria-hidden className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: STATUS_COLOR[st] }} />
                    {STATUS_LABEL[st]}
                  </Chip>
                ))}
                <span aria-hidden className="mx-1 hidden h-4 w-px bg-line sm:inline-block" />
                {AREA_ORDER.filter((a) => data.tasks.some((t) => t.area === a)).map((a) => (
                  <Chip key={a} on={areas.has(a)} onClick={() => toggleIn("area", areas, a)}>{a}</Chip>
                ))}
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="施策名・内容で検索"
                  aria-label="施策名・内容で検索"
                  className="min-w-[180px] flex-1 rounded-full border border-line bg-white px-3 py-1.5 text-sm text-ink placeholder:text-ink-soft focus-visible:outline-2 focus-visible:outline-bronze-deep md:py-1 md:text-xs"
                />
              </div>
            )}
          </div>
        </div>

        {/* 一覧／工程表 */}
        <section className="py-8 md:py-10">
          <div className="mx-auto max-w-6xl space-y-10 px-4 sm:px-6 lg:px-8">
            {view === "timeline" ? (
              <Timeline tasks={filtered} months={effectiveMonth === ALL ? months : [effectiveMonth]} todayIso={todayIso} onOpen={openTask} />
            ) : groups.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-5 py-6 text-sm text-ink-soft">
                条件に合う施策がありません。対象月を「全期間」にするか、絞り込みを解除してください。
              </p>
            ) : (
              groups.map(([area, ts]) => (
                <div key={area}>
                  <div className="flex items-baseline gap-3">
                    <h2 className="font-serif text-xl font-semibold">{area}</h2>
                    <span className={META}>{ts.length}件</span>
                  </div>
                  {/* PC: 表 */}
                  <div className="mt-3 hidden overflow-x-auto rounded-xl border border-line bg-white md:block">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-paper text-left text-xs text-ink-soft">
                          <th className="w-[38%] px-3 py-2 font-medium">施策</th>
                          <th className="px-3 py-2 font-medium">状態</th>
                          <th className="px-3 py-2 font-medium">次の対応・担当</th>
                          <th className="px-3 py-2 font-medium">期限</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ts.map((t) => (
                          <tr key={t.id} className="border-t border-line align-top hover:bg-paper/60">
                            <td className="px-3 py-2.5">
                              <button
                                type="button"
                                onClick={() => openTask(t.id)}
                                className="text-left font-medium leading-snug text-ink underline-offset-2 hover:text-bronze-deep hover:underline focus-visible:outline-2 focus-visible:outline-bronze-deep"
                              >
                                {t.title}
                              </button>
                              {t.decision && <div className="mt-1 text-xs leading-relaxed text-bronze-deep">ご判断のお願い: {t.decision.ask}（{t.decision.who}・{fmtDate(t.decision.by)}まで）</div>}
                              {(t.status === "skipped" || t.status === "paused") && t.reason && (
                                <div className="mt-1 text-xs leading-relaxed text-ink-soft">
                                  {t.status === "skipped" ? "見送りの理由" : "中断の理由"}: {t.reason}
                                  {t.next && <span className="block">再開条件: {t.next}</span>}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <StatusPill st={t.status} small />
                                {isOverdue(t, todayIso) && <OverdueBadge />}
                              </div>
                            </td>
                            <td className="max-w-[26rem] px-3 py-2.5 text-xs leading-relaxed"><NextText t={t} /></td>
                            <td className="px-3 py-2.5 text-xs text-ink-soft"><Period t={t} /></td>
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
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusPill st={t.status} small />
                            {isOverdue(t, todayIso) && <OverdueBadge />}
                            <span className={`ml-auto ${META}`}>期限 <Period t={t} /></span>
                          </div>
                          <div className="mt-1.5 text-base font-medium leading-snug text-ink">{t.title}</div>
                          {t.decision && <div className="mt-1 text-sm leading-relaxed text-bronze-deep">ご判断のお願い: {t.decision.ask}（{t.decision.who}・{fmtDate(t.decision.by)}まで）</div>}
                          <div className="mt-1 text-sm leading-relaxed"><NextText t={t} /></div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}

            {/* 月間工数・主要内訳 */}
            <div className="rounded-xl border border-line bg-white px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-serif text-lg font-semibold">{monthLabel(effectiveMonth === ALL ? (todayYm ?? ym(data.updated)) : effectiveMonth)}の工数</h2>
                <span className="font-serif text-2xl font-semibold tabular-nums">{fmtH(effort.total)}h</span>
              </div>
              {effort.note && <p className="mt-1 text-sm text-ink-soft md:text-xs">{effort.note}</p>}
              {effort.total === 0 ? (
                <p className="mt-3 text-sm text-ink-soft">この月の工数記録はありません。</p>
              ) : (
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <div>
                    <SectionHeading>施策別（{fmtH(effort.tasksH)}h）</SectionHeading>
                    <ul className="mt-1.5 space-y-1 text-sm">
                      {effort.byTask.map((r) => (
                        <li key={r.id} className="flex items-baseline justify-between gap-3">
                          <button type="button" onClick={() => openTask(r.id)} className="text-left text-ink underline-offset-2 hover:text-bronze-deep hover:underline">
                            {r.title}
                          </button>
                          <span className="shrink-0 tabular-nums text-ink-soft">{fmtH(r.hours)}h</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <SectionHeading>定例・調整など（{fmtH(effort.ovH)}h）</SectionHeading>
                    <ul className="mt-1.5 space-y-1 text-sm">
                      {effort.overhead.map((r) => (
                        <li key={r.label} className="flex items-baseline justify-between gap-3">
                          <span className="text-ink">{r.label}</span>
                          <span className="shrink-0 tabular-nums text-ink-soft">{fmtH(r.hours)}h</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* 凡例・用語 */}
            <div className="rounded-xl border border-line bg-white px-5 py-4 text-sm leading-relaxed text-ink-soft md:text-xs">
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {STATUS_ORDER.map((st) => (
                  <span key={st} className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[st] }} />
                    <span className="font-medium text-ink">{STATUS_LABEL[st]}</span>
                    <span>＝{STATUS_HELP[st]}</span>
                  </span>
                ))}
              </div>
              <p className="mt-3">
                「期限超過」は状態とは別に、期限を過ぎた予定・進行中の施策に表示し、完了するまで当月に繰り越します。対象月は「その月に稼働があった、または期間が重なる施策」を表示し、期限未定の施策は開始月以降ずっと、日付のない施策は進行中・待ち・予定のものだけ含めます。件数は全期間、工数は対象月で集計しています（全期間のときは当月）。日付の判定は日本時間です。
              </p>
            </div>
          </div>
        </section>
      </div>

      {selected && <DetailPanel t={selected} onClose={closeTask} months={months} todayIso={todayIso} />}
    </>
  );
}
