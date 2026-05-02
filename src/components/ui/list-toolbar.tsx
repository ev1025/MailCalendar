"use client";

import { useState } from "react";
import { Plus, Filter } from "lucide-react";
import SearchInput from "@/components/ui/search-input";
import { Button } from "@/components/ui/button";

interface ListToolbarProps {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  searchClassName?: string;
  /** 활성 sub-filter 개수 (예: 가본곳 OFF 1, 분류 N개, 태그 N개 합계).
   *  > 0 이면 필터 버튼 active 색 + "(N)" badge 표시. */
  filterCount?: number;
  onAdd: () => void;
  addLabel?: string;
  /** sub-filter slot — 필터 토글 active 시에만 렌더 (justify-end 행). */
  children?: React.ReactNode;
}

/**
 * 목록 페이지 상단 toolbar — 여행/여행계획 등 공통 패턴.
 *
 * 구조: [SearchInput | 필터 토글 | + 추가]
 * 필터 토글 active 시 children 을 우측 정렬 sub-filter 행으로 렌더.
 *
 * filterOpen 은 컴포넌트 내부 상태(default false). 부모는 filterCount(개수) 만 전달.
 * 필터 버튼 active 색상: filterOpen 또는 filterCount > 0 일 때.
 */
export default function ListToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  searchClassName,
  filterCount = 0,
  onAdd,
  addLabel = "추가",
  children,
}: ListToolbarProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const isFilterActive = filterOpen || filterCount > 0;

  return (
    <>
      <div className="flex items-center gap-2">
        <SearchInput
          value={search}
          onChange={onSearchChange}
          placeholder={searchPlaceholder}
          className={searchClassName}
        />
        <button
          type="button"
          onClick={() => setFilterOpen((o) => !o)}
          className={`flex items-center gap-1 shrink-0 rounded-md border px-2.5 h-8 text-[11px] transition-colors ${
            isFilterActive
              ? "border-primary text-primary bg-primary/10"
              : "text-muted-foreground hover:bg-accent"
          }`}
        >
          <Filter className="h-3 w-3" />
          필터{filterCount > 0 && ` (${filterCount})`}
        </button>
        <Button size="sm" className="h-8 shrink-0" onClick={onAdd}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          {addLabel}
        </Button>
      </div>
      {filterOpen && children && (
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {children}
        </div>
      )}
    </>
  );
}
