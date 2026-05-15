"use client";

import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// 돋보기 + 검색 input 공통 컴포넌트.
// database-view / travel-list / plan-list / knowledge-dashboard 등
// 목록 페이지 상단 검색바를 통일.

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  /** 기본 h-8 text-xs. "md" 는 h-9 text-sm. */
  size?: "sm" | "md";
  autoFocus?: boolean;
  /** 디바운스/네트워크 진행 중 표시 — 우측에 spinner. 모바일 inflight 가시화. */
  loading?: boolean;
}

export default function SearchInput({
  value,
  onChange,
  placeholder = "검색...",
  className,
  size = "sm",
  autoFocus,
  loading = false,
}: Props) {
  // 폰트 크기 통일 — TagInput 의 검색 입력과 동일하게 (text-sm/text-xs).
  // iOS 자동 줌 방지는 viewport meta 의 maximumScale 로 별도 처리됨.
  const heightCls = size === "md" ? "h-9 text-sm" : "h-8 text-xs";
  // 아이콘 크기·위치·input padding 을 size 에 맞춰 비례 — 이전에는 size=md 에서도
  // 아이콘이 h-3.5(14px) 였고 pl-8(32px) 이라 큰 input 내 좌측 공백이 과하게 비어 보였음.
  const iconCls = size === "md" ? "left-3 h-4 w-4" : "left-2.5 h-3.5 w-3.5";
  const padCls = size === "md" ? "pl-9 pr-9" : "pl-8 pr-8";
  const spinnerCls = size === "md" ? "right-3 h-4 w-4" : "right-2.5 h-3.5 w-3.5";
  return (
    // 래퍼를 inline-flex + items-center 로 실제 아이콘·Input 높이만큼만 차지하게 함.
    // 이전에는 flex-1 이라 flex-col 부모(예: 지식창고) 안에서 세로로 늘어나
    // absolute-positioned Search 아이콘이 빈 공간 한가운데에 떠있던 버그가 있었음.
    // 가로 flex 부모에서는 min-w-0 + w-full 로 자연스럽게 늘어남.
    <div className={cn("relative w-full min-w-0", className)}>
      <Search className={cn("absolute top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none shrink-0", iconCls)} />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Enter → 키보드 dismiss. 모바일에서 검색 결과가 키보드에 가려져
          // "검색이 안 되는 듯" 한 인상을 받는 문제 해결. 검색 자체는 onChange 가
          // 실시간으로 처리하므로 Enter 는 단순 blur 의미.
          if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
        }}
        placeholder={placeholder}
        className={cn(heightCls, padCls)}
        autoFocus={autoFocus}
      />
      {/* 인플라이트 스피너 — 디바운스 + 네트워크 동안 표시. value 비어있으면 숨김. */}
      {loading && value.trim() !== "" && (
        <Loader2
          aria-hidden
          className={cn(
            "absolute top-1/2 -translate-y-1/2 text-muted-foreground animate-spin pointer-events-none",
            spinnerCls,
          )}
        />
      )}
    </div>
  );
}
