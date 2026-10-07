"use client";

// AI社員のキャラクター（インライン SVG）。役割ごとに髪型・服・小物・肌の色を変え、状態ごとに表情と動きを変える。
// - StaffAvatar: 机に座った全身の場面（オフィスの席）。state で表情・小物・動きが変わる
// - RoleBust: 顔だけの小さなアイコン（ボードの担当欄・席の見出し）
// 動きは意味のあるものだけ: 待機=ゆっくり呼吸とまばたき／受付=砂時計が返る／作業中=タイピング・画面に文字が増える・目が集中／
// 確認待ち=書類の山と合図の点滅／失敗=警告の札。prefers-reduced-motion では全て静止する（親の CSS で animation: none にする）。

import type { SeatState } from "@/lib/rank-tracker/ai-staff-view";

export type AvatarRole = "leader" | "seo" | "analytics" | "critic" | string;

type Look = { skin: string; hair: string; cloth: string; accent: string };
const LOOKS: Record<string, Look> = {
  leader: { skin: "#f1dcc4", hair: "#3b3a36", cloth: "#3c4a5e", accent: "#a17c3f" },
  seo: { skin: "#e9cdb0", hair: "#6b4f2a", cloth: "#5f8f6a", accent: "#2f6b3a" },
  analytics: { skin: "#f4e1cc", hair: "#2f4a6b", cloth: "#5b8fd6", accent: "#2a78d6" },
  critic: { skin: "#d9b595", hair: "#5a2d2d", cloth: "#6e5a52", accent: "#b3352e" },
};
const FALLBACK: Look = { skin: "#f1dcc4", hair: "#3b3a36", cloth: "#8b877c", accent: "#8b877c" };

// アニメーション定義。オフィスとボードの <style> に埋め込む（.aio-office／.ai-board の配下で有効）
export const AVATAR_CSS = `
@keyframes aio-breathe { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(1.2px) } }
@keyframes aio-blink { 0%, 93%, 100% { transform: scaleY(1) } 96% { transform: scaleY(.08) } }
@keyframes aio-type-l { from { transform: translateY(0) } to { transform: translateY(-2.6px) } }
@keyframes aio-type-r { from { transform: translateY(-2.6px) } to { transform: translateY(0) } }
@keyframes aio-bob { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(.9px) } }
@keyframes aio-lines { from { stroke-dashoffset: 70 } to { stroke-dashoffset: 0 } }
@keyframes aio-cursor { 0%, 100% { opacity: 1 } 50% { opacity: 0 } }
@keyframes aio-flip { 0% { transform: rotate(0deg) } 35% { transform: rotate(180deg) } 100% { transform: rotate(180deg) } }
@keyframes aio-sand { 0% { opacity: 1 } 35% { opacity: .25 } 100% { opacity: .25 } }
@keyframes aio-pulse { 0%, 100% { opacity: .55; transform: scale(1) } 50% { opacity: 1; transform: scale(1.08) } }
@keyframes aio-drop { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(1.5px) } }
.aio-breathe { animation: aio-breathe 4s ease-in-out infinite; transform-box: fill-box; }
.aio-blink { animation: aio-blink 5.5s infinite; transform-box: fill-box; transform-origin: center; }
.aio-type-l { animation: aio-type-l .34s ease-in-out infinite alternate; transform-box: fill-box; }
.aio-type-r { animation: aio-type-r .34s ease-in-out infinite alternate; transform-box: fill-box; }
.aio-bob { animation: aio-bob .68s ease-in-out infinite; transform-box: fill-box; }
.aio-lines { stroke-dasharray: 70; animation: aio-lines 2.4s linear infinite; }
.aio-cursor { animation: aio-cursor 1s steps(1) infinite; }
.aio-flip { animation: aio-flip 3.2s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.aio-sand { animation: aio-sand 3.2s linear infinite; }
.aio-pulse { animation: aio-pulse 2.2s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.aio-drop { animation: aio-drop 1.6s ease-in-out infinite; transform-box: fill-box; }
`;

function Hair({ role, hair }: { role: string; hair: string }) {
  switch (role) {
    case "seo":
      // ふわっとした癖毛
      return (
        <g fill={hair}>
          <path d="M24 39 Q22 21 40 21 Q58 21 56 39 Q54 30 48 29 Q45 24 40 26 Q35 24 32 29 Q26 30 24 39 Z" />
          <circle cx="27" cy="31" r="3.2" />
          <circle cx="53" cy="31" r="3.2" />
          <circle cx="40" cy="22.5" r="3" />
        </g>
      );
    case "analytics":
      // 前髪ぱっつん＋ポニーテール
      return (
        <g fill={hair}>
          <path d="M25 40 Q24 22 40 22 Q56 22 55 40 L55 33 Q48 31 40 32 Q32 31 25 33 Z" />
          <path d="M54 30 Q68 32 64 50 Q60 44 56 40 Q58 36 54 30 Z" />
          <path d="M60 50 Q62 56 58 60 Q57 54 60 50 Z" />
        </g>
      );
    case "critic":
      // ニット帽＋あごひげ
      return (
        <g>
          <path d="M24 38 Q24 19 40 19 Q56 19 56 38 Q40 33 24 38 Z" fill={hair} />
          <path d="M24 38 Q40 32 56 38 L56 42 Q40 37 24 42 Z" fill="#8a4a4a" />
          <circle cx="40" cy="18.5" r="2.6" fill="#8a4a4a" />
          <path d="M31 48 Q40 56 49 48 Q40 52 31 48 Z" fill={hair} opacity=".75" />
        </g>
      );
    default:
      // 短髪・七三
      return (
        <g fill={hair}>
          <path d="M25 37 Q25 21 40 21 Q55 21 55 37 Q51 29 42 29 Q36 29 25 37 Z" />
          <path d="M42 29 Q50 26 55 34 Q53 29 46 28 Z" />
        </g>
      );
  }
}

function Face({ role, state, look }: { role: string; state: SeatState | "failed"; look: Look }) {
  const working = state === "working";
  const up = state === "queued";
  const eyeY = up ? 35.5 : 37;
  const eyeH = working ? 2.6 : 4;
  return (
    <g>
      {/* 目（まばたきは待機・確認待ちのみ） */}
      <g className={state === "idle" || state === "review" ? "aio-blink" : ""}>
        <rect x="33.5" y={eyeY} width="3" height={eyeH} rx="1.4" fill="#2b2a26" />
        <rect x="43.5" y={eyeY} width="3" height={eyeH} rx="1.4" fill="#2b2a26" />
      </g>
      {/* 眉: 作業中は集中、反論担当は片眉 */}
      {working && (
        <g stroke="#2b2a26" strokeWidth="1.3" strokeLinecap="round">
          <line x1="32.5" y1="33.5" x2="37.5" y2="34.8" />
          <line x1="47.5" y1="33.5" x2="42.5" y2="34.8" />
        </g>
      )}
      {!working && role === "critic" && <line x1="42" y1="33" x2="47.5" y2="31.8" stroke="#2b2a26" strokeWidth="1.3" strokeLinecap="round" />}
      {/* 眼鏡（SEO担当） */}
      {role === "seo" && (
        <g fill="none" stroke="#3b3a36" strokeWidth="1.3">
          <circle cx="35" cy="38.5" r="5" />
          <circle cx="45" cy="38.5" r="5" />
          <line x1="40" y1="38.5" x2="40" y2="38.5" />
          <line x1="25.5" y1="37" x2="30" y2="38" />
          <line x1="54.5" y1="37" x2="50" y2="38" />
        </g>
      )}
      {/* 口 */}
      {state === "failed" ? (
        <path d="M35 47 q5 -2.5 10 0" stroke="#5a2d2d" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      ) : working ? (
        <line x1="36.5" y1="46.5" x2="43.5" y2="46.5" stroke="#5a2d2d" strokeWidth="1.3" strokeLinecap="round" />
      ) : role === "critic" ? (
        <path d="M35 47 q5 -1.5 10 0.5" stroke="#5a2d2d" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      ) : (
        <path d="M35 45.5 q5 3.5 10 0" stroke="#5a2d2d" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      )}
      {/* 頬 */}
      <circle cx="30" cy="43" r="2" fill={look.accent} opacity=".18" />
      <circle cx="50" cy="43" r="2" fill={look.accent} opacity=".18" />
      {/* 汗（失敗） */}
      {state === "failed" && <path className="aio-drop" d="M52 30 q3 4 0 6 q-3 -2 0 -6 z" fill="#7faee0" />}
    </g>
  );
}

// 顔だけのアイコン（ボードの担当欄・席の見出し）
export function RoleBust({ role, size = 28, title }: { role: AvatarRole; size?: number; title?: string }) {
  const look = LOOKS[role] ?? FALLBACK;
  return (
    <svg viewBox="16 14 48 44" width={size} height={size} className="inline-block shrink-0 align-middle" aria-hidden={title ? undefined : true} role={title ? "img" : undefined} focusable="false">
      {title && <title>{title}</title>}
      <circle cx="40" cy="40" r="22" fill={look.accent} opacity=".16" />
      <rect x="27" y="48" width="26" height="14" rx="8" fill={look.cloth} />
      <circle cx="40" cy="38" r="15" fill={look.skin} />
      <Hair role={role} hair={look.hair} />
      <Face role={role} state="idle" look={look} />
    </svg>
  );
}

// 机に座った全身の場面（オフィスの席）
export function StaffAvatar({ role, state, reviewCount = 0, failed = false }: { role: AvatarRole; state: SeatState; reviewCount?: number; failed?: boolean }) {
  const look = LOOKS[role] ?? FALLBACK;
  const working = state === "working";
  const papers = Math.min(reviewCount, 5);
  const faceState: SeatState | "failed" = failed && !working ? "failed" : state;
  return (
    <svg viewBox="0 0 120 110" className="h-auto w-full" aria-hidden="true" focusable="false">
      {/* 椅子 */}
      <rect x="20" y="42" width="40" height="38" rx="9" fill="#d9d3c5" />
      <rect x="24" y="46" width="32" height="30" rx="7" fill="#cfc8b8" />
      {/* 体（待機・確認待ちは呼吸） */}
      <g className={state === "idle" || state === "review" ? "aio-breathe" : ""}>
        <rect x="23" y="52" width="34" height="30" rx="11" fill={look.cloth} />
        {role === "leader" && <path d="M40 54 l-3 4 l3 11 l3 -11 z" fill={look.accent} />}
        {role === "analytics" && <rect x="34" y="54" width="12" height="4" rx="2" fill="#ffffff" opacity=".6" />}
        {role === "critic" && <rect x="26" y="52" width="28" height="6" rx="3" fill={look.accent} />}
        {role === "seo" && <path d="M33 54 q7 6 14 0 v5 q-7 5 -14 0 z" fill="#4a7554" />}
        <rect x="35" y="47" width="10" height="8" rx="3" fill={look.skin} />
        {/* 頭（作業中は小さく揺れる） */}
        <g className={working ? "aio-bob" : ""}>
          <circle cx="40" cy="38" r="15" fill={look.skin} />
          <Hair role={role} hair={look.hair} />
          {role === "analytics" && (
            <g fill="none" stroke="#2b2a26" strokeWidth="2" strokeLinecap="round">
              <path d="M26 36 Q40 18 54 36" />
              <path d="M26 36 v6" />
              <path d="M54 36 v6" />
              <path d="M54 42 q-4 8 -10 8" strokeWidth="1.4" />
            </g>
          )}
          <Face role={role} state={faceState} look={look} />
        </g>
      </g>
      {/* 机 */}
      <rect x="6" y="78" width="108" height="7" rx="2" fill="#e2ded2" />
      <rect x="12" y="85" width="4" height="18" fill="#d6d1c3" />
      <rect x="104" y="85" width="4" height="18" fill="#d6d1c3" />
      {/* モニター */}
      <rect x="70" y="44" width="42" height="30" rx="3" fill="#2b2a26" />
      <rect x="73" y="47" width="36" height="24" rx="2" fill={working ? "#e8f0fb" : "#cfcbc0"} />
      {role === "analytics" ? (
        <g fill={working ? look.accent : "#8b877c"}>
          <rect x="77" y="62" width="4" height="6" />
          <rect x="83" y="56" width="4" height="12" />
          <rect x="89" y="59" width="4" height="9" />
          <rect x="95" y="52" width="4" height="16" />
          <rect x="101" y="57" width="4" height="11" />
        </g>
      ) : (
        <g fill="none" stroke={working ? "#56534a" : "#8b877c"} strokeWidth="1.6" strokeLinecap="round">
          <path className={working ? "aio-lines" : ""} d="M77 52 h28 M77 57 h20 M77 62 h24 M77 67 h14" />
          {working && <line className="aio-cursor" x1="93" y1="65" x2="93" y2="69" stroke={look.accent} strokeWidth="1.8" />}
        </g>
      )}
      <rect x="88" y="74" width="6" height="4" fill="#2b2a26" />
      {/* キーボードと手（作業中はタイピング） */}
      <rect x="52" y="72" width="24" height="4" rx="1" fill="#8b877c" />
      <g stroke={look.skin} strokeWidth="5" strokeLinecap="round">
        <line x1="50" y1="64" x2="57" y2="70" />
        <line x1="54" y1="63" x2="64" y2="70" />
      </g>
      <circle className={working ? "aio-type-l" : ""} cx="57" cy="71" r="3.4" fill={look.skin} />
      <circle className={working ? "aio-type-r" : ""} cx="65" cy="72" r="3.4" fill={look.skin} />
      {/* 役割の小物 */}
      {role === "leader" && (
        <g>
          <rect x="8" y="60" width="13" height="17" rx="1.2" fill="#fff" stroke="#8b877c" strokeWidth="1" />
          <rect x="11.5" y="58" width="6" height="3" rx="1" fill="#8b877c" />
          <line x1="11" y1="66" x2="18" y2="66" stroke="#8b877c" strokeWidth="1" />
          <line x1="11" y1="69.5" x2="18" y2="69.5" stroke="#8b877c" strokeWidth="1" />
          <line x1="11" y1="73" x2="15" y2="73" stroke="#8b877c" strokeWidth="1" />
        </g>
      )}
      {role === "seo" && (
        <g>
          <circle cx="15" cy="64" r="5.5" fill="#fff" fillOpacity=".5" stroke="#56534a" strokeWidth="2" />
          <line x1="19" y1="68" x2="24" y2="74" stroke="#56534a" strokeWidth="2.6" strokeLinecap="round" />
        </g>
      )}
      {role === "critic" && (
        <g>
          <line x1="64" y1="72" x2="74" y2="60" stroke={look.accent} strokeWidth="3" strokeLinecap="round" />
          <line x1="74" y1="60" x2="76" y2="57.5" stroke="#2b2a26" strokeWidth="3" strokeLinecap="round" />
        </g>
      )}
      {/* 机の上の書類（確認待ち。件数分・最大5） */}
      {Array.from({ length: papers }).map((_, i) => (
        <g key={i}>
          <rect x={88 - i * 1.3} y={76 - i * 1.8} width="16" height="3.2" rx="0.6" fill="#fff" stroke="#8b877c" strokeWidth="0.8" />
        </g>
      ))}
      {/* 合図の札 */}
      {state === "review" && !failed && (
        <g className="aio-pulse">
          <circle cx="104" cy="30" r="8" fill="#2a78d6" />
          <text x="104" y="34" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">!</text>
        </g>
      )}
      {failed && !working && (
        <g>
          <path d="M104 21 L113 37 H95 Z" fill="#b3352e" />
          <text x="104" y="35" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">!</text>
        </g>
      )}
      {state === "queued" && (
        <g className="aio-flip">
          <path d="M98 22 h12 l-6 7 z" fill="#8b877c" />
          <path d="M98 36 h12 l-6 -7 z" fill="#c9c5ba" />
          <rect className="aio-sand" x="102.5" y="24" width="3" height="3" fill="#e2b96a" />
        </g>
      )}
      {working && (
        <g fill="#56534a">
          <circle cx="100" cy="30" r="2" opacity=".35" />
          <circle cx="106" cy="30" r="2" opacity=".6" />
          <circle cx="112" cy="30" r="2" />
        </g>
      )}
    </svg>
  );
}
