"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";

// 여행 계획 상세 헤더 — 뒤로가기 + 인라인 편집 제목.
// sticky top-0 으로 스크롤 시 상단에 고정.
// (복제는 plan-list 의 카드 메뉴에 있음 — 상세 페이지 우측 상단은 minimal.)

interface Props {
  title: string;
  /** 뒤로가기 URL — Next Link 로 navigate. router.push 가 query-only
   *  변경 시 일부 환경에서 트리거 안 되던 이슈 회피. */
  backHref: string;
  onRename: (nextTitle: string) => void;
}

export default function PlanDetailHeader({ title, backHref, onRename }: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft == null) return;
    const trimmed = draft.trim();
    if (trimmed && trimmed !== title) onRename(trimmed);
    setDraft(null);
  };

  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 border-b px-3 h-12 bg-background/95 backdrop-blur">
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
          className="flex-1 text-left text-base font-semibold truncate hover:text-muted-foreground"
        >
          {title}
        </button>
      )}
    </header>
  );
}
