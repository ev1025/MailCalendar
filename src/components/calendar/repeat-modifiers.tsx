"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { X } from "lucide-react";
import { FORM_INPUT_COMPACT } from "@/lib/form-classes";
import { KO_WEEKDAYS } from "@/lib/calendar/repeat-helpers";

/** 매주 N주마다 인라인 토글 — "종료 설정" 패턴.
 *  interval=1 일 땐 "+ 격주" 점선 버튼, 누르면 그 자리에서 [숫자 input] 주마다 로 변환.
 *  X 로 매주(interval=1) 로 복귀. */
export function WeeklyIntervalButton({
  interval,
  onChange,
}: {
  interval: number;
  onChange: (n: number) => void;
}) {
  const isActive = interval > 1;
  if (!isActive) {
    return (
      <button
        type="button"
        onClick={() => onChange(2)}
        className={`${FORM_INPUT_COMPACT} shrink-0 rounded-md border border-dashed text-muted-foreground hover:border-foreground hover:text-foreground transition-colors px-2 whitespace-nowrap`}
      >
        + 격주
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1 shrink-0">
      <input
        type="text"
        inputMode="numeric"
        value={interval}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
          if (digits === "") return;
          const n = parseInt(digits, 10);
          if (n >= 2) onChange(n);
        }}
        className={`${FORM_INPUT_COMPACT} w-12 rounded-lg border border-input bg-transparent px-2 text-center tabular-nums outline-none focus:border-ring transition-colors dark:bg-input/30`}
      />
      <span className="text-xs text-muted-foreground">주마다</span>
      <button
        type="button"
        onClick={() => onChange(1)}
        className="text-muted-foreground hover:text-foreground p-0.5 shrink-0"
        aria-label="격주 해제"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** 매월 N주차 W요일 인라인 토글 — "종료 설정" 패턴.
 *  null 일 땐 "+ N주차" 점선 버튼, 누르면 그 자리에서 두 개의 Select(주·요일) 로 변환.
 *  X 로 같은 일자 모드(null) 로 복귀. 초기 추천값은 시작일의 실제 N주차·요일. */
export function MonthlyNthButton({
  startDate,
  value,
  onChange,
}: {
  startDate: string;
  value: { week: number; weekday: number } | null;
  onChange: (v: { week: number; weekday: number } | null) => void;
}) {
  const startInfo = (() => {
    if (!startDate) return null;
    const d = new Date(startDate + "T00:00:00");
    if (Number.isNaN(d.getTime())) return null;
    return { week: Math.ceil(d.getDate() / 7), weekday: d.getDay() };
  })();

  if (!value) {
    return (
      <button
        type="button"
        onClick={() =>
          onChange({
            week: startInfo?.week ?? 1,
            weekday: startInfo?.weekday ?? 1,
          })
        }
        className={`${FORM_INPUT_COMPACT} shrink-0 rounded-md border border-dashed text-muted-foreground hover:border-foreground hover:text-foreground transition-colors px-2 whitespace-nowrap`}
      >
        + N주차
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1 shrink-0">
      <Select
        value={String(value.week)}
        onValueChange={(v) => v && onChange({ ...value, week: parseInt(v, 10) })}
      >
        <SelectTrigger className={`${FORM_INPUT_COMPACT} w-fit min-w-[4.25rem]`}>
          {value.week}째주
        </SelectTrigger>
        <SelectContent className="min-w-[4.25rem]">
          {[1, 2, 3, 4, 5].map((n) => (
            <SelectItem key={n} value={String(n)}>
              {n}째주
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={String(value.weekday)}
        onValueChange={(v) =>
          v && onChange({ ...value, weekday: parseInt(v, 10) })
        }
      >
        <SelectTrigger className={`${FORM_INPUT_COMPACT} w-fit min-w-[4.25rem]`}>
          {KO_WEEKDAYS[value.weekday]}요일
        </SelectTrigger>
        <SelectContent className="min-w-[4.25rem]">
          {KO_WEEKDAYS.map((w, i) => (
            <SelectItem key={i} value={String(i)}>
              {w}요일
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button
        type="button"
        onClick={() => onChange(null)}
        className="text-muted-foreground hover:text-foreground p-0.5 shrink-0"
        aria-label="N주차 해제"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
