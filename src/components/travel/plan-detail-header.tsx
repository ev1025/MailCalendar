"use client";

import { useState } from "react";
import { ArrowLeft, Copy } from "lucide-react";
import { Input } from "@/components/ui/input";

// 여행 계획 상세 헤더 — 뒤로가기 + 인라인 편집 제목 + 복제 액션.
// sticky top-0 으로 스크롤 시 상단에 고정.

interface Props {
  title: string;
  onBack: () => void;
  onRename: (nextTitle: string) => void;
  /** 클릭 시 현재 계획을 그대로 복제. duplicatePlan 호출. */
  onDuplicate?: () => void;
  /** trip 합계 — totalDays / totalTasks / totalTransitMin. 셋 다 양수일 때만 노출. */
  totals?: {
    totalDays: number;
    totalTasks: number;
    totalTransitMin: number;
  };
}

function formatMin(min: number): string {
  if (min <= 0) return "0분";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

export default function PlanDetailHeader({ title, onBack, onRename, onDuplicate, totals }: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft == null) return;
    const trimmed = draft.trim();
    if (trimmed && trimmed !== title) onRename(trimmed);
    setDraft(null);
  };

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b px-3 h-12 bg-background/95 backdrop-blur">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground -ml-1"
          aria-label="계획 목록으로"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
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
        {onDuplicate && (
          <button
            type="button"
            onClick={onDuplicate}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="이 계획 복제"
            title="이 계획 복제"
          >
            <Copy className="h-4 w-4" />
          </button>
        )}
      </header>
      {/* 헤더 아래 가벼운 합계 — 제목과 컨텐츠 사이 정보 layer.
          모두 0 이면 자체 숨김(과한 노출 방지). */}
      {totals && (totals.totalTasks > 0 || totals.totalDays > 0) && (
        <div className="border-b px-3 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
          {totals.totalDays > 0 && <span>총 {totals.totalDays}일</span>}
          {totals.totalTasks > 0 && <span>· {totals.totalTasks}곳</span>}
          {totals.totalTransitMin > 0 && (
            <span>· 이동 {formatMin(totals.totalTransitMin)}</span>
          )}
        </div>
      )}
    </>
  );
}
