import type { TravelPlanTask } from "@/types";

// 정렬 규칙:
// 1) day_index 오름차순
// 2) 같은 day_index 내 → manual_order 우선 (드래그 결과가 최우선)
// 3) 동률은 start_time 보조
//
// 드래그로 바꾼 순서가 항상 반영되도록 manual_order 를 최우선 으로.
// 시간은 표시·누적 예상 계산 용도로만 사용.

export function sortTasks(tasks: TravelPlanTask[]): TravelPlanTask[] {
  return [...tasks].sort((a, b) => {
    if (a.day_index !== b.day_index) return a.day_index - b.day_index;
    if (a.manual_order !== b.manual_order) return a.manual_order - b.manual_order;
    if (a.start_time && b.start_time) {
      if (a.start_time < b.start_time) return -1;
      if (a.start_time > b.start_time) return 1;
      return 0;
    }
    // 한쪽만 시간이 있으면 시간 있는 쪽을 먼저 (드래그 동률 시 안정 정렬).
    if (a.start_time) return -1;
    if (b.start_time) return 1;
    return 0;
  });
}
