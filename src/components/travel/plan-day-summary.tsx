import { Clock, MapPin, Route } from "lucide-react";
import type { TravelPlanTask } from "@/types";
import type { ExpectedTimeInfo } from "@/lib/travel/expected-time";
import { addMinutes } from "@/lib/travel/time";

/**
 * 일자별 한 줄 요약 — 헤더 옆 작은 chip 행.
 *
 * 사용자가 일자별 task 를 모두 훑지 않아도 그 날의 윤곽(개수·체류·이동·시작/종료)을
 * 즉시 파악하도록. 모든 값은 plan-detail 의 sorted/expectedTimes 에서 파생.
 */

interface Props {
  dayTasks: TravelPlanTask[];
  expectedTimes: Record<string, ExpectedTimeInfo>;
}

function formatDuration(min: number): string {
  if (min <= 0) return "0분";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

export default function PlanDaySummary({ dayTasks, expectedTimes }: Props) {
  if (dayTasks.length === 0) return null;

  const totalStay = dayTasks.reduce((sum, t) => sum + (t.stay_minutes ?? 0), 0);
  // 첫 task 는 출발지라 transport 없음 — index 1+ 의 transport_duration_sec 합산.
  const totalTransitSec = dayTasks
    .slice(1)
    .reduce((sum, t) => sum + (t.transport_duration_sec ?? 0), 0);
  const totalTransitMin = Math.round(totalTransitSec / 60);

  const first = dayTasks[0];
  const last = dayTasks[dayTasks.length - 1];
  const firstTime = expectedTimes[first.id]?.time ?? null;
  const lastArrival = expectedTimes[last.id]?.time ?? null;
  // 마지막 task 의 종료 시각 = 도착 + 체류
  const lastEnd =
    lastArrival != null ? addMinutes(lastArrival, last.stay_minutes ?? 0) : null;

  const timeRange =
    firstTime && lastEnd
      ? `${firstTime} → ${lastEnd}`
      : firstTime
        ? `${firstTime} ~`
        : null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground tabular-nums">
      <span className="flex items-center gap-1">
        <MapPin className="h-3 w-3" />
        <span>{dayTasks.length}곳</span>
      </span>
      {totalStay > 0 && (
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>체류 {formatDuration(totalStay)}</span>
        </span>
      )}
      {totalTransitMin > 0 && (
        <span className="flex items-center gap-1">
          <Route className="h-3 w-3" />
          <span>이동 {formatDuration(totalTransitMin)}</span>
        </span>
      )}
      {timeRange && (
        <span className="ml-auto text-foreground/70 font-medium">{timeRange}</span>
      )}
    </div>
  );
}
