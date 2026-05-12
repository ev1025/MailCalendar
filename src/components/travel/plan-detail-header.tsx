"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";

// 여행 계획 상세 헤더 — 뒤로가기 + 인라인 편집 제목 + (선택) 기간 부제.
// sticky top-0 으로 스크롤 시 상단에 고정. h-14 — 다른 PageHeader 와 동일 높이.

interface Props {
  title: string;
  /** 뒤로가기 URL — Next Link 로 navigate. router.push 가 query-only
   *  변경 시 일부 환경에서 트리거 안 되던 이슈 회피. */
  backHref: string;
  onRename: (nextTitle: string) => void;
  /** 부제 한 줄 — 기간·일수 등. 스크롤 중에도 "어느 여행인지" 유지. */
  subtitle?: string;
}

export default function PlanDetailHeader({ title, backHref, onRename, subtitle }: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft == null) return;
    const trimmed = draft.trim();
    if (trimmed && trimmed !== title) onRename(trimmed);
    setDraft(null);
  };

  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 border-b px-3 h-14 bg-background/95 backdrop-blur">
      <Link
        href={backHref}
        replace
        scroll={false}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground -ml-1"
        aria-label="계획 목록으로"
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>
      {draft != null ? (
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setDraft(null);
          }}
          className="h-9 flex-1 text-base font-semibold"
        />
      ) : (
        <button
          type="button"
          onClick={() => setDraft(title)}
          className="min-w-0 flex-1 text-left hover:opacity-80 transition-opacity"
        >
          <span className="block truncate text-base font-semibold leading-tight">{title}</span>
          {subtitle && (
            <span className="block truncate text-[11px] text-muted-foreground leading-tight">
              {subtitle}
            </span>
          )}
        </button>
      )}
    </header>
  );
}
