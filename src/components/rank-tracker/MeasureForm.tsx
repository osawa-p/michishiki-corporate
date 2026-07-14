"use client";

import { useState } from "react";

type SerpItem = { rank: number; url: string; domain: string; title: string };

type MeasureResponse = {
  ok: boolean;
  keyword?: string;
  domain?: string;
  checkedAt?: string;
  count?: number;
  inserted?: number;
  target?: { rank: number; url: string; title: string } | null;
  results?: SerpItem[];
  error?: string;
};

const NUM_OPTIONS = [
  { value: 30, label: "30件（速い）" },
  { value: 50, label: "50件" },
  { value: 100, label: "100件（フル・約1分）" },
];

export default function MeasureForm({ defaultDomain }: { defaultDomain: string }) {
  const [keyword, setKeyword] = useState("");
  const [domain, setDomain] = useState(defaultDomain);
  const [num, setNum] = useState(100);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<MeasureResponse | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!keyword.trim()) {
      setStatus("error");
      setErrorMessage("キーワードを入力してください。");
      return;
    }
    setStatus("loading");
    setErrorMessage("");
    setResult(null);
    try {
      const res = await fetch("/api/rank-tracker/measure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: keyword.trim(), domain: domain.trim(), num }),
      });
      const data: MeasureResponse = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "計測に失敗しました。");
      }
      setResult(data);
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "計測に失敗しました。");
    }
  };

  const tkey = (result?.domain ?? "").toLowerCase().replace(/^www\./, "");

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="space-y-5 bg-white border border-line p-6" noValidate>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="kw" className="block text-sm font-semibold text-ink mb-2">
              キーワード <span className="text-bronze-deep">*</span>
            </label>
            <input
              id="kw"
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="例: 生成AI 研修"
              className="w-full px-4 py-3 bg-white border border-line text-sm focus:outline-none focus:border-bronze"
            />
          </div>
          <div>
            <label htmlFor="dm" className="block text-sm font-semibold text-ink mb-2">
              対象ドメイン
            </label>
            <input
              id="dm"
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="michi-biki.jp"
              className="w-full px-4 py-3 bg-white border border-line text-sm focus:outline-none focus:border-bronze"
            />
          </div>
          <div>
            <label htmlFor="num" className="block text-sm font-semibold text-ink mb-2">
              取得件数
            </label>
            <select
              id="num"
              value={num}
              onChange={(e) => setNum(Number(e.target.value))}
              className="w-full px-4 py-3 bg-white border border-line text-sm focus:outline-none focus:border-bronze"
            >
              {NUM_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {status === "error" && errorMessage && (
          <div className="bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <button
          type="submit"
          disabled={status === "loading"}
          className="w-full py-3.5 bg-ink text-paper text-sm font-semibold hover:bg-bronze-deep transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {status === "loading"
            ? "計測中… SERPを取得しています（30秒〜1分ほど）"
            : "順位を計測する"}
        </button>
      </form>

      {status === "done" && result && <MeasureResultView result={result} tkey={tkey} />}
    </div>
  );
}

function MeasureResultView({ result, tkey }: { result: MeasureResponse; tkey: string }) {
  const { keyword, domain, count = 0, inserted = 0, checkedAt, target, results = [] } = result;
  const checkedLabel = checkedAt
    ? new Date(checkedAt)
        .toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour12: false })
        .slice(0, 16)
    : "-";

  return (
    <div className="space-y-6">
      <div className="bg-paper border border-line p-6">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-4">
          <span className="text-xs tracking-[0.2em] uppercase text-bronze">Result</span>
          <span className="font-serif text-lg font-semibold text-ink">{keyword}</span>
          <span className="text-sm text-ink-faint">/ {domain}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="順位" value={target ? `${target.rank}位` : "圏外"} accent={!!target} />
          <Stat label="取得件数" value={`${count}件`} />
          <Stat label="BQ書込" value={`${inserted}行`} />
          <Stat label="計測日時" value={checkedLabel} small />
        </div>
        {target ? (
          <p className="mt-4 text-sm text-ink-soft break-all">
            <span className="font-semibold">対象URL:</span>{" "}
            <a
              href={target.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-bronze-deep underline underline-offset-2"
            >
              {target.url}
            </a>
          </p>
        ) : (
          <p className="mt-4 text-sm text-ink-soft">
            {count}件中に <span className="font-semibold">{domain}</span> は見つかりませんでした（圏外）。
          </p>
        )}
      </div>

      <div className="border border-line">
        <div className="max-h-[28rem] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-ink text-paper">
              <tr>
                <th className="px-3 py-2 text-left w-14">順位</th>
                <th className="px-3 py-2 text-left">ドメイン / タイトル</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const isTarget = r.domain === tkey;
                return (
                  <tr key={r.rank} className={isTarget ? "bg-bronze/10" : "odd:bg-white even:bg-paper"}>
                    <td className="px-3 py-2 align-top tabular-nums text-ink-soft">{r.rank}</td>
                    <td className="px-3 py-2 align-top">
                      <div className={`font-medium ${isTarget ? "text-bronze-deep" : "text-ink"}`}>
                        {r.domain}
                      </div>
                      <div className="text-xs text-ink-faint line-clamp-1">{r.title}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  small,
}: {
  label: string;
  value: string;
  accent?: boolean;
  small?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] tracking-wider text-ink-faint mb-1">{label}</div>
      <div
        className={`font-serif font-semibold ${small ? "text-sm" : "text-2xl"} ${
          accent ? "text-bronze-deep" : "text-ink"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
