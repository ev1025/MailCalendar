import type { CalendarEvent } from "@/types";

type EventInput = Omit<CalendarEvent, "id" | "created_at">;
type RepeatKind = NonNullable<EventInput["repeat"]>;

/**
 * 반복 일정 생성 — 원본 + 추가분을 series_id 로 묶은 배열 반환.
 *
 * count:
 *  - 양의 정수 N: N개 생성 (원본 1 + 추가분 N-1)
 *  - -1 (무한): weekly 260회(5년), monthly 120회(10년), yearly 30회(30년) 로 보수적 캡.
 *
 * 모든 행은 같은 series_id 를 공유 → 시리즈 단위 수정/삭제 가능.
 * 첫 행만 repeat 필드 유지(원본 식별용), 나머지는 repeat=null.
 *
 * 시간(start_time/end_time) 은 원본 그대로 복사. 날짜만 weekly/monthly/yearly 간격으로 이동.
 * end_date 가 있으면 duration 유지하며 함께 이동.
 */
export function buildRepeatEvents(
  data: EventInput,
  repeatCount: number,
): (EventInput & { series_id: string })[] {
  if (!data.repeat) return [{ ...data, series_id: makeSeriesId() }];

  const start = new Date(data.start_date + "T00:00:00");
  const end = data.end_date ? new Date(data.end_date + "T00:00:00") : null;
  const duration = end ? end.getTime() - start.getTime() : 0;

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
    const next = new Date(start);
    if (data.repeat === "weekly") next.setDate(start.getDate() + 7 * i);
    else if (data.repeat === "monthly") next.setMonth(start.getMonth() + i);
    else next.setFullYear(start.getFullYear() + i);

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
