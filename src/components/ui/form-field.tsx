import * as React from "react";
import { Label } from "@/components/ui/label";
import { FORM_LABEL } from "@/lib/form-classes";
import { cn } from "@/lib/utils";

/**
 * 폼의 "라벨 + 필수표시 + 입력" 한 묶음 헬퍼.
 *
 * 이전엔 6+개 폼이 다음 구조를 인라인으로 반복:
 *   <div className="flex flex-col gap-1.5">
 *     <Label className={FORM_LABEL}>제목<span className="text-rose-500 ml-0.5">*</span></Label>
 *     <Input ... />
 *   </div>
 *
 * 라벨 위치·간격·필수 색을 한 곳에서 바꾸면 앱 전체 폼이 동시에 맞춰지도록.
 */
interface FormFieldProps {
  label: React.ReactNode;
  /** true 면 라벨 옆에 빨간 별표(*) 표시. */
  required?: boolean;
  /** 라벨 우측에 배치할 보조 요소(예: 글자수 카운터, "오늘" 버튼 등). */
  hint?: React.ReactNode;
  /** 인라인 에러 메시지 — 비어있는 필수 필드 등. 표시되면 라벨에 destructive 색 적용. */
  error?: string | null;
  /** input/select/textarea 등 자식. */
  children: React.ReactNode;
  /** htmlFor 연결용 — Label-Input 접근성 매칭. */
  htmlFor?: string;
  className?: string;
  /** 라벨/필드 사이 간격. 기본 gap-1.5. */
  gap?: "tight" | "normal";
}

export function FormField({
  label,
  required = false,
  hint,
  error,
  children,
  htmlFor,
  className,
  gap = "normal",
}: FormFieldProps) {
  return (
    <div
      className={cn(
        "flex flex-col min-w-0",
        gap === "tight" ? "gap-1" : "gap-1.5",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Label
          htmlFor={htmlFor}
          className={cn(FORM_LABEL, error && "text-destructive")}
        >
          {label}
          {required && <RequiredMark />}
        </Label>
        {hint && <div className="shrink-0">{hint}</div>}
      </div>
      {children}
      {error && (
        <p className="text-[11px] text-destructive leading-tight">{error}</p>
      )}
    </div>
  );
}

/**
 * 필수 입력 표시 — 라벨 옆에 한 칸 떨어진 빨간 별.
 * 색은 destructive 토큰을 사용 — 다크모드 대응 + 위험·필수 의미가 같은 색이라
 * 사용자 학습 비용 줄임.
 */
export function RequiredMark() {
  return (
    <span aria-hidden className="ml-0.5 text-destructive">
      *
    </span>
  );
}
