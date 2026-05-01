"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { FORM_INPUT_COMPACT } from "@/lib/form-classes";
import {
  KO_WEEKDAYS,
  computeCountFromEnd,
  correctRepeatEnd,
  formatDigitsAsDate,
  formatRepeatEnd,
  parseDigitsToDate,
} from "@/lib/calendar/repeat-helpers";
import type { RepeatType } from "@/types";

/**
 * 반복 횟수 입력 컴포넌트 — 여행 페이지의 위치 검색 박스 패턴.
 *
 * UX:
 *  - 입력 박스 자체가 트리거. 포커스 시 아래 드롭다운 자동 등장.
 *  - 8자리 숫자 입력 → "YYYY-MM-DD" 자동 포맷 → 완성 시 즉시 repeatCount 커밋.
 *  - 드롭다운 항목 클릭 → 그 날짜를 input 에 채움 + 드롭다운 닫힘.
 *  - 다시 input 클릭 → 직전에 선택했던 회차가 드롭다운 최상단에 위치하도록 scroll.
 */
export default function RepeatCountField({
  startDate,
  repeat,
  repeatCount,
  setRepeatCount,
  customDigits,
  setCustomDigits,
  open,
  setOpen,
  inputRef,
  weeklyInterval = 1,
  monthlyNth = null,
}: {
  startDate: string;
  repeat: RepeatType;
  repeatCount: number;
  setRepeatCount: (n: number) => void;
  customDigits: string;
  setCustomDigits: (s: string) => void;
  open: boolean;
  setOpen: (o: boolean) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  weeklyInterval?: number;
  monthlyNth?: { week: number; weekday: number } | null;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  // 항목 탭 vs 스크롤 구분 — touchstart 에서 y 기록, touchmove 시 8px 초과면
  // cancel. touchend 에서 cancel 안 됐으면 액션 발화.
  const tapStartRef = useRef<{ y: number; cancelled: boolean } | null>(null);
  // touchend → 합성 mousedown 이중 발화 방지.
  const lastTapRef = useRef(0);

  // input 표시값.
  // - open(편집 중): YYYY-MM-DD 디지트 포맷 (사용자 backspace·재입력 가능)
  // - closed(commit 후): "N회 - YYYY-MM-DD(요일)" 의도된 결과 표시
  const displayValue = (() => {
    if (open) return formatDigitsAsDate(customDigits);
    if (repeatCount > 0 && startDate) {
      return `${repeatCount}회 - ${formatRepeatEnd(startDate, repeat, repeatCount, { weeklyInterval, monthlyNth })}`;
    }
    return "";
  })();

  useEffect(() => {
    if (!open || !listRef.current) return;
    const target = repeatCount > 0
      ? listRef.current.querySelector<HTMLElement>(`[data-count="${repeatCount}"]`)
      : null;
    if (target) target.scrollIntoView({ block: "start" });
  }, [open, repeatCount]);

  const handleSelectCount = (n: number) => {
    const now = performance.now();
    if (now - lastTapRef.current < 350) return;
    lastTapRef.current = now;
    setRepeatCount(n);
    if (n > 0 && startDate) {
      const end = formatRepeatEnd(startDate, repeat, n, { weeklyInterval, monthlyNth });
      setCustomDigits(end.replace(/\D/g, "").slice(0, 8));
    } else {
      setCustomDigits("");
    }
    setOpen(false);
  };

  const itemHandlers = (n: number) => ({
    onTouchStart: (e: React.TouchEvent) => {
      tapStartRef.current = { y: e.touches[0].clientY, cancelled: false };
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (tapStartRef.current && Math.abs(e.touches[0].clientY - tapStartRef.current.y) > 8) {
        tapStartRef.current.cancelled = true;
      }
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const valid = tapStartRef.current && !tapStartRef.current.cancelled;
      tapStartRef.current = null;
      if (valid) {
        // 합성 click/mousedown 차단 — handleSelectCount 가 setOpen(false) 로
        // 드롭다운을 닫은 뒤 ~300ms 늦게 발화하는 ghost click 이 그 자리의
        // 다른 element(예: 아래 태그 입력창) 를 활성화시키는 문제 방지.
        e.preventDefault();
        handleSelectCount(n);
      }
    },
    onMouseDown: (e: React.MouseEvent) => {
      e.preventDefault();
      handleSelectCount(n);
    },
  });

  return (
    <div className="relative w-fit">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
          setCustomDigits(digits);
          if (digits.length === 8) {
            const parsed = parseDigitsToDate(digits);
            if (!parsed) {
              toast.error("올바르지 않은 날짜입니다");
              return;
            }
            const result = correctRepeatEnd(startDate, repeat, parsed, { weeklyInterval, monthlyNth });
            if (!result) {
              toast.error("시작일을 먼저 입력하세요");
              return;
            }
            if (result.reason) {
              const m = String(result.corrected.getMonth() + 1).padStart(2, "0");
              const d = String(result.corrected.getDate()).padStart(2, "0");
              const wd = KO_WEEKDAYS[result.corrected.getDay()];
              // 가독성 — 사유(제목) / 교정값(설명) 두 줄로 분리.
              toast.error(result.reason, {
                description: `${result.corrected.getFullYear()}-${m}-${d}(${wd}) 로 교정`,
              });
            }
            const count = computeCountFromEnd(startDate, repeat, result.corrected, { weeklyInterval });
            setRepeatCount(count);
            setOpen(false);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Backspace") {
            const el = e.currentTarget;
            if (
              el.selectionStart === el.value.length &&
              el.selectionEnd === el.value.length &&
              customDigits.length > 0
            ) {
              e.preventDefault();
              setCustomDigits(customDigits.slice(0, -1));
            }
          }
        }}
        onFocus={() => {
          if (repeatCount > 0 && startDate) {
            const end = formatRepeatEnd(startDate, repeat, repeatCount, { weeklyInterval, monthlyNth });
            setCustomDigits(end.replace(/\D/g, "").slice(0, 8));
          } else {
            setCustomDigits("");
          }
          setOpen(true);
        }}
        onBlur={() => {
          setTimeout(() => setOpen(false), 200);
        }}
        placeholder="직접 입력"
        className={`${FORM_INPUT_COMPACT} h-9 w-[9.25rem] rounded-lg border border-input bg-transparent px-2 tabular-nums outline-none focus:border-ring transition-colors dark:bg-input/30`}
      />
      {open && (
        <div
          ref={listRef}
          className="absolute left-0 top-full mt-1 z-30 w-[9.25rem] max-h-[7.5rem] overflow-y-auto rounded-lg border bg-popover shadow-lg overscroll-contain"
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
            <button
              key={i}
              type="button"
              data-count={i}
              {...itemHandlers(i)}
              className={`w-full text-left px-3 py-1.5 text-xs whitespace-nowrap hover:bg-accent transition-colors tabular-nums ${
                repeatCount === i ? "bg-accent font-medium" : ""
              }`}
            >
              {i}회{startDate ? ` - ${formatRepeatEnd(startDate, repeat, i, { weeklyInterval, monthlyNth })}` : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
