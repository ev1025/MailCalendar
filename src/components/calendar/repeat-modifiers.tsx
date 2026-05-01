"use client";

import { useEffect, useState } from "react";
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
 *  X 로 매주(interval=1) 로 복귀.
 *
 *  편집 UX:
 *   - 포커스 시 input 을 비움 → 기존 값 select() 호출 없이 자연스럽게 교체 가능
 *     (Android 의 텍스트 선택 툴바 회피).
 *   - 블러 시 비어있거나 1 이하면 직전 interval (또는 2) 로 복원. */
export function WeeklyIntervalButton({
  interval,
  onChange,
}: {
  interval: number;
  onChange: (n: number) => void;
}) {
  const isActive = interval > 1;
  const [draft, setDraft] = useState(String(interval));
  // 외부에서 interval 이 바뀌면 draft 동기화 (예: X 눌러 1 로 가는 transition).
  useEffect(() => {
    setDraft(String(interval));
  }, [interval]);

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
    <div className="flex items-center gap-0.5 shrink-0">
      <input
        type="text"
        inputMode="numeric"
        value={draft}
        onFocus={() => setDraft("")}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
          setDraft(digits);
          // 유효한 값이면 즉시 반영. 빈 칸이거나 1 이하면 onBlur 에서 보정.
          const n = parseInt(digits, 10);
          if (!Number.isNaN(n) && n >= 2) onChange(n);
        }}
        onBlur={() => {
          const n = parseInt(draft, 10);
          if (Number.isNaN(n) || n < 2) {
            // 빈 칸 / 1 이하 → 직전 interval 로 복원 (없으면 2 = 격주).
            const fallback = interval >= 2 ? interval : 2;
            setDraft(String(fallback));
            if (interval < 2) onChange(fallback);
          }
        }}
        className={`${FORM_INPUT_COMPACT} w-10 rounded-lg border border-input bg-transparent px-1 text-center tabular-nums outline-none focus:border-ring transition-colors dark:bg-input/30`}
      />
      <span className="text-xs text-muted-foreground">주</span>
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
    <div className="flex items-center gap-0.5 shrink-0">
      <Select
        value={String(value.week)}
        onValueChange={(v) => v && onChange({ ...value, week: parseInt(v, 10) })}
      >
        {/* hideIcon — 컴팩트 토글 (ChevronDown 생략으로 가로 폭 절약).
            트리거는 컴팩트한 "1주" 표시, 드롭다운 항목은 "1째주" 로 명확하게. */}
        <SelectTrigger
          hideIcon
          className={`${FORM_INPUT_COMPACT} w-fit min-w-[2.5rem] px-1.5`}
        >
          {value.week}주
        </SelectTrigger>
        {/* align=start — 트리거 좌단과 popup 좌단 정렬. popup 이 더 넓을 때
            가운데 정렬되면 좌우로 들쭉날쭉해 보이는 문제 해결. */}
        <SelectContent align="start">
          {[1, 2, 3, 4, 5].map((n) => (
            <SelectItem key={n} value={String(n)} hideIndicator>
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
        {/* 트리거는 한 글자 "월", 드롭다운은 "월요일" 로 표시. */}
        <SelectTrigger
          hideIcon
          className={`${FORM_INPUT_COMPACT} w-fit min-w-[2rem] px-1.5`}
        >
          {KO_WEEKDAYS[value.weekday]}
        </SelectTrigger>
        <SelectContent align="start">
          {KO_WEEKDAYS.map((w, i) => (
            <SelectItem key={i} value={String(i)} hideIndicator>
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
