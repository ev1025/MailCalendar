import { supabase } from "@/lib/supabase";
import { sortTasks } from "@/lib/travel/sort-tasks";
import { computeExpectedTimes } from "@/lib/travel/expected-time";
import type { TravelPlan, TravelPlanTask } from "@/types";

/**
 * 여행 계획 → 캘린더 일정 변환·동기화 로직 한곳.
 *
 * 사용처:
 *  - "달력에 추가" 메뉴 (plan-list) — 최초 등록.
 *  - task add/update/delete (use-travel-plan-tasks) — 이미 등록된 plan 의 events 재빌드.
 *  - plan 의 start_date 변경 (use-travel-plans) — 날짜가 day_index 기반으로 새로 계산되므로 재빌드.
 *
 * 동기화 전략: 단순 "재빌드" — 해당 plan_id 의 calendar_events 전부 DELETE 후
 * 현재 task 들로 재 INSERT. per-task 매칭보다 단순하고 안전 (편차 누적 X).
 */

interface BuildEventInput {
  plan: Pick<TravelPlan, "id" | "title" | "start_date">;
  tasks: TravelPlanTask[];
  /** travel_categories.name → color 룩업 (없으면 기본 색). 팔레트가 우선이라 현재 미사용. */
  categoryColors?: Record<string, string>;
  userId: string | null;
}

interface BuildResult {
  count: number;
  events: Record<string, unknown>[];
}

/**
 * 달력 색 팔레트 — 여행 계획에서 추가한 일정에 순차적으로 순환 적용.
 * 같은 카테고리의 task 들도 시각적으로 구분되도록 카테고리 색 대신 사용.
 * 12색이라 12개를 넘어가면 순환되지만 인접한 task 끼리는 항상 다른 색.
 */
const PLAN_EVENT_PALETTE = [
  "#3B82F6", // blue
  "#22C55E", // green
  "#F59E0B", // amber
  "#EF4444", // red
  "#A855F7", // purple
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#84CC16", // lime
  "#F97316", // orange
  "#14B8A6", // teal
  "#8B5CF6", // violet
  "#6366F1", // indigo
];

/**
 * task 들을 calendar_events insert payload 로 변환.
 *
 * 시간 규칙(목록 표시와 동일):
 *  - 첫 task (anchor): stored start_time 사용
 *  - 중간 task (predicted): 체인 계산된 도착시간 사용 (= 이전 task 의 도착 + 체류 + 이동시간)
 *  - 종료시간(end_time):
 *      stay_minutes > 0 이면 start + stay
 *      stay_minutes = 0 이면 null (시작시간만 등록)
 *  - start_time 자체가 없으면 종료시간도 null.
 *
 * plan.start_date 가 없으면 null 반환 (등록 불가).
 */
export function buildCalendarEvents(input: BuildEventInput): BuildResult | null {
  const { plan, tasks, userId } = input;
  if (!plan.start_date) return null;
  if (tasks.length === 0) return { count: 0, events: [] };

  // 체인 계산 시간 룩업 (taskId → predicted time). 정렬은 동일 규칙으로.
  const sorted = sortTasks(tasks);
  const expected = computeExpectedTimes(sorted);

  const baseDate = new Date(plan.start_date + "T00:00:00");
  const events = sorted.map((t, idx) => {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + (t.day_index ?? 0));
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    // 시작시간: 중간 task 는 체인 결과, 첫 task 는 stored.
    const exp = expected[t.id];
    let startTime: string | null;
    if (exp?.predicted) {
      startTime = exp.time;
    } else {
      startTime = t.start_time ? String(t.start_time).slice(0, 5) : null;
    }
    // 종료시간: 체류시간 양수일 때만 start + stay.
    let endTime: string | null = null;
    if (startTime && t.stay_minutes && t.stay_minutes > 0) {
      const [h, m] = startTime.split(":").map(Number);
      const total = h * 60 + m + t.stay_minutes;
      const eh = Math.floor(total / 60) % 24;
      const em = total % 60;
      endTime = `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
    }
    // 색상: 팔레트 순환 적용 — 같은 카테고리여도 task 별로 색이 달라지도록.
    // 인접 task 끼리는 항상 다른 색, 12개 초과 시에만 반복.
    const color = PLAN_EVENT_PALETTE[idx % PLAN_EVENT_PALETTE.length];
    return {
      title: t.place_name || "(이름 없음)",
      description: t.content || null,
      start_date: date,
      end_date: null,
      start_time: startTime,
      end_time: endTime,
      color,
      user_id: userId,
      plan_id: plan.id,
    };
  });
  return { count: events.length, events };
}

/** 특정 plan 의 calendar_events 가 존재하는지 (= "달력에 추가" 한 적 있는지) 1회 카운트 조회. */
export async function planHasCalendarEvents(planId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("calendar_events")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", planId);
  if (error) return false; // plan_id 컬럼 없는 구 DB → 동기화 비활성.
  return (count ?? 0) > 0;
}

/**
 * plan 의 task/날짜 변경 후 동기화. 등록된 적 없으면 no-op.
 *
 * 호출 측에서 "이미 추가됐는가" 모를 때도 안전하게 부르면 됨 — 내부에서 카운트 후 처리.
 *
 * 1) 해당 plan_id 의 calendar_events 0개 → no-op (사용자가 "달력에 추가" 한 적 없음)
 * 2) 0개 초과 → 모두 DELETE → 현재 task 들로 다시 INSERT
 *
 * 카테고리 색은 옵션(없으면 기본 파랑). 호출측에서 알면 넘기고, 모르면 생략.
 */
export async function syncPlanCalendarEvents(params: {
  planId: string;
  userId: string | null;
}): Promise<{ updated: boolean; count: number; error?: unknown }> {
  const { planId, userId } = params;

  const has = await planHasCalendarEvents(planId);
  if (!has) return { updated: false, count: 0 };

  // plan + tasks + categories 동시 조회.
  const [planRes, tasksRes, catsRes] = await Promise.all([
    supabase
      .from("travel_plans")
      .select("id, title, start_date")
      .eq("id", planId)
      .single(),
    supabase
      .from("travel_plan_tasks")
      .select("*")
      .eq("plan_id", planId)
      .order("day_index")
      .order("start_time", { nullsFirst: false })
      .order("manual_order"),
    userId
      ? supabase.from("travel_categories").select("name, color").eq("user_id", userId)
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (planRes.error || !planRes.data) return { updated: false, count: 0, error: planRes.error };
  if (tasksRes.error || !tasksRes.data) return { updated: false, count: 0, error: tasksRes.error };

  const categoryColors: Record<string, string> = {};
  if (catsRes.data) {
    for (const c of catsRes.data as { name: string; color: string }[]) {
      categoryColors[c.name] = c.color;
    }
  }

  const built = buildCalendarEvents({
    plan: planRes.data as Pick<TravelPlan, "id" | "title" | "start_date">,
    tasks: tasksRes.data as TravelPlanTask[],
    categoryColors,
    userId,
  });
  if (!built) {
    // start_date 가 없는 상태가 됨 → 등록된 events 정리하고 종료.
    await supabase.from("calendar_events").delete().eq("plan_id", planId);
    return { updated: true, count: 0 };
  }

  // 재빌드: 기존 삭제 → 새 삽입.
  // Supabase JS 가 client 트랜잭션을 노출하지 않아 진정한 원자성은 서버 RPC 필요.
  // 차선책: 삭제 전 기존 행을 메모리에 백업 → INSERT 실패 시 복원 시도.
  // 이렇게 하면 네트워크 실패에 대해선 견고. 브라우저 종료 같은 케이스는 여전히 한계.
  const existingRes = await supabase
    .from("calendar_events")
    .select("*")
    .eq("plan_id", planId);
  const backup = existingRes.data ?? [];

  const del = await supabase.from("calendar_events").delete().eq("plan_id", planId);
  if (del.error) return { updated: false, count: 0, error: del.error };

  if (built.events.length === 0) return { updated: true, count: 0 };

  const ins = await supabase.from("calendar_events").insert(built.events);
  if (ins.error) {
    // plan_id 컬럼 없는 구 DB → 폴백.
    const fallback = built.events.map((e) => {
      const { plan_id: _omit, ...rest } = e as { plan_id?: unknown } & Record<string, unknown>;
      void _omit;
      return rest;
    });
    const retry = await supabase.from("calendar_events").insert(fallback);
    if (retry.error) {
      // INSERT 둘 다 실패 — 백업본 복원으로 데이터 손실 방지.
      if (backup.length > 0) {
        const { id: _omitId, ...sample } = backup[0] as Record<string, unknown>;
        void _omitId; void sample;
        const restoreRows = backup.map((b) => {
          const { id, ...rest } = b as Record<string, unknown>;
          void id;
          return rest;
        });
        const restore = await supabase.from("calendar_events").insert(restoreRows);
        if (restore.error) {
          console.error("[calendar-sync] insert + restore 모두 실패. 데이터 손실:", restore.error);
        }
      }
      return { updated: false, count: 0, error: retry.error };
    }
  }
  return { updated: true, count: built.count };
}
