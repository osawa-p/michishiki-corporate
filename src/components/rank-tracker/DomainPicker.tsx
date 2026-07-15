"use client";

// 対象ドメインの選択UI。登録済みドメインから選ぶか、「新しいサイトを追加」で
// フリー入力する。入力は正規化プレビュー付き（URL貼り付け → hostname 抽出）。
import { useState } from "react";
import { targetKey, isValidTargetDomain } from "@/lib/rank-tracker/domain";

const NEW = "__new__";

export default function DomainPicker({
  id,
  domains,
  value,
  onChange,
}: {
  id: string;
  domains: string[];
  value: string;
  onChange: (domain: string) => void;
}) {
  // 登録済みに value が無い場合（初期値が新規ドメイン等）は新規入力モードで開始
  const isExisting = domains.includes(targetKey(value));
  const [mode, setMode] = useState<"select" | "new">(
    domains.length > 0 && isExisting ? "select" : "new"
  );
  const [draft, setDraft] = useState(isExisting ? "" : value);

  const normalized = targetKey(draft);
  const valid = normalized !== "" && isValidTargetDomain(normalized);
  const showPreview = draft.trim() !== "" && normalized !== draft.trim();

  if (mode === "select") {
    return (
      <select
        id={id}
        value={targetKey(value)}
        onChange={(e) => {
          if (e.target.value === NEW) {
            setMode("new");
            setDraft("");
            onChange("");
          } else {
            onChange(e.target.value);
          }
        }}
        className="w-full px-4 py-3 bg-white border border-line text-sm focus:outline-none focus:border-bronze"
      >
        {domains.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
        <option value={NEW}>＋ 新しいサイトを追加…</option>
      </select>
    );
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          id={id}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            onChange(e.target.value);
          }}
          placeholder="example.com（URL貼り付け可）"
          className="w-full px-4 py-3 bg-white border border-line text-sm focus:outline-none focus:border-bronze"
        />
        {domains.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setMode("select");
              onChange(domains[0]);
            }}
            className="whitespace-nowrap px-3 text-xs text-ink-faint hover:text-bronze-deep border border-line bg-white"
          >
            登録済みから選ぶ
          </button>
        )}
      </div>
      {draft.trim() !== "" && (
        <p className={`mt-1.5 text-xs ${valid ? "text-ink-soft" : "text-red-600"}`}>
          {valid ? (
            showPreview ? (
              <>
                <span className="text-bronze-deep font-semibold">{normalized}</span>{" "}
                として登録されます
              </>
            ) : (
              "この形式で登録できます"
            )
          ) : (
            "ドメインの形式が正しくありません（例: example.com）"
          )}
        </p>
      )}
    </div>
  );
}
