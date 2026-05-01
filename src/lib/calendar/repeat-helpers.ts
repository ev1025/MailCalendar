// 반복 일정 — 횟수/종료일 계산·표시용 공용 helper.
// 달력(event-form) 과 가계부 고정비(fixed-expense-form) 의 "반복 횟수" 필드가 동일 UX 를
// 공유하기 위해 추출. 달력 측 buildRepeatEvents 와 동일한 룰을 사용.

import type { RepeatType } from "@/types";
import { nthWeekdayOfMonth } from "./build-repeat-events";

export const KO_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 반복 일정 N회차 발화일 — weekly interval / monthly N주차 모드 모두 지원. */
export function formatRepeatEnd(
  startDate: string,
  repeat: RepeatType,
  count: number,
  opts?: {
    weeklyInterval?: number;
    monthlyNth?: { week: number; weekday: number } | null;
  },
): string {
  if (!startDate || repeat === "none" || count <= 0) return "";
  const start = new Date(startDate + "T00:00:00");
  if (Number.isNaN(start.getTime())) return "";
  const interval = opts?.weeklyInterval ?? 1;
  const nth = opts?.monthlyNth ?? null;

  let d: Date;
  if (repeat === "weekly") {
    d = new Date(start);
    d.setDate(start.getDate() + 7 * interval * count);
  } else if (repeat === "monthly") {
    if (nth) {
      const target = new Date(start.getFullYear(), start.getMonth() + count, 1);
      d = nthWeekdayOfMonth(target.getFullYear(), target.getMonth(), nth.weekday, nth.week);
    } else {
      d = new Date(start);
      d.setMonth(start.getMonth() + count);
    }
  } else {
    d = new Date(start);
    d.setFullYear(start.getFullYear() + count);
  }

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}(${KO_WEEKDAYS[d.getDay()]})`;
}

/** 8자리 숫자 → "YYYY-MM-DD" 부분 포맷. 4자리부터 "-" 자동 삽입. */
export function formatDigitsAsDate(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
}

/** 8자리 (YYYYMMDD) → Date | null. 잘못된 날짜 (예: 13월) 거부. */
export function parseDigitsToDate(digits: string): Date | null {
  if (!/^\d{8}$/.test(digits)) return null;
  const y = parseInt(digits.slice(0, 4), 10);
  const m = parseInt(digits.slice(4, 6), 10);
  const dd = parseInt(digits.slice(6, 8), 10);
  if (m < 1 || m > 12 || dd < 1 || dd > 31) return null;
  const date = new Date(y, m - 1, dd);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== dd) return null;
  return date;
}

/** 사이클 안 맞으면 자동 교정 + 사유. weeklyInterval / monthlyNth 모드 지원. */
export function correctRepeatEnd(
  startDate: string,
  repeat: RepeatType,
  raw: Date,
  opts?: {
    weeklyInterval?: number;
    monthlyNth?: { week: number; weekday: number } | null;
  },
): { corrected: Date; reason: string } | null {
  if (!startDate) return null;
  const start = new Date(startDate + "T00:00:00");
  if (Number.isNaN(start.getTime())) return null;
  const interval = opts?.weeklyInterval ?? 1;
  const nth = opts?.monthlyNth ?? null;

  let corrected = new Date(raw);
  let reason: string | null = null;

  if (repeat === "weekly") {
    const targetDay = start.getDay();
    if (raw.getDay() !== targetDay) {
      let diff = (targetDay - raw.getDay() + 7) % 7;
      if (diff > 3) diff -= 7;
      corrected.setDate(corrected.getDate() + diff);
      reason = `매주 ${KO_WEEKDAYS[targetDay]}요일만 입력 가능`;
    }
    if (interval > 1) {
      const days = Math.round((corrected.getTime() - start.getTime()) / 86400000);
      const cycleDays = 7 * interval;
      const remainder = days % cycleDays;
      if (remainder !== 0) {
        const adjust = remainder * 2 < cycleDays ? -remainder : cycleDays - remainder;
        corrected.setDate(corrected.getDate() + adjust);
        if (!reason) reason = `${interval}주 사이클에 맞지 않음`;
      }
    }
  } else if (repeat === "monthly") {
    if (nth) {
      const targetMonths =
        (raw.getFullYear() - start.getFullYear()) * 12 + (raw.getMonth() - start.getMonth());
      const k = Math.max(1, targetMonths);
      const target = new Date(start.getFullYear(), start.getMonth() + k, 1);
      const candidate = nthWeekdayOfMonth(
        target.getFullYear(),
        target.getMonth(),
        nth.weekday,
        nth.week,
      );
      if (raw.getTime() !== candidate.getTime()) {
        corrected = candidate;
        reason = `매월 ${nth.week}째주 ${KO_WEEKDAYS[nth.weekday]}요일만 입력 가능`;
      }
    } else {
      const targetDay = start.getDate();
      if (raw.getDate() !== targetDay) {
        corrected = new Date(raw.getFullYear(), raw.getMonth(), 1);
        const lastDay = new Date(raw.getFullYear(), raw.getMonth() + 1, 0).getDate();
        corrected.setDate(Math.min(targetDay, lastDay));
        reason = `매월 ${targetDay}일만 입력 가능`;
      }
    }
  } else if (repeat === "yearly") {
    const targetMonth = start.getMonth();
    const targetDay = start.getDate();
    if (raw.getMonth() !== targetMonth || raw.getDate() !== targetDay) {
      corrected = new Date(raw.getFullYear(), targetMonth, targetDay);
      reason = `매년 ${targetMonth + 1}월 ${targetDay}일만 입력 가능`;
    }
  }

  while (corrected <= start) {
    if (repeat === "weekly") corrected.setDate(corrected.getDate() + 7 * interval);
    else if (repeat === "monthly") corrected.setMonth(corrected.getMonth() + 1);
    else corrected.setFullYear(corrected.getFullYear() + 1);
    if (!reason) reason = "종료일이 시작일보다 빠름";
  }

  return reason ? { corrected, reason } : { corrected, reason: "" };
}

/** 시작일·반복 타입·종료일 → 반복 횟수. weeklyInterval 적용. */
export function computeCountFromEnd(
  startDate: string,
  repeat: RepeatType,
  endDate: Date,
  opts?: { weeklyInterval?: number },
): number {
  if (!startDate || repeat === "none") return 1;
  const start = new Date(startDate + "T00:00:00");
  if (Number.isNaN(start.getTime()) || endDate <= start) return 1;
  const interval = opts?.weeklyInterval ?? 1;
  if (repeat === "weekly") {
    const days = Math.round((endDate.getTime() - start.getTime()) / 86400000);
    return Math.max(1, Math.floor(days / (7 * interval)));
  }
  if (repeat === "monthly") {
    return Math.max(
      1,
      (endDate.getFullYear() - start.getFullYear()) * 12 + (endDate.getMonth() - start.getMonth()),
    );
  }
  if (repeat === "yearly") {
    return Math.max(1, endDate.getFullYear() - start.getFullYear());
  }
  return 1;
}
