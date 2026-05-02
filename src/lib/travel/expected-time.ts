import type { TravelPlanTask } from "@/types";
import { fromMinutes, toMinutes } from "@/lib/travel/time";

// 정렬된 task 들에 대해 각 task 의 "예상 도착 시각"을 계산.
// 규칙 (사용자 입력 우선 — 사람은 항상 정확한 시간에 움직이지 못함):
//  - 각 일자의 **첫 task** 의 start_time 은 anchor (predicted=false).
//  - 중간 task 에 사용자가 직접 입력한 start_time 이 있으면 그것을 새 anchor 로
//    사용 (predicted=false). 그 뒤 task 들은 새 anchor 부터 체인 재계산.
//  - 사용자 입력이 없으면: 이전 arrival + 이전 stay + 현재 구간 이동시간
//    으로 체인 계산 (predicted=true).
//  - anchor 가 없거나 체인이 끊기면 null.
//  - 일자 바뀌면 누적 초기화.
//
// 예) 출발지 10:00, 체류 60분, 이동 30분 → 도착지 자동 11:30. 사용자가 도착지에
//     12:00 을 직접 입력하면 12:00 을 anchor 로 사용 + 그 뒤 체인은 12:00 기준.
//
// 반환: { taskId → { time: "HH:MM" | null, predicted: boolean } }

export interface ExpectedTimeInfo {
  time: string | null;   // HH:MM
  predicted: boolean;    // 사용자 anchor 면 false, 체인 계산된 건 true
}

export function computeExpectedTimes(
  sorted: TravelPlanTask[]
): Record<string, ExpectedTimeInfo> {
  const result: Record<string, ExpectedTimeInfo> = {};
  let prevTask: TravelPlanTask | null = null;
  let prevTime: string | null = null;

  for (const t of sorted) {
    const isFirstOfDay = !prevTask || prevTask.day_index !== t.day_index;
    const userTime = t.start_time ? t.start_time.slice(0, 5) : null;

    // 1) 일자의 첫 task — start_time anchor 또는 null. 누적 초기화.
    if (isFirstOfDay) {
      result[t.id] = { time: userTime, predicted: false };
      prevTime = userTime;
      prevTask = t;
      continue;
    }

    // 2) 사용자가 직접 입력한 start_time 이 있으면 새 anchor — 체인 재시작.
    if (userTime) {
      result[t.id] = { time: userTime, predicted: false };
      prevTime = userTime;
      prevTask = t;
      continue;
    }

    // 3) 사용자 입력 없음 — 이전 anchor 부터 체인 계산.
    if (prevTime != null && prevTask) {
      const stay = prevTask.stay_minutes ?? 0;
      const moveSec = t.transport_duration_sec ?? 0;
      const moveMin = Math.round(moveSec / 60);
      const next = fromMinutes(toMinutes(prevTime) + stay + moveMin);
      result[t.id] = { time: next, predicted: true };
      prevTime = next;
      prevTask = t;
      continue;
    }

    // 4) 체인 끊김 (anchor 도 없고 체인 결과도 없음).
    result[t.id] = { time: null, predicted: false };
    prevTime = null;
    prevTask = t;
  }
  return result;
}
