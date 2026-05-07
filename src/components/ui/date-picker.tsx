"use client";

import { useState } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isToday,
  isSameMonth,
  isSameDay,
} from "date-fns";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { KO_WEEKDAYS as WEEKDAYS } from "@/lib/calendar/repeat-helpers";
import KoreanLunarCalendar from "korean-lunar-calendar";

interface DatePickerProps {
  value: string; // "YYYY-MM-DD" or ""
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  min?: string; // "YYYY-MM-DD" — 이 날짜보다 과거는 선택 불가
}

// 음력 월의 일수 (해당 연/월/윤달 여부를 넣어 day=1부터 순회하여 유효한 마지막 day를 찾음)
function getLunarMonthDays(year: number, month: number, isLeap: boolean): number {
  const cal = new KoreanLunarCalendar();
  let last = 0;
  for (let d = 1; d <= 30; d++) {
    if (cal.setLunarDate(year, month, d, isLeap)) {
      last = d;
    } else {
      break;
    }
  }
  return last;
}

// 음력 year-month의 윤달 존재 여부 체크
function hasLeapMonth(year: number, month: number): boolean {
  const cal = new KoreanLunarCalendar();
  return cal.setLunarDate(year, month, 1, true);
}

// 음력 (year, month, day, leap) → 양력 Date
function lunarToSolar(
  year: number,
  month: number,
  day: number,
  isLeap: boolean
): Date | null {
  const cal = new KoreanLunarCalendar();
  if (!cal.setLunarDate(year, month, day, isLeap)) return null;
  const s = cal.getSolarCalendar();
  return new Date(s.year, s.month - 1, s.day);
}

// 양력 Date → 음력 {year, month, day, intercalation}
function solarToLunar(d: Date): { year: number; month: number; day: number; intercalation: boolean } | null {
  const cal = new KoreanLunarCalendar();
  if (!cal.setSolarDate(d.getFullYear(), d.getMonth() + 1, d.getDate())) return null;
  const l = cal.getLunarCalendar();
  return { year: l.year, month: l.month, day: l.day, intercalation: !!l.intercalation };
}

export default function DatePicker({ value, onChange, className, placeholder = "날짜 선택", min }: DatePickerProps) {
  const minDate = min ? new Date(min + "T00:00:00") : null;
  const isBeforeMin = (d: Date) => minDate ? d < minDate : false;
  const [open, setOpen] = useState(false);
  const parsed = value ? new Date(value + "T00:00:00") : new Date();
  const [viewYear, setViewYear] = useState(parsed.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed.getMonth()); // 0-indexed for solar; 1-indexed 쓰려면 +1
  const [mode, setMode] = useState<"calendar" | "year" | "month">("calendar");
  const [isLunar, setIsLunar] = useState(false);
  const [isLeapMonth, setIsLeapMonth] = useState(false);

  const handleOpen = (o: boolean) => {
    setOpen(o);
    if (o) {
      const d = value ? new Date(value + "T00:00:00") : new Date();
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
      setMode("calendar");
      setIsLeapMonth(false);
    }
  };

  // ─── 양력 달력 데이터 ───────────────────────────────────────
  const monthStart = startOfMonth(new Date(viewYear, viewMonth));
  const monthEnd = endOfMonth(monthStart);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const solarDays = eachDayOfInterval({ start: calStart, end: calEnd });

  // ─── 음력 달력 데이터 ───────────────────────────────────────
  // 음력 월의 1일이 양력 몇 요일에 떨어지는지 → 그리드 빌드
  // viewMonth가 음력 모드에서는 1..12로 간주 (0-index+1 그대로 씀)
  const lunarYear = viewYear;
  const lunarMonth = viewMonth + 1;
  const lunarLeapAvailable = isLunar ? hasLeapMonth(lunarYear, lunarMonth) : false;
  const lunarMonthDays = isLunar ? getLunarMonthDays(lunarYear, lunarMonth, isLeapMonth) : 0;

  // 음력 1일의 양력 Date 계산 (요일 맞추기 용)
  const lunarFirstSolar = isLunar ? lunarToSolar(lunarYear, lunarMonth, 1, isLeapMonth) : null;

  // 음력 그리드: [{lunarDay, solarDate}] — 앞에 공백 추가로 7열 맞춤
  type LunarCell = { lunarDay: number; solarDate: Date } | null;
  const lunarCells: LunarCell[] = [];
  if (isLunar && lunarFirstSolar && lunarMonthDays > 0) {
    // 1일의 요일(일=0)만큼 빈 셀 선행
    const firstDow = lunarFirstSolar.getDay();
    for (let i = 0; i < firstDow; i++) lunarCells.push(null);
    for (let d = 1; d <= lunarMonthDays; d++) {
      const solar = lunarToSolar(lunarYear, lunarMonth, d, isLeapMonth);
      if (solar) lunarCells.push({ lunarDay: d, solarDate: solar });
    }
    // 6주(42칸) 맞추기 위해 뒤에 공백
    while (lunarCells.length % 7 !== 0) lunarCells.push(null);
  }

  const goPrev = () => {
    if (isLunar && isLeapMonth) {
      // 윤달 보는 중 → 평달로 돌아가기
      setIsLeapMonth(false);
      return;
    }
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
    else setViewMonth(viewMonth - 1);
    setIsLeapMonth(false);
  };
  const goNext = () => {
    if (isLunar && !isLeapMonth && lunarLeapAvailable) {
      // 평달에서 윤달로 진입
      setIsLeapMonth(true);
      return;
    }
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
    else setViewMonth(viewMonth + 1);
    setIsLeapMonth(false);
  };

  const selectSolarDate = (day: Date) => {
    if (isBeforeMin(day)) return;
    onChange(format(day, "yyyy-MM-dd"));
    setOpen(false);
  };

  const selectLunarCell = (cell: LunarCell) => {
    if (!cell) return;
    if (isBeforeMin(cell.solarDate)) return;
    onChange(format(cell.solarDate, "yyyy-MM-dd"));
    setOpen(false);
  };

  const goToday = () => {
    const now = new Date();
    onChange(format(now, "yyyy-MM-dd"));
    setOpen(false);
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 9 }, (_, i) => viewYear - 4 + i);
  const months = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  // 선택된 날짜의 음력 표시 (트리거 보조 정보용)
  const selectedLunar = value ? solarToLunar(new Date(value + "T00:00:00")) : null;

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger
        className={cn(
          "flex items-center justify-center gap-1 rounded-md border px-1.5 text-sm whitespace-nowrap tabular-nums transition-colors hover:bg-accent cursor-pointer",
          !value && "text-muted-foreground",
          className
        )}
      >
        {!value && <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        <span className="truncate">{value || placeholder}</span>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-2.5" align="start" side="bottom">
        {mode === "calendar" ? (
          <div className="flex flex-col gap-2">
            {/* 헤더: 년/월 각각 클릭 + 윤달 표시 */}
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={goPrev}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-0.5">
                <button className="text-sm font-medium hover:text-blue-600 transition-colors px-1" onClick={() => setMode("year")}>
                  {viewYear}년
                </button>
                <button className="text-sm font-medium hover:text-blue-600 transition-colors px-1" onClick={() => setMode("month")}>
                  {isLunar ? lunarMonth : viewMonth + 1}월{isLunar && isLeapMonth ? " (윤달)" : ""}
                </button>
              </div>
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={goNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* 요일 */}
            <div className="grid grid-cols-7">
              {WEEKDAYS.map((d, i) => (
                <div
                  key={d}
                  className={cn(
                    "text-center text-xs font-medium py-1",
                    i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-muted-foreground"
                  )}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* 날짜 그리드 */}
            {!isLunar ? (
              <div className="grid grid-cols-7">
                {solarDays.map((day) => {
                  const dateStr = format(day, "yyyy-MM-dd");
                  const inMonth = isSameMonth(day, monthStart);
                  const today = isToday(day);
                  const selected = value && isSameDay(day, new Date(value + "T00:00:00"));
                  const dow = day.getDay();
                  const disabled = isBeforeMin(day);

                  return (
                    <button
                      key={dateStr}
                      type="button"
                      disabled={disabled}
                      onClick={() => selectSolarDate(day)}
                      className={cn(
                        "h-8 w-8 mx-auto rounded-full text-sm transition-colors",
                        !inMonth && "text-muted-foreground/30",
                        disabled && "text-muted-foreground/20 cursor-not-allowed line-through",
                        selected
                          ? "bg-primary text-primary-foreground font-bold"
                          : today
                            ? "bg-accent font-medium"
                            : !disabled && dow === 0
                              ? "text-red-500 hover:bg-accent"
                              : !disabled && dow === 6
                                ? "text-blue-500 hover:bg-accent"
                                : !disabled && "hover:bg-accent"
                      )}
                    >
                      {format(day, "d")}
                    </button>
                  );
                })}
              </div>
            ) : (
              /* 음력 그리드 */
              <div className="grid grid-cols-7">
                {lunarCells.map((cell, idx) => {
                  if (!cell) return <div key={idx} className="h-8" />;
                  const today = isToday(cell.solarDate);
                  const selected =
                    value && isSameDay(cell.solarDate, new Date(value + "T00:00:00"));
                  const dow = cell.solarDate.getDay();
                  const disabled = isBeforeMin(cell.solarDate);
                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={disabled}
                      onClick={() => selectLunarCell(cell)}
                      className={cn(
                        "h-8 w-8 mx-auto rounded-full text-sm transition-colors",
                        disabled && "text-muted-foreground/20 cursor-not-allowed line-through",
                        selected
                          ? "bg-primary text-primary-foreground font-bold"
                          : today
                            ? "bg-accent font-medium"
                            : !disabled && dow === 0
                              ? "text-red-500 hover:bg-accent"
                              : !disabled && dow === 6
                                ? "text-blue-500 hover:bg-accent"
                                : !disabled && "hover:bg-accent"
                      )}
                    >
                      {cell.lunarDay}
                    </button>
                  );
                })}
              </div>
            )}

            {/* 선택된 날짜의 음력/양력 보조 표시 */}
            {value && selectedLunar && (
              <div className="text-[10px] text-muted-foreground text-center pt-1">
                {isLunar
                  ? `양력 ${value}`
                  : `음력 ${selectedLunar.year}-${String(selectedLunar.month).padStart(2, "0")}-${String(selectedLunar.day).padStart(2, "0")}${selectedLunar.intercalation ? " (윤달)" : ""}`}
              </div>
            )}

            {/* 하단: 음력/양력 토글 + 오늘 */}
            <div className="flex items-center justify-between pt-1 border-t">
              <button
                type="button"
                className={cn(
                  "text-xs rounded px-1.5 py-0.5 border transition-colors",
                  isLunar
                    ? "bg-primary text-primary-foreground border-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => { setIsLunar(!isLunar); setIsLeapMonth(false); }}
              >
                {isLunar ? "음력" : "양력"}
              </button>
              <button
                type="button"
                className="text-xs text-blue-600 hover:underline"
                onClick={goToday}
              >
                오늘
              </button>
            </div>
          </div>
        ) : mode === "year" ? (
          <div className="grid grid-cols-3 gap-1">
            {years.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => { setViewYear(y); setMode("month"); }}
                className={cn(
                  "h-9 rounded text-sm transition-colors",
                  y === viewYear ? "bg-primary text-primary-foreground font-bold" : y === currentYear ? "text-blue-600 font-medium hover:bg-accent" : "hover:bg-accent"
                )}
              >
                {y}
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-1">
            {months.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setViewMonth(m); setMode("calendar"); setIsLeapMonth(false); }}
                className={cn(
                  "h-9 rounded text-sm transition-colors",
                  m === viewMonth ? "bg-primary text-primary-foreground font-bold" : "hover:bg-accent"
                )}
              >
                {m + 1}월
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
