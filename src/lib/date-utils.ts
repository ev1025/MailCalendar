/**
 * 날짜 유틸 — 폼·반복 일정·기간 계산에서 반복 사용되는 helper 통합.
 * Date 객체의 setMonth 오버플로우(예: 2026-01-31 + 1month → 2026-03-03)를
 * 회피하는 패턴들을 한 곳에 모아 유지보수성·테스트성 확보.
 */

/** Date → "YYYY-MM-DD". 양력 로컬 시간 기준. */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 오늘 날짜를 "YYYY-MM-DD" 로. */
export function todayYmd(): string {
  return ymd(new Date());
}

/** 해당 (year, month) 의 N째주 W요일 Date. 없으면 마지막 W요일로 fallback.
 *  예: nthWeekday(2026, 4, 5, 2) = 2026년 5월 둘째 주 금요일. */
export function nthWeekday(
  year: number,
  month: number,
  weekday: number,
  nth: number,
): Date {
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  const day = 1 + offset + (nth - 1) * 7;
  const lastDay = new Date(year, month + 1, 0).getDate();
  if (day > lastDay) return new Date(year, month, day - 7);
  return new Date(year, month, day);
}

/** "YYYY-MM-DD" 를 한 달 뒤로(예: 2026-05-31 → 2026-04-30) 이동.
 *  setMonth 오버플로우 회피 위해 day-of-month 를 그 달 말일로 클램프.
 *  잘못된 입력은 그대로 반환. */
export function shiftMonthBack(date: string): string {
  return shiftMonth(date, -1);
}

/** "YYYY-MM-DD" 를 N개월 이동. delta 는 양수=미래, 음수=과거.
 *  setMonth 오버플로우 회피 위해 day-of-month 를 대상 월 말일로 클램프.
 *  잘못된 입력은 그대로 반환. */
export function shiftMonth(date: string, delta: number): string {
  const d = new Date(date + "T00:00:00");
  if (Number.isNaN(d.getTime())) return date;
  const targetDay = d.getDate();
  const t = new Date(d.getFullYear(), d.getMonth() + delta, 1);
  const lastDay = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  return ymd(new Date(t.getFullYear(), t.getMonth(), Math.min(targetDay, lastDay)));
}

/** (year, month) → 그 달 1일과 말일 의 "YYYY-MM-DD" 페어. month 는 1~12. */
export function monthBounds(year: number, month: number): { start: string; end: string } {
  const last = new Date(year, month, 0);
  return {
    start: `${year}-${String(month).padStart(2, "0")}-01`,
    end: ymd(last),
  };
}

/** 다음 날 "YYYY-MM-DD" — exclusive 상한 계산용. */
export function nextDay(date: string): string {
  const d = new Date(date + "T00:00:00");
  if (Number.isNaN(d.getTime())) return date;
  d.setDate(d.getDate() + 1);
  return ymd(d);
}

/** 두 "YYYY-MM-DD" 사이의 일수 (b - a). */
export function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

/** "YYYY-MM-DD" 를 N일 이동. */
export function addDaysISO(date: string, days: number): string {
  const d = new Date(date + "T00:00:00");
  if (Number.isNaN(d.getTime())) return date;
  d.setDate(d.getDate() + days);
  return ymd(d);
}
