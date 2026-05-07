"use client";

import { useState } from "react";
import { parseYmd, ymd as toISODate } from "@/lib/date-utils";
import { KO_WEEKDAYS as WEEKDAYS } from "@/lib/calendar/repeat-helpers";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * 시작일/종료일 범위 달력 픽커.
 *
 * 기존 MonthPicker 의 "년 + 월" 두 단계 선택을 대체. 사용자가 임의 구간으로
 * 가계부를 보고 싶을 때(예: 카드 결제 사이클 25일 ~ 다음달 24일) 직접 선택 가능.
 *
 * UX:
 * - 트리거: 'YYYY.MM.DD - YYYY.MM.DD' (한 달 정확히 일치 시 'YYYY년 M월' 으로 압축)
 * - 좌우 화살표: 동일 길이만큼 이전/다음 구간으로 이동 (한 달 단위면 한 달, 임의면 그 일수)
 * - 클릭: 1번째 날짜 → start, 2번째 → end. start 보다 이전 날짜 선택하면 자동 swap.
 * - range 배경 채움: 두 endpoint 사이 날짜에 bg-primary/15
 * - 프리셋: 이번달 / 지난달 / 최근 7일 / 최근 30일
 */

interface Props {
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD (inclusive) */
  endDate: string;
  onChange: (start: string, end: string) => void;
}

function parseISO(s: string): Date {
  return parseYmd(s);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** 트리거 표시 — 한 달 정확히 일치하면 'YYYY년 M월', 아니면 'YYYY.MM.DD - YYYY.MM.DD'. */
function formatRangeLabel(start: string, end: string): string {
  const s = parseISO(start);
  const e = parseISO(end);
  const sIsFirst = s.getDate() === 1;
  const eIsLast = isSameDay(e, endOfMonth(e));
  const sameMonth = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth();
  if (sIsFirst && eIsLast && sameMonth) {
    // MonthPicker(달력) 와 동일하게 월 두 자리 0-padding — 시각 폭·비주얼 통일.
    return `${s.getFullYear()}년 ${String(s.getMonth() + 1).padStart(2, "0")}월`;
  }
  const fmt = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  return `${fmt(s)} - ${fmt(e)}`;
}

export default function DateRangePicker({ startDate, endDate, onChange }: Props) {
  const [open, setOpen] = useState(false);
  // 캘린더 안에서 보고 있는 달 — 시작일 기준으로 초기화.
  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(parseISO(startDate)));
  // 임시 선택 — 사용자가 캘린더에서 두 번째 날짜 클릭해도 즉시 적용 안 하고 "확인" 버튼 클릭 시 반영.
  // pendingStart 만 있으면 아직 종료일 미선택. 둘 다 있으면 미리보기 상태.
  const [pendingStart, setPendingStart] = useState<Date | null>(null);
  const [pendingEnd, setPendingEnd] = useState<Date | null>(null);

  const today = new Date();
  const start = parseISO(startDate);
  const end = parseISO(endDate);

  // 좌우 화살표 — 현재 구간이 "월 단위(1일~말일)" 면 한 달씩, 아니면 일수만큼 이동.
  // 이전엔 일수 단위로만 이동해서 "2026년 4월(30일)" → "2026.05.01 - 2026.05.30" 처럼
  // 한 달 끝부터 30일치 어긋난 구간이 됐음.
  const isMonthRange =
    start.getDate() === 1 &&
    isSameDay(end, endOfMonth(end)) &&
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth();

  const goPrev = () => {
    if (isMonthRange) {
      const prev = new Date(start.getFullYear(), start.getMonth() - 1, 1);
      onChange(toISODate(prev), toISODate(endOfMonth(prev)));
      return;
    }
    const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
    const newStart = new Date(start);
    newStart.setDate(newStart.getDate() - days);
    const newEnd = new Date(end);
    newEnd.setDate(newEnd.getDate() - days);
    onChange(toISODate(newStart), toISODate(newEnd));
  };
  const goNext = () => {
    if (isMonthRange) {
      const next = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      onChange(toISODate(next), toISODate(endOfMonth(next)));
      return;
    }
    const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
    const newStart = new Date(start);
    newStart.setDate(newStart.getDate() + days);
    const newEnd = new Date(end);
    newEnd.setDate(newEnd.getDate() + days);
    onChange(toISODate(newStart), toISODate(newEnd));
  };

  const handlePickDate = (d: Date) => {
    if (!pendingStart) {
      // 첫 번째 클릭 — start 후보로 둠.
      setPendingStart(d);
      setPendingEnd(null);
      return;
    }
    // 두 번째(또는 후속) 클릭 — pendingEnd 갱신. 시간 순서 자동 정렬. onChange 는 호출 안 함.
    let s = pendingStart;
    let e = d;
    if (e < s) [s, e] = [e, s];
    setPendingStart(s);
    setPendingEnd(e);
  };

  const handleConfirm = () => {
    if (pendingStart && pendingEnd) {
      onChange(toISODate(pendingStart), toISODate(pendingEnd));
    } else if (pendingStart && !pendingEnd) {
      // 종료일 미선택 — 단일 날짜로 적용.
      onChange(toISODate(pendingStart), toISODate(pendingStart));
    }
    setPendingStart(null);
    setPendingEnd(null);
    setOpen(false);
  };

  const setPreset = (s: Date, e: Date) => {
    onChange(toISODate(s), toISODate(e));
    setPendingStart(null);
    setPendingEnd(null);
    setOpen(false);
  };

  // 캘린더 그리드 생성 — 월 첫날의 요일 만큼 빈 칸 + 마지막 날까지 + 다음 줄 끝까지 빈 칸.
  const monthFirst = startOfMonth(viewMonth);
  const monthLast = endOfMonth(viewMonth);
  const leadingBlanks = monthFirst.getDay(); // 0=일
  const totalCells = Math.ceil((leadingBlanks + monthLast.getDate()) / 7) * 7;
  const cells: (Date | null)[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let d = 1; d <= monthLast.getDate(); d++) {
    cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d));
  }
  while (cells.length < totalCells) cells.push(null);

  const isInRange = (d: Date): boolean => {
    if (pendingStart && pendingEnd) {
      // 미리보기: 임시 시작/종료 사이 강조.
      return d >= pendingStart && d <= pendingEnd;
    }
    if (pendingStart) {
      // 시작만 선택된 단계 — 별도 range 강조 없음.
      return false;
    }
    return d >= start && d <= end;
  };
  const isEndpoint = (d: Date): "start" | "end" | null => {
    if (pendingStart && pendingEnd) {
      if (isSameDay(d, pendingStart)) return "start";
      if (isSameDay(d, pendingEnd)) return "end";
      return null;
    }
    if (pendingStart && isSameDay(d, pendingStart)) return "start";
    if (!pendingStart && isSameDay(d, start)) return "start";
    if (!pendingStart && isSameDay(d, end)) return "end";
    return null;
  };

  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="기간 선택">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goPrev} aria-label="이전 기간">
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setPendingStart(null);
            setPendingEnd(null);
          }
        }}
      >
        <PopoverTrigger
          aria-label={`기간: ${formatRangeLabel(startDate, endDate)} (눌러서 변경)`}
          className="rounded-md px-1.5 py-1 text-lg font-bold hover:bg-accent transition-colors cursor-pointer tabular-nums"
        >
          {formatRangeLabel(startDate, endDate)}
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-3" align="center" side="bottom">
          {/* 캘린더 헤더: 이전 달 / 보고 있는 년월 / 다음 달 */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              className="h-9 w-9 flex items-center justify-center rounded hover:bg-accent"
              aria-label="이전 달"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-sm font-semibold tabular-nums">
              {viewMonth.getFullYear()}년 {viewMonth.getMonth() + 1}월
            </div>
            <button
              type="button"
              onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              className="h-9 w-9 flex items-center justify-center rounded hover:bg-accent"
              aria-label="다음 달"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {WEEKDAYS.map((w, i) => (
              <div
                key={w}
                className={`text-center text-[10px] font-medium ${
                  i === 0 ? "text-rose-500" : i === 6 ? "text-blue-500" : "text-muted-foreground"
                }`}
              >
                {w}
              </div>
            ))}
          </div>

          {/* 날짜 그리드 — range 배경 + endpoint 강조. */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => {
              if (!d) return <div key={i} className="h-8" />;
              const inRange = isInRange(d);
              const endpoint = isEndpoint(d);
              const isToday = isSameDay(d, today);
              const dow = d.getDay();
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handlePickDate(d)}
                  className={`h-8 text-xs tabular-nums rounded transition-colors ${
                    endpoint
                      ? "bg-primary text-primary-foreground font-bold"
                      : inRange
                        ? "bg-primary/15"
                        : "hover:bg-accent"
                  } ${
                    !endpoint && !inRange && isToday
                      ? "ring-1 ring-primary/40 font-semibold"
                      : ""
                  } ${
                    !endpoint && !inRange
                      ? dow === 0
                        ? "text-rose-500"
                        : dow === 6
                          ? "text-blue-500"
                          : ""
                      : ""
                  }`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          {/* 프리셋 — 칩 행 (필터). */}
          <div className="mt-3 flex flex-wrap items-center gap-1 pt-2 border-t">
            <button
              type="button"
              onClick={() => {
                const s = new Date(today.getFullYear(), today.getMonth(), 1);
                const e = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                setPreset(s, e);
              }}
              className="px-2.5 py-1 text-[11px] rounded-full border hover:bg-accent transition-colors"
            >
              이번달
            </button>
            <button
              type="button"
              onClick={() => {
                const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                const e = new Date(today.getFullYear(), today.getMonth(), 0);
                setPreset(s, e);
              }}
              className="px-2.5 py-1 text-[11px] rounded-full border hover:bg-accent transition-colors"
            >
              지난달
            </button>
            <button
              type="button"
              onClick={() => {
                const e = new Date(today);
                const s = new Date(today);
                s.setDate(s.getDate() - 6);
                setPreset(s, e);
              }}
              className="px-2.5 py-1 text-[11px] rounded-full border hover:bg-accent transition-colors"
            >
              최근 7일
            </button>
            <button
              type="button"
              onClick={() => {
                const e = new Date(today);
                const s = new Date(today);
                s.setDate(s.getDate() - 29);
                setPreset(s, e);
              }}
              className="px-2.5 py-1 text-[11px] rounded-full border hover:bg-accent transition-colors"
            >
              최근 30일
            </button>
          </div>

          {/* 푸터 — 안내 문구 좌측 + 취소/확인 우측. iOS DatePicker 패턴.
              이전엔 확인 버튼이 프리셋 칩 행 우측 끝에 끼어 있어 액션과 필터가
              한 행에 섞여 시각적으로 어색했음. */}
          <div className="mt-2 flex items-center justify-between gap-2 pt-2 border-t">
            <span className="text-[11px] text-muted-foreground truncate">
              {pendingStart && !pendingEnd
                ? "종료일 선택 또는 확인"
                : pendingStart && pendingEnd
                  ? "변경 미리보기 중"
                  : ""}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setPendingStart(null);
                  setPendingEnd(null);
                  setOpen(false);
                }}
                className="px-3 py-1.5 text-xs rounded-md hover:bg-accent transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!pendingStart}
                className="px-4 py-1.5 text-xs rounded-md bg-primary text-primary-foreground font-semibold transition-opacity disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90"
              >
                확인
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goNext} aria-label="다음 기간">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
