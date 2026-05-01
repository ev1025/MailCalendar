import type { CalendarEvent } from "@/types";

type EventInput = Omit<CalendarEvent, "id" | "created_at">;
type RepeatKind = NonNullable<EventInput["repeat"]>;

/**
 * 반복 일정 생성 — 원본 + 추가분을 series_id 로 묶은 배열 반환.
 *
 * options:
 *  - weeklyInterval: weekly 일 때 N주마다. 1=매주(default), 2=격주, 3=3주마다…
 *  - monthlyNth: monthly 일 때 "N주차 W요일" 모드. null=같은 일자(default).
 *    예: { week: 2, weekday: 5 } = 둘째 주 금요일
 */
export function buildRepeatEvents(
  data: EventInput,
  repeatCount: number,
  options?: {
    weeklyInterval?: number;
    monthlyNth?: { week: number; weekday: number } | null;
  },
): (EventInput & { series_id: string })[] {
  if (!data.repeat) return [{ ...data, series_id: makeSeriesId() }];

  const start = new Date(data.start_date + "T00:00:00");
  const end = data.end_date ? new Date(data.end_date + "T00:00:00") : null;
  const duration = end ? end.getTime() - start.getTime() : 0;
  const weeklyInterval = options?.weeklyInterval && options.weeklyInterval > 0
    ? options.weeklyInterval
    : 1;
  const monthlyNth = options?.monthlyNth ?? null;

  // 무한 캡 — 너무 많이 만들면 DB·UI 둘 다 부담.
  let count = repeatCount;
  if (count === -1) {
    count = capForKind(data.repeat);
  }

  const seriesId = makeSeriesId();
  const batch: (EventInput & { series_id: string })[] = [
    { ...data, series_id: seriesId },
  ];

  for (let i = 1; i < count; i++) {
    let next: Date;
    if (data.repeat === "weekly") {
      next = new Date(start);
      next.setDate(start.getDate() + 7 * weeklyInterval * i);
    } else if (data.repeat === "monthly") {
      if (monthlyNth) {
        // N주차 W요일 모드 — start.month + i 의 N주차 W요일.
        const target = new Date(start.getFullYear(), start.getMonth() + i, 1);
        next = nthWeekdayOfMonth(
          target.getFullYear(),
          target.getMonth(),
          monthlyNth.weekday,
          monthlyNth.week,
        );
      } else {
        next = new Date(start);
        next.setMonth(start.getMonth() + i);
      }
    } else {
      next = new Date(start);
      next.setFullYear(start.getFullYear() + i);
    }

    const nextEnd = duration > 0 ? new Date(next.getTime() + duration) : null;
    batch.push({
      ...data,
      start_date: fmtYmd(next),
      end_date: nextEnd ? fmtYmd(nextEnd) : null,
      repeat: null,
      series_id: seriesId,
    });
  }

  return batch;
}

/** N째주 W요일의 날짜. 해당 월에 N째주가 없으면 마지막 W요일로 cap. */
export function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  nth: number,
): Date {
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  const day = 1 + offset + (nth - 1) * 7;
  const lastDay = new Date(year, month + 1, 0).getDate();
  if (day > lastDay) {
    // N째주 없음 — 마지막 W요일로 fallback (e.g., 5번째 금요일이 없는 달).
    return new Date(year, month, day - 7);
  }
  return new Date(year, month, day);
}

function capForKind(kind: RepeatKind): number {
  if (kind === "weekly") return 260;   // 약 5년
  if (kind === "monthly") return 120;  // 약 10년
  return 30;                           // yearly: 30년
}

function makeSeriesId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `series_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function fmtYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
