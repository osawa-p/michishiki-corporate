"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RunRow, StaffRow, TaskRow } from "@/lib/rank-tracker/ai-staff";
import { buildSeats, type Seat, type SeatState } from "@/lib/rank-tracker/ai-staff-view";

// 「オフィス」パネル: 案件ごとの島に AI社員4体を座らせ、いまの状態をアニメーションで表す。
// 状態はボードと同じデータ（runs）から導く。待機＝静止／受付＝砂時計／作業中＝タイピング＋経過時間／確認待ち＝机の上の書類。
// 作業中→確認待ちに変わった瞬間は書類が飛ぶ。動きを減らす設定（prefers-reduced-motion）では全て静止する。

const STATE_META: Record<SeatState, { label: string; color: string }> = {
  working: { label: "作業中", color: "#fab219" },
  queued: { label: "受付（確保待ち）", color: "#8b877c" },
  review: { label: "確認待ちあり", color: "#2a78d6" },
  idle: { label: "待機中", color: "#c9c5ba" },
};
// 役割ごとの見た目（体の色・髪の色）。名前は staff.name（案件名／役割名）から取る
const ROLE_LOOK: Record<string, { body: string; hair: string }> = {
  leader: { body: "#c9a66b", hair: "#3b3a36" },
  seo: { body: "#7fa37f", hair: "#6b4f2a" },
  analytics: { body: "#7faee0", hair: "#2f4a6b" },
  critic: { body: "#d88a84", hair: "#5a2d2d" },
};
const FALLBACK_LOOK = { body: "#c9c5ba", hair: "#3b3a36" };

const CSS = `
@keyframes aio-type { from { transform: translateY(0) } to { transform: translateY(-2.5px) } }
@keyframes aio-blink { 0%, 92%, 100% { transform: scaleY(1) } 95% { transform: scaleY(0.1) } }
@keyframes aio-breathe { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(1.2px) } }
@keyframes aio-dots { 0%, 80%, 100% { opacity: .15 } 40% { opacity: 1 } }
@keyframes aio-flip { 0% { transform: rotate(0deg) } 40% { transform: rotate(180deg) } 100% { transform: rotate(180deg) } }
@keyframes aio-fly { 0% { transform: translate(0, 0) rotate(0deg); opacity: 1 } 100% { transform: translate(34px, -70px) rotate(18deg); opacity: 0 } }
@keyframes aio-glow { 0%, 100% { opacity: .55 } 50% { opacity: 1 } }
@keyframes aio-pop { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }
.aio-pop { animation: aio-pop .3s ease-out; }
.aio-type { animation: aio-type .32s ease-in-out infinite alternate; transform-box: fill-box; }
.aio-blink { animation: aio-blink 4.2s infinite; transform-box: fill-box; transform-origin: center; }
.aio-breathe { animation: aio-breathe 3.2s ease-in-out infinite; transform-box: fill-box; }
.aio-dots > * { animation: aio-dots 1.2s infinite; }
.aio-dots > *:nth-child(2) { animation-delay: .2s } .aio-dots > *:nth-child(3) { animation-delay: .4s }
.aio-flip { animation: aio-flip 2.4s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.aio-fly { animation: aio-fly 1.1s ease-in forwards; transform-box: fill-box; }
.aio-glow { animation: aio-glow 1.6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .aio-type, .aio-blink, .aio-breathe, .aio-dots > *, .aio-flip, .aio-fly, .aio-glow, .aio-pop { animation: none !important; }
}
`;

function Avatar({ role, state, reviewCount, flying }: { role: string; state: SeatState; reviewCount: number; flying: boolean }) {
  const look = ROLE_LOOK[role] ?? FALLBACK_LOOK;
  const working = state === "working";
  const papers = Math.min(reviewCount, 5);
  return (
    <svg viewBox="0 0 120 100" className="h-auto w-full" aria-hidden="true" focusable="false">
      {/* 机 */}
      <rect x="8" y="72" width="104" height="6" rx="2" fill="#e2ded2" />
      <rect x="14" y="78" width="4" height="14" fill="#d6d1c3" />
      <rect x="102" y="78" width="4" height="14" fill="#d6d1c3" />
      {/* 椅子 */}
      <rect x="20" y="48" width="32" height="26" rx="7" fill="#d6d1c3" />
      {/* モニター */}
      <rect x="66" y="42" width="40" height="27" rx="3" fill="#2b2a26" />
      <rect x="69" y="45" width="34" height="21" rx="2" fill={working ? "#dfe9f7" : "#c9c5ba"} className={working ? "aio-glow" : ""} />
      {role === "analytics" ? (
        <g fill={working ? "#2a78d6" : "#8b877c"}>
          <rect x="73" y="58" width="4" height="6" />
          <rect x="79" y="53" width="4" height="11" />
          <rect x="85" y="56" width="4" height="8" />
          <rect x="91" y="49" width="4" height="15" />
          <rect x="97" y="52" width="4" height="12" />
        </g>
      ) : (
        <g stroke={working ? "#56534a" : "#8b877c"} strokeWidth="1.6" strokeLinecap="round">
          <line x1="73" y1="50" x2="97" y2="50" />
          <line x1="73" y1="55" x2="91" y2="55" />
          <line x1="73" y1="60" x2="95" y2="60" />
        </g>
      )}
      <rect x="83" y="69" width="6" height="3" fill="#2b2a26" />
      {/* キーボード */}
      <rect x="50" y="66" width="24" height="4" rx="1" fill="#8b877c" />
      {/* 体 */}
      <g className={state === "idle" ? "aio-breathe" : ""}>
        <rect x="24" y="50" width="26" height="24" rx="9" fill={look.body} />
        <circle cx="37" cy="37" r="12" fill="#efdcc3" />
        <path d="M25 35 q12 -15 24 0 v-3 q-12 -10 -24 0 z" fill={look.hair} />
        <g className="aio-blink">
          <rect x="32" y="36" width="2.4" height="3.2" rx="1" fill="#2b2a26" />
          <rect x="40" y="36" width="2.4" height="3.2" rx="1" fill="#2b2a26" />
        </g>
        {role === "critic" && <path d="M33 43 q4 -2 8 0" stroke="#5a2d2d" strokeWidth="1.2" fill="none" />}
        {role !== "critic" && <path d="M33 43 q4 2 8 0" stroke="#5a2d2d" strokeWidth="1.2" fill="none" />}
      </g>
      {/* 手（作業中はタイピング） */}
      <g className={working ? "aio-type" : ""}>
        <rect x="46" y="61" width="10" height="4.5" rx="2.2" fill="#efdcc3" />
        <rect x="56" y="63" width="9" height="4.5" rx="2.2" fill="#efdcc3" />
      </g>
      {/* 役割の小物 */}
      {role === "leader" && (
        <g>
          <rect x="10" y="55" width="11" height="15" rx="1" fill="#fff" stroke="#8b877c" strokeWidth="1" />
          <line x1="12.5" y1="60" x2="18.5" y2="60" stroke="#8b877c" strokeWidth="1" />
          <line x1="12.5" y1="63" x2="18.5" y2="63" stroke="#8b877c" strokeWidth="1" />
          <line x1="12.5" y1="66" x2="16.5" y2="66" stroke="#8b877c" strokeWidth="1" />
        </g>
      )}
      {role === "seo" && (
        <g>
          <circle cx="16" cy="57" r="5" fill="none" stroke="#56534a" strokeWidth="2" />
          <line x1="19.5" y1="60.5" x2="24" y2="66" stroke="#56534a" strokeWidth="2.4" strokeLinecap="round" />
        </g>
      )}
      {role === "critic" && <line x1="10" y1="68" x2="22" y2="58" stroke="#b3352e" strokeWidth="3" strokeLinecap="round" />}
      {/* 机の上の書類（確認待ち） */}
      {Array.from({ length: papers }).map((_, i) => (
        <rect key={i} x={88 - i * 1.2} y={70 - i * 1.6} width="14" height="3" rx="0.6" fill="#fff" stroke="#8b877c" strokeWidth="0.8" />
      ))}
      {/* 受付中: 砂時計 */}
      {state === "queued" && (
        <g className="aio-flip">
          <path d="M100 22 h10 l-5 6 z" fill="#8b877c" />
          <path d="M100 34 h10 l-5 -6 z" fill="#c9c5ba" />
        </g>
      )}
      {/* 作業中: 吹き出しの点 */}
      {working && (
        <g className="aio-dots" fill="#56534a">
          <circle cx="98" cy="28" r="2" />
          <circle cx="104" cy="28" r="2" />
          <circle cx="110" cy="28" r="2" />
        </g>
      )}
      {/* 返答が返った瞬間: 飛ぶ書類 */}
      {flying && <rect className="aio-fly" x="52" y="58" width="16" height="4" rx="0.8" fill="#fff" stroke="#2a78d6" strokeWidth="1" />}
    </svg>
  );
}

function elapsedLabel(startedAt: string | null, now: number): string {
  if (!startedAt) return "";
  const ms = now - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const m = Math.floor(ms / 60000);
  return m < 1 ? "開始直後" : m < 60 ? `${m}分` : `${Math.floor(m / 60)}時間${m % 60}分`;
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
  const islands = useMemo(() => {
    const m: Record<string, Seat[]> = {};
    for (const s of seats) (m[s.staff.pj] ||= []).push(s);
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b));
  }, [seats]);

  // 作業中/受付 → 確認待ち に変わった社員の書類を飛ばす（1.1秒）
  const prev = useRef<Record<string, SeatState>>({});
  const [flying, setFlying] = useState<Record<string, number>>({});
  useEffect(() => {
    const changed: string[] = [];
    for (const s of seats) {
      const before = prev.current[s.staff.id];
      if ((before === "working" || before === "queued") && s.state === "review") changed.push(s.staff.id);
      prev.current[s.staff.id] = s.state;
    }
    if (!changed.length) return;
    const at = Date.now();
    setFlying((f) => ({ ...f, ...Object.fromEntries(changed.map((id) => [id, at])) }));
    const t = window.setTimeout(() => setFlying((f) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== at))), 1300);
    return () => window.clearTimeout(t);
  }, [seats]);

  // 経過時間を1分ごとに進める（作業中の社員がいるときだけ）
  const anyWorking = seats.some((s) => s.state === "working");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!anyWorking) return;
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, [anyWorking]);

  const totals = seats.reduce(
    (a, s) => ({ working: a.working + (s.state === "working" ? 1 : 0), queued: a.queued + (s.state === "queued" ? 1 : 0), review: a.review + s.reviewCount }),
    { working: 0, queued: 0, review: 0 },
  );

  return (
    <section aria-label="オフィス（AI社員の状態）" className="rounded-lg border border-line bg-white/50 p-4">
      <style>{CSS}</style>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-ink-soft">
        <span className="font-serif text-sm font-semibold text-ink">オフィス</span>
        <span>
          作業中 <b className="font-mono">{totals.working}</b>
        </span>
        <span>
          受付 <b className="font-mono">{totals.queued}</b>
        </span>
        <span>
          確認待ちの書類 <b className="font-mono">{totals.review}</b>
        </span>
        <span className="ml-auto text-[11px] text-ink-faint">席を押すとその社員のタスクに絞り込み</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {islands.map(([pj, list]) => (
          <div key={pj} className="rounded-md border border-line bg-paper/70 p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-sm font-semibold">{pjLabel(pj)}</span>
              <span className="text-[11px] text-ink-faint">
                未指示 {list.reduce((a, s) => a + s.openCount, 0)}・完了 {list.reduce((a, s) => a + s.doneCount, 0)}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {list.map((seat) => {
                const meta = STATE_META[seat.state];
                const roleName = seat.staff.name.split("／")[1] ?? seat.staff.role;
                return (
                  <button
                    key={seat.staff.id}
                    type="button"
                    onClick={() => onSelect(seat.staff.pj, seat.staff.role)}
                    title={`${roleName}: ${meta.label}${seat.current ? `（${seat.current.title}）` : ""}`}
                    className="group relative rounded-md border border-transparent p-1 text-left transition-colors hover:border-bronze/60 hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-bronze-deep"
                  >
                    {/* いまの工程（派遣係が30秒ごとに更新）。文が変わるたびに吹き出しが出直す */}
                    {seat.state === "working" && seat.current?.progress && (
                      <div
                        key={seat.current.progress}
                        className="aio-pop pointer-events-none absolute left-1 right-1 top-0 z-10 rounded-md border border-line bg-white px-1.5 py-0.5 text-[10px] leading-snug text-ink shadow-sm"
                        title={seat.current.progress}
                      >
                        <span className="line-clamp-2">{seat.current.progress}</span>
                        <span className="absolute -bottom-1 left-4 h-2 w-2 rotate-45 border-b border-r border-line bg-white" aria-hidden />
                      </div>
                    )}
                    <Avatar role={seat.staff.role} state={seat.state} reviewCount={seat.reviewCount} flying={!!flying[seat.staff.id]} />
                    <p className="mt-1 truncate text-[11px] font-semibold leading-tight">{roleName}</p>
                    <p className="flex items-center gap-1 text-[10px] text-ink-soft">
                      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} aria-hidden />
                      {meta.label}
                      {seat.state === "working" && seat.current?.startedAt && <span className="text-ink-faint">{elapsedLabel(seat.current.startedAt, now)}</span>}
                      {seat.state === "review" && <span className="text-ink-faint">{seat.reviewCount}件</span>}
                    </p>
                    {seat.current && <p className="truncate text-[10px] text-ink-faint">{seat.current.title}</p>}
                    {seat.state === "working" && (
                      <div className="mt-1 h-1 w-full overflow-hidden rounded bg-line" aria-hidden>
                        <div
                          className="h-full rounded bg-[#fab219]"
                          style={{ width: `${Math.min(95, Math.max(6, ((now - (seat.current?.startedAt ? new Date(seat.current.startedAt).getTime() : now)) / (45 * 60_000)) * 100))}%` }}
                        />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {islands.length === 0 && <p className="text-sm text-ink-faint">社員が登録されていません。</p>}
      </div>
    </section>
  );
}
