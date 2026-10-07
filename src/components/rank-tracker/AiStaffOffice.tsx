"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { RunRow, StaffRow, TaskRow } from "@/lib/rank-tracker/ai-staff";
import { buildSeats, countTasks, latestRuns, type Counts, type SeatState } from "@/lib/rank-tracker/ai-staff-view";
import { AVATAR_CSS, RoleBust, StaffAvatar } from "./AiStaffAvatar";

// 「オフィス」パネル（2026-10-07 に GPT-6 Astra の監修で再設計）。
// - 件数はタスク単位で統一（確認待ち／作業中／受付・準備／先方待ち。失敗は確認待ちの内数）
// - 島（案件）は件数を入口にした開閉式。席は役割名・件数・確認候補・いまの工程を文字で示し、色に頼らない（形の記号を併記）
// - 動かすのは作業中のタイピングだけ。更新で再マウントせず、位置と開閉状態を保つ
// - 経過時間は「作業開始から」（無ければ「依頼から」）。進捗率や残り時間には変換しない

const STATE_META: Record<SeatState, { label: string }> = {
  working: { label: "作業中" },
  queued: { label: "受付（担当確保待ち）" },
  review: { label: "確認待ちあり" },
  idle: { label: "待機中" },
};
const ROLE_ORDER: Record<string, number> = { leader: 0, seo: 1, analytics: 2, critic: 3 };

const CSS = `
${AVATAR_CSS}
.aio-office :is(button, summary):focus-visible { outline: 3px solid #86672f; outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  .aio-office, .aio-office *, .aio-office *::before, .aio-office *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}
`;

// 状態の記号（色が見えなくても形で分かる）
type MarkKind = SeatState | "waiting" | "failed";
const MARK_PATH: Record<MarkKind, string> = {
  idle: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18",
  queued: "M6 3h12v3l-6 6 6 6v3H6v-3l6-6-6-6z",
  working: "M3 6h18v12H3z M6 10h2m2 0h2m2 0h2m2 0h1 M7 14h10",
  review: "M6 3h12v18H6z M9 8h6m-6 4h6m-6 4h4",
  waiting: "M8 4v16M16 4v16",
  failed: "M12 3L2 21h20z M12 9v5m0 3v1",
};
function Mark({ kind }: { kind: MarkKind }) {
  return (
    <svg viewBox="0 0 24 24" className="inline-block h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={MARK_PATH[kind]} />
    </svg>
  );
}

function CountsView({ c, compact = false }: { c: Counts; compact?: boolean }) {
  const items = [
    ["review", "確認待ち", c.review, "#2a78d6"],
    ["working", "作業中", c.working - c.queued, "#fab219"],
    ["queued", "受付・準備", c.queued, "#8b877c"],
    ["waiting", "先方待ち", c.waiting, "#b07cc6"],
  ] as const;
  return (
    <span className={`flex flex-wrap gap-x-3 gap-y-1 text-ink ${compact ? "text-xs" : "text-sm"}`}>
      {items.map(([kind, label, n, color]) => (
        <span key={kind} className={`inline-flex items-center gap-1 border-b-2 pb-0.5 ${n === 0 ? "text-ink-faint" : ""}`} style={{ borderColor: color }}>
          <Mark kind={kind} />
          {label} <b className="tabular-nums">{n}</b>件
        </span>
      ))}
      {c.failed > 0 && (
        <span className="inline-flex items-center gap-1 font-semibold text-[#b3352e]">
          <Mark kind="failed" />
          うち実行失敗 {c.failed}件
        </span>
      )}
    </span>
  );
}

// PC（lg 以上）かどうか。島の初期開閉に使う（SSR では閉じた状態で描き、クライアントで購読する）
const DESKTOP_MQ = "(min-width: 1024px)";
function useDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(DESKTOP_MQ);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DESKTOP_MQ).matches,
    () => false,
  );
}

function elapsedLabel(iso: string | null, now: number): string {
  if (!iso) return "";
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const m = Math.floor(ms / 60000);
  return m < 1 ? "1分未満" : m < 60 ? `${m}分` : `${Math.floor(m / 60)}時間${m % 60}分`;
}

export default function AiStaffOffice({
  staff,
  tasks,
  runs,
  pjLabel,
  onSelect,
}: {
  staff: StaffRow[];
  tasks: TaskRow[];
  runs: RunRow[];
  pjLabel: (pj: string) => string;
  onSelect: (pj: string, role: string) => void;
}) {
  const seats = useMemo(() => buildSeats(staff, tasks, runs), [staff, tasks, runs]);
  const latest = useMemo(() => latestRuns(runs), [runs]);
  const totals = useMemo(() => countTasks(tasks, latest), [tasks, latest]);
  const [order, setOrder] = useState<string[]>([]);

  // 島の並びは固定。「確認待ち順に並べる」を押したときだけ変える。役割は リーダー→SEO→解析→反論 で固定
  const islands = useMemo(() => {
    const ids = [...new Set([...staff.map((s) => s.pj), ...tasks.map((t) => t.pj)])];
    const rank = (pj: string) => {
      const i = order.indexOf(pj);
      return i < 0 ? Number.MAX_SAFE_INTEGER : i;
    };
    return ids
      .map((pj) => ({
        pj,
        // 席から合算せず、担当未設定のタスクも含める
        counts: countTasks(
          tasks.filter((t) => t.pj === pj),
          latest,
        ),
        list: seats.filter((s) => s.staff.pj === pj).sort((a, b) => (ROLE_ORDER[a.staff.role] ?? 4) - (ROLE_ORDER[b.staff.role] ?? 4)),
      }))
      .sort((a, b) => rank(a.pj) - rank(b.pj) || pjLabel(a.pj).localeCompare(pjLabel(b.pj), "ja"));
  }, [staff, tasks, seats, latest, order, pjLabel]);

  // 経過時間（作業中があるときだけ30秒ごとに進める）
  const [now, setNow] = useState(() => Date.now());
  const hasActive = totals.working > 0;
  useEffect(() => {
    if (!hasActive) return;
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, [hasActive]);

  // 最新依頼ごとに、この画面で観測できた工程だけを保持する（新しい順・最大3件）。
  // props（latest）が変わったときに描画中に派生状態を更新する（effect 内の setState を避ける）
  const [stepsState, setStepsState] = useState<{ latest: Map<string, RunRow>; steps: Record<string, string[]> }>({ latest, steps: {} });
  let steps = stepsState.steps;
  if (stepsState.latest !== latest) {
    const next: Record<string, string[]> = {};
    for (const r of latest.values()) {
      const key = `${r.task_id}|${r.created_at ?? ""}`;
      const previous = stepsState.steps[key] ?? [];
      const progress = r.progress?.trim();
      next[key] = !progress || previous[0] === progress ? previous : [progress, ...previous].slice(0, 3);
    }
    steps = next;
    setStepsState({ latest, steps: next });
  }

  // 通知は確認待ち・失敗の件数が変わったときだけ（15秒ごとの工程は読み上げない）
  const countsKey = `${totals.review}/${totals.failed}`;
  const [noticeState, setNoticeState] = useState({ key: countsKey, text: "" });
  if (noticeState.key !== countsKey) setNoticeState({ key: countsKey, text: `確認待ち${totals.review}件、うち実行失敗${totals.failed}件。` });
  const notice = noticeState.text;

  // 島の初期開閉: PC は開く、スマホは件数だけ見せて閉じる。以後はネイティブ details に任せ、更新で上書きしない
  const openByDefault = useDesktop();

  return (
    <section aria-label="オフィス（AI社員の状態）" className="aio-office rounded-lg border border-line bg-white/50 p-4 text-ink">
      <style>{CSS}</style>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold">オフィス</h2>
        <button
          type="button"
          className="min-h-11 rounded border border-line bg-white px-3 text-sm text-ink-soft hover:border-bronze"
          onClick={() =>
            setOrder([...islands].sort((a, b) => b.counts.review - a.counts.review || b.counts.waiting - a.counts.waiting || pjLabel(a.pj).localeCompare(pjLabel(b.pj), "ja")).map((x) => x.pj))
          }
        >
          確認待ち順に並べる
        </button>
      </div>
      <CountsView c={totals} />
      <p className="my-3 text-sm leading-relaxed text-ink-soft">件数はタスク単位です。確認待ちの担当を開き、返答を読んで「OK・完了」か「修正内容を書く」を選びます。送付・公開は管理者が行います。</p>
      <p className="sr-only" role="status" aria-atomic="true">
        {notice}
      </p>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {islands.map(({ pj, counts, list }) => (
          <details key={pj} className="rounded-lg border border-line bg-paper" open={openByDefault || undefined}>
            <summary className="min-h-11 cursor-pointer rounded-lg p-4">
              <strong className="mb-2 inline-block text-base">{pjLabel(pj)}</strong>
              <CountsView c={counts} compact />
              <span className="mt-2 block text-xs text-ink-faint">
                未指示 {counts.open}件・完了 {counts.done}件・担当別の状態を開閉
              </span>
            </summary>
            <div className="grid gap-3 p-3 pt-0 md:grid-cols-2">
              {list.map((seat) => {
                const roleName = seat.staff.name.split("／")[1] ?? seat.staff.role;
                const current = seat.current;
                const key = current ? `${current.taskId}|${current.createdAt ?? ""}` : "";
                const recent = steps[key] ?? [];
                const stateLabel = current?.runStatus === "claimed" ? "担当確保済み・開始待ち" : current?.runStatus === "queued" ? "受付（担当確保待ち）" : STATE_META[seat.state].label;
                const otherActive = seat.counts.working - (current ? 1 : 0);
                const since = current?.startedAt ? `作業開始から ${elapsedLabel(current.startedAt, now) || "1分未満"}` : current?.createdAt ? `依頼から ${elapsedLabel(current.createdAt, now) || "1分未満"}` : "";
                return (
                  <article key={seat.staff.id} className="min-w-0 rounded-md border border-line bg-white p-3">
                    <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                      <RoleBust role={seat.staff.role} size={24} />
                      {roleName}
                    </h3>
                    <CountsView c={seat.counts} compact />
                    {seat.reviewTitle && (
                      <p className="mt-3 break-words text-sm leading-relaxed">
                        <b>確認候補：</b>
                        {seat.reviewTitle}
                      </p>
                    )}
                    <div className="mt-3 flex items-start gap-2">
                      <div className="w-28 shrink-0" title={seat.counts.failed > 0 ? "実行失敗あり" : undefined}>
                        <StaffAvatar role={seat.staff.role} state={seat.state} reviewCount={seat.reviewCount} failed={seat.counts.failed > 0} />
                      </div>
                      <div className="min-w-0 flex-1 text-sm leading-relaxed">
                        <p className="flex items-center gap-1 font-medium">
                          <Mark kind={seat.state} />
                          {stateLabel}
                        </p>
                        {current && (
                          <>
                            <p className="mt-1 break-words">{current.title}</p>
                            {since && <p className="text-ink-soft">{since}</p>}
                            <p className="mt-2 break-words">現在：{current.progress || (seat.state === "queued" ? stateLabel : "工程はまだ報告されていません")}</p>
                            {current.progress && <p className="text-xs text-ink-faint">{current.progressAt ? `工程更新から ${elapsedLabel(current.progressAt, now) || "1分未満"}` : "工程の更新時刻は未報告"}</p>}
                            {otherActive > 0 && <p className="text-ink-soft">ほか {otherActive}件が作業中または受付・準備中</p>}
                          </>
                        )}
                      </div>
                    </div>
                    {current && recent.length > 0 && (
                      <details className="mt-2 text-sm">
                        <summary className="min-h-11 cursor-pointer py-3 text-ink-soft underline decoration-dotted underline-offset-2">観測した工程（新しい順・最大3件）</summary>
                        <ol className="list-decimal space-y-1 pl-5">
                          {recent.map((text, i) => (
                            <li key={i} className="break-words">
                              {text}
                            </li>
                          ))}
                        </ol>
                        <p className="mt-2 text-xs text-ink-faint">この画面を開いて以降の観測です。取得の間に進んだ工程は含まれない場合があります。再読み込みで消えます。</p>
                      </details>
                    )}
                    <p className="mt-3 text-xs text-ink-faint">
                      未指示 {seat.openCount}件・完了 {seat.doneCount}件
                    </p>
                    <button
                      type="button"
                      onClick={() => onSelect(seat.staff.pj, seat.staff.role)}
                      aria-label={`${pjLabel(pj)}、${roleName}のタスクを表示`}
                      className="mt-2 min-h-11 w-full rounded border border-line bg-white px-3 text-sm font-medium text-ink-soft hover:border-bronze hover:text-bronze-deep"
                    >
                      この担当のタスクを表示
                    </button>
                  </article>
                );
              })}
              {list.length === 0 && <p className="text-sm text-ink-soft">この案件の社員が登録されていません。</p>}
            </div>
          </details>
        ))}
        {islands.length === 0 && <p className="text-sm text-ink-soft">社員・タスクが登録されていません。</p>}
      </div>
    </section>
  );
}
