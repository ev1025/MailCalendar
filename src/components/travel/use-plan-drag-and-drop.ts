"use client";

import type { DragEndEvent } from "@dnd-kit/core";
import type { TravelPlanTask } from "@/types";

// 여행 계획 task DnD 핸들러. plan-detail 에서 재사용 가능하게 분리.
//
// 시나리오:
//  1. task → task (같은 일자): 순서 재정렬 (드롭 위치가 대상 task 중심보다 위/아래)
//  2. task → task (다른 일자): 드롭 위치에 따라 대상 task 앞/뒤에 끼워넣음 + day_index 변경
//  3. task → "day-N" droppable: 해당 일자 맨 뒤로 이동
//
// 위/아래 판정: active 의 translated rect 중심이 over rect 중심보다 아래면 "after".
// 이전에는 무조건 before 로 끼워넣어서 "일자 맨 아래"로 드롭할 수 없던 문제 해결.
//
// 순서·일자 변경 시 인접 leg 의 transport_* 필드 자동 리셋 (경로 재산정 유도).

interface Args {
  sorted: TravelPlanTask[];
  updateTask: (id: string, updates: Partial<TravelPlanTask>) => Promise<unknown>;
}

const TRANSPORT_RESET = {
  transport_mode: null,
  transport_duration_sec: null,
  transport_manual: false,
  transport_durations: null,
} as const;

// 드롭이 over task 의 "뒤"(아래) 쪽인지 판정.
// active 의 translated rect 중심 Y 가 over rect 중심 Y 보다 크면 아래로 드롭 → after.
function isDropAfter(e: DragEndEvent): boolean {
  const activeRect = e.active.rect.current.translated;
  const overRect = e.over?.rect;
  if (!activeRect || !overRect) return false;
  const activeCenterY = activeRect.top + activeRect.height / 2;
  const overCenterY = overRect.top + overRect.height / 2;
  return activeCenterY > overCenterY;
}

export function createPlanDragEndHandler({ sorted, updateTask }: Args) {
  // Promise.all 로 병렬 처리 — 직렬 await 시 각 updateTask 의 fetch+rerender 가
  // 누적되어 사용자 시각엔 한 단계씩 계단식으로 옮겨가는 cascade 가 보임.
  // 병렬 처리 시 모든 update 가 거의 동시에 끝나 한 번의 시각 변화로 보임.
  const resetTransport = (taskIds: Iterable<string>) =>
    Promise.all(
      Array.from(taskIds).map((id) => updateTask(id, TRANSPORT_RESET)),
    );

  return async (e: DragEndEvent): Promise<void> => {
    if (!e.over || e.active.id === e.over.id) return;
    const activeTask = sorted.find((t) => t.id === e.active.id);
    if (!activeTask) return;
    const overId = String(e.over.id);

    // 원래 위치에서의 기존 next — 옛 departing leg 가 무효됨
    const oldDayTasks = sorted.filter((t) => t.day_index === activeTask.day_index);
    const oldIdx = oldDayTasks.findIndex((t) => t.id === activeTask.id);
    const oldNext = oldIdx >= 0 ? oldDayTasks[oldIdx + 1] : undefined;

    const affected = new Set<string>([activeTask.id]);
    if (oldNext) affected.add(oldNext.id);

    // 1) 빈 일자 droppable ("day-N") 로 드롭
    if (overId.startsWith("day-")) {
      const targetDay = parseInt(overId.slice(4), 10);
      if (!Number.isFinite(targetDay) || targetDay === activeTask.day_index) return;
      const targetDayTasks = sorted.filter(
        (t) => t.day_index === targetDay && t.id !== activeTask.id
      );
      targetDayTasks.push(activeTask);
      // 대상 일자 task 의 manual_order 를 0..N 으로 전부 재기록 — skip 최적화를 빼서
      // (manual_order 가 우연히 새 인덱스와 같아도 다시 쓴다) 어떤 상태에서 시작해도
      // 0-contiguous 한 일관 순서가 보장됨. activeTask 는 day_index 까지 한 번에.
      const updates: Promise<unknown>[] = [];
      for (let i = 0; i < targetDayTasks.length; i++) {
        const t = targetDayTasks[i];
        updates.push(
          updateTask(
            t.id,
            t.id === activeTask.id
              ? { day_index: targetDay, manual_order: i }
              : { manual_order: i },
          ),
        );
      }
      await Promise.all(updates);
      await resetTransport(affected);
      return;
    }

    const overTask = sorted.find((t) => t.id === overId);
    if (!overTask) return;

    const after = isDropAfter(e);

    // 2) 다른 일자 task 로 드롭 — 위/아래 판정으로 앞 또는 뒤에 끼워넣음
    if (activeTask.day_index !== overTask.day_index) {
      const targetDayTasks = sorted.filter(
        (t) => t.day_index === overTask.day_index && t.id !== activeTask.id
      );
      const overIdx = targetDayTasks.findIndex((t) => t.id === overTask.id);
      const insertIdx = after ? overIdx + 1 : overIdx;
      targetDayTasks.splice(insertIdx, 0, activeTask);
      const updates: Promise<unknown>[] = [];
      for (let i = 0; i < targetDayTasks.length; i++) {
        const t = targetDayTasks[i];
        updates.push(
          updateTask(
            t.id,
            t.id === activeTask.id
              ? { day_index: overTask.day_index, manual_order: i }
              : { manual_order: i },
          ),
        );
      }
      await Promise.all(updates);
      affected.add(overTask.id);
      await resetTransport(affected);
      return;
    }

    // 3) 같은 일자 내 순서 변경 — 위/아래 판정으로 앞 또는 뒤에 끼워넣음
    const dayTasks = sorted.filter((t) => t.day_index === activeTask.day_index);
    const withoutActive = dayTasks.filter((t) => t.id !== activeTask.id);
    const overIdx = withoutActive.findIndex((t) => t.id === overTask.id);
    if (overIdx < 0) return;
    const insertIdx = after ? overIdx + 1 : overIdx;
    withoutActive.splice(insertIdx, 0, activeTask);
    // 동일 일자 내 reorder — 전체 manual_order 를 0..N 으로 재기록(병렬, cascade 방지).
    const updates: Promise<unknown>[] = [];
    for (let i = 0; i < withoutActive.length; i++) {
      updates.push(updateTask(withoutActive[i].id, { manual_order: i }));
    }
    await Promise.all(updates);
    const newActiveIdx = withoutActive.findIndex((t) => t.id === activeTask.id);
    const newNext = newActiveIdx >= 0 ? withoutActive[newActiveIdx + 1] : undefined;
    if (newNext) affected.add(newNext.id);
    await resetTransport(affected);
  };
}
