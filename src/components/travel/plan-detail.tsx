"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parseYmd } from "@/lib/date-utils";
import PlanTaskSheet from "@/components/travel/plan-task-sheet";
import PlanSegmentTabs, { type Segment } from "@/components/travel/plan-segment-tabs";
import PlanRouteMap from "@/components/travel/plan-route-map";
import PlanDetailHeader from "@/components/travel/plan-detail-header";
import PlanDateRange from "@/components/travel/plan-date-range";
import PlanDaySection from "@/components/travel/plan-day-section";
import { useTravelPlans } from "@/hooks/use-travel-plans";
import { useTravelPlanTasks } from "@/hooks/use-travel-plan-tasks";
import { sortTasks } from "@/lib/travel/sort-tasks";
import { tasksToLegs } from "@/lib/travel/legs";
import { invalidateRouteData } from "@/hooks/use-route-data";
import { computeExpectedTimes } from "@/lib/travel/expected-time";
import { useLegPaths } from "@/components/travel/use-leg-paths";
import { usePlanMapData } from "@/hooks/use-plan-map-data";
import { createPlanDragEndHandler } from "@/components/travel/use-plan-drag-and-drop";
import type { TravelPlanTask, AltPlace } from "@/types";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { KO_WEEKDAYS as WEEKDAYS } from "@/lib/calendar/repeat-helpers";

interface Props {
  planId: string;
  /** 헤더 ← 버튼 클릭 시 이동 URL — Next Link 로 navigate. */
  backHref: string;
}

const TRANSPORT_RESET = {
  transport_mode: null,
  transport_duration_sec: null,
  transport_manual: false,
  transport_durations: null,
} as const;

function addDaysISO(iso: string, days: number): string {
  const d = parseYmd(iso);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(startIso: string, endIso: string): number {
  const s = parseYmd(startIso);
  const e = parseYmd(endIso);
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / 86400000));
}

// DayDropZone / SortableTaskRow 는 PlanDaySection 내부로 이전됨.

export default function PlanDetail({ planId, backHref }: Props) {
  const { plans, loading: plansLoading, updatePlan } = useTravelPlans();
  const plan = plans.find((p) => p.id === planId);
  const { tasks, addTask, updateTask, deleteTask } = useTravelPlanTasks(planId);

  const [segment, setSegment] = useState<Segment>({ mode: "all" });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTask, setSheetTask] = useState<TravelPlanTask | null>(null);
  const [sheetDayIndex, setSheetDayIndex] = useState(0);
  // task 의 start_time 이 비어있고 체인 계산된 시간이 있으면 sheet 에 fallback 으로 전달.
  // ⚠️ 훅 규칙: early return (`if (!plan)` 블록) 보다 위에 선언해야 함.
  const [sheetDefaultStartTime, setSheetDefaultStartTime] = useState<string | null>(null);
  // 지도 ↔ 일정 행 양방향 하이라이트. 핀 클릭(plan-detail handlePinClick) 또는 행 호버(setter
  // 직접 호출)로 set. PlanRouteMap 은 이 taskId 의 핀 둘레에 halo, PlanTaskRow 는 outline.
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);

  const sorted = useMemo(() => sortTasks(tasks), [tasks]);
  const expectedTimes = useMemo(() => computeExpectedTimes(sorted), [sorted]);

  // 페이지 마운트 후 첫 미완료 task 로 자동 스크롤 — 여행 중 다녀온 곳 다음에
  // 어디로 갈지 한눈에 보이도록. 완료가 하나도 없으면 동작 안 함(처음 진입 시
  // 맨 위 그대로). 한 페이지 세션에서 한 번만 발화.
  const autoScrolledRef = useRef(false);
  useEffect(() => {
    if (autoScrolledRef.current) return;
    if (sorted.length === 0) return;
    const hasCompleted = sorted.some((t) => t.completed_at);
    if (!hasCompleted) return;
    const firstPending = sorted.find((t) => !t.completed_at);
    if (!firstPending) return;
    autoScrolledRef.current = true;

    // DOM 렌더 후 querySelector. 첫 시도 실패(아직 마운트 전) 시 짧은 backoff
    // 으로 최대 3회 재시도 — silent fail 방어.
    const tryScroll = (remaining: number) => {
      const el = document.querySelector<HTMLElement>(
        `[data-plan-task-id="${firstPending.id}"]`,
      );
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (remaining <= 0) return;
      setTimeout(() => tryScroll(remaining - 1), 80);
    };
    requestAnimationFrame(() => tryScroll(3));
  }, [sorted]);

  const legs = useMemo(() => tasksToLegs(sorted), [sorted]);
  const legsWithCoords = useMemo(
    () =>
      legs.filter(
        (l) =>
          l.fromTask.place_lat != null &&
          l.fromTask.place_lng != null &&
          l.toTask.place_lat != null &&
          l.toTask.place_lng != null
      ),
    [legs]
  );
  // 날짜 범위가 지정돼 있으면 그 범위를 엄격히 따라 [0, totalDays-1] 만 노출.
  // 시작만 있고 종료 없으면 1일짜리 여행으로 취급(days=[0]).
  // 범위 밖 day_index 를 가진 task(orphan) 는 tasksByDay 에서 마지막 날로 clamp
  // 해 시각적으로 누락되지 않게. 범위가 없으면 task 가 쓰는 day_index 합집합.
  const days = useMemo(() => {
    if (plan?.start_date && plan?.end_date) {
      const total = daysBetween(plan.start_date, plan.end_date);
      return Array.from({ length: total + 1 }, (_, i) => i);
    }
    if (plan?.start_date) {
      // 종료일 미선택 → 1일 여행
      return [0];
    }
    const set = new Set<number>();
    for (const t of sorted) set.add(t.day_index);
    if (set.size === 0) set.add(0);
    return Array.from(set).sort((a, b) => a - b);
  }, [sorted, plan?.start_date, plan?.end_date]);

  // "1일차" 우선 + 날짜 있는 계획은 " · 5/10(토)" 덧붙임. 날짜 없으면 "1일차"만(가짜 날짜 X).
  const formatDayLabel = (dayIndex: number): string => {
    if (!plan?.start_date) return `${dayIndex + 1}일차`;
    const d = parseYmd(addDaysISO(plan.start_date, dayIndex));
    return `${dayIndex + 1}일차 · ${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
  };

  // 시작·종료 둘 다 → 차이 + 1, 시작만 → 1일, 둘 다 없음 → 0.
  const totalDays = plan?.start_date && plan?.end_date
    ? daysBetween(plan.start_date, plan.end_date) + 1
    : plan?.start_date
      ? 1
      : 0;

  // 헤더 부제 — 스크롤 중에도 "어느 여행/기간인지" 유지. (장소 개수는 일부러 안 넣음.)
  const headerSubtitle = useMemo(() => {
    const md = (iso: string) => {
      const d = parseYmd(iso);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    };
    if (plan?.start_date && plan?.end_date && plan.start_date !== plan.end_date) {
      return `${md(plan.start_date)} ~ ${md(plan.end_date)} · ${totalDays}일`;
    }
    if (plan?.start_date) return `${md(plan.start_date)} · ${Math.max(1, totalDays)}일`;
    return "기간 미정";
  }, [plan?.start_date, plan?.end_date, totalDays]);

  const visibleLegs = useMemo(() => {
    if (segment.mode === "all") return legsWithCoords;
    if (segment.mode === "day") {
      return legsWithCoords.filter((l) => l.dayIndex === segment.dayIndex);
    }
    const one = legsWithCoords[segment.legIndex];
    return one ? [one] : [];
  }, [segment, legsWithCoords]);

  const legPaths = useLegPaths(visibleLegs);

  const { pins, legs: mapLegs } = usePlanMapData(
    segment,
    sorted,
    legsWithCoords,
    visibleLegs,
    legPaths,
  );

  // 드래그 센서 — early return 전에 호출 (훅 규칙)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const handleDragEnd = useMemo(
    () => createPlanDragEndHandler({ sorted, updateTask }),
    [sorted, updateTask]
  );

  // 일자별 task 그룹핑 — 범위 밖 day_index 는 마지막 날로 clamp 해 표시.
  // (날짜 범위 축소 시 task 소실 방지. DB 의 day_index 는 그대로 — 범위 늘리면 원위치 복구.)
  const tasksByDay: Record<number, TravelPlanTask[]> = useMemo(() => {
    const map: Record<number, TravelPlanTask[]> = {};
    for (const d of days) map[d] = [];
    const lastDay = days[days.length - 1] ?? 0;
    for (const t of sorted) {
      const displayDay = t.day_index > lastDay ? lastDay : t.day_index;
      if (!map[displayDay]) map[displayDay] = [];
      map[displayDay].push(t);
    }
    return map;
  }, [days, sorted]);

  if (!plan) {
    // 아직 plans fetch 중이면 빈 상태로(스피너 텍스트), 끝났는데도 못 찾으면 정확히 안내.
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">
          {plansLoading ? "불러오는 중..." : "계획을 찾을 수 없습니다."}
        </p>
      </div>
    );
  }

  const handleAddNewDay = (): number => {
    const max = Math.max(-1, ...days);
    return max + 1;
  };

  const openNewSheet = (dayIndex: number) => {
    setSheetTask(null);
    setSheetDayIndex(dayIndex);
    setSheetOpen(true);
  };

  // 중간 task (predicted=true) 는 stored start_time 이 있어도 체인 계산값을 폼에 전달.
  // 출발지 시간을 바꾸면 도착지 폼도 자동 갱신되도록 — 목록 표시와 동일 규칙.
  // 첫 task (anchor) 는 defaultStartTime=null → 폼이 stored 값 사용.
  // (state 선언은 early return 위 — 훅 규칙)
  const openEditSheet = (task: TravelPlanTask) => {
    setSheetTask(task);
    setSheetDayIndex(task.day_index);
    const predicted = expectedTimes[task.id];
    setSheetDefaultStartTime(predicted?.predicted ? predicted.time : null);
    setSheetOpen(true);
  };

  // 시트 저장 처리 — 신규 insert 또는 기존 update + 위치 변경 시 이동수단 리셋.
  const handleSheetSave = async (updates: Partial<TravelPlanTask>) => {
    if (sheetTask) {
      const placeChanged =
        updates.place_lat !== sheetTask.place_lat ||
        updates.place_lng !== sheetTask.place_lng;

      const finalUpdates = placeChanged ? { ...updates, ...TRANSPORT_RESET } : updates;

      if (placeChanged) {
        // 관련 leg 의 path 캐시 무효화 — 좌표 바뀌었으니 기존 polyline 재사용 금지
        const targetDay = updates.day_index ?? sheetTask.day_index;
        const dayTasks = sorted.filter((t) => t.day_index === targetDay);
        const myIdx = dayTasks.findIndex((t) => t.id === sheetTask.id);
        const prev = myIdx > 0 ? dayTasks[myIdx - 1] : undefined;
        const next = myIdx >= 0 ? dayTasks[myIdx + 1] : undefined;
        if (
          prev?.place_lat != null && prev?.place_lng != null &&
          sheetTask.place_lat != null && sheetTask.place_lng != null
        ) {
          invalidateRouteData(
            { lat: prev.place_lat, lng: prev.place_lng },
            { lat: sheetTask.place_lat, lng: sheetTask.place_lng }
          );
        }
        if (
          next?.place_lat != null && next?.place_lng != null &&
          sheetTask.place_lat != null && sheetTask.place_lng != null
        ) {
          invalidateRouteData(
            { lat: sheetTask.place_lat, lng: sheetTask.place_lng },
            { lat: next.place_lat, lng: next.place_lng }
          );
        }
        if (next) {
          await updateTask(next.id, TRANSPORT_RESET);
        }
      }
      await updateTask(sheetTask.id, finalUpdates);
    } else {
      const dayIdx = updates.day_index ?? sheetDayIndex;
      await addTask({
        plan_id: planId,
        day_index: dayIdx,
        start_time: updates.start_time ?? null,
        place_name: updates.place_name ?? "",
        place_address: updates.place_address ?? null,
        place_lat: updates.place_lat ?? null,
        place_lng: updates.place_lng ?? null,
        tag: updates.tag ?? null,
        category: updates.category ?? null,
        content: updates.content ?? null,
        stay_minutes: updates.stay_minutes ?? 0,
        manual_order: tasksByDay[dayIdx]?.length ?? 0,
        transport_mode: null,
        transport_duration_sec: null,
        transport_manual: false,
      });
    }
  };

  // 지도 핀 클릭 → 해당 일정 행을 강조 + 화면 가운데로 스크롤. 1.5초 뒤 자동 해제.
  const handlePinClick = (taskId: string) => {
    setHighlightedTaskId(taskId);
    const el = document.querySelector(`[data-plan-task-id="${taskId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      setHighlightedTaskId((curr) => (curr === taskId ? null : curr));
    }, 1500);
  };

  return (
    <div className="flex flex-col">
      <PlanDetailHeader
        title={plan.title}
        backHref={backHref}
        onRename={(next) => updatePlan(plan.id, { title: next })}
        subtitle={headerSubtitle}
      />

      <div className="mx-auto w-full max-w-2xl lg:max-w-6xl">
        <PlanDateRange
          startDate={plan.start_date}
          endDate={plan.end_date}
          totalDays={totalDays}
          onChangeStart={(iso) => updatePlan(plan.id, { start_date: iso })}
          onChangeEnd={(iso) => updatePlan(plan.id, { end_date: iso })}
        />

        {/* lg+ 2단: 왼쪽=일자 타임라인(스크롤) / 오른쪽=경로맵(sticky). 모바일은 한 단(위: 맵 → 아래: 타임라인). */}
        <div className="lg:grid lg:grid-cols-[1fr_28rem] lg:items-start lg:gap-6">
          {/* 경로맵 — DOM 상 먼저(모바일 위) / lg: 오른쪽 sticky */}
          <div className="lg:order-2">
            <div className="flex flex-col gap-2 border-b p-3 lg:sticky lg:top-16 lg:border-b-0">
              <PlanSegmentTabs
                segment={segment}
                onChange={setSegment}
                days={days}
                legs={legsWithCoords}
              />
              <PlanRouteMap
                pins={pins}
                legs={mapLegs}
                heightClass="h-60 lg:h-[calc(100dvh-12rem)]"
                legInfo={
                  segment.mode === "leg" && legsWithCoords[segment.legIndex]
                    ? {
                        mode: legsWithCoords[segment.legIndex].toTask.transport_mode,
                        durationSec: legsWithCoords[segment.legIndex].toTask.transport_duration_sec,
                      }
                    : undefined
                }
                highlightedTaskId={highlightedTaskId}
                onPinClick={handlePinClick}
              />
            </div>
          </div>

          {/* 일자별 섹션 — DOM 상 나중(모바일 아래) / lg: 왼쪽. 하나의 DndContext 로 일자 간 이동 지원. */}
          <div className="lg:order-1 lg:min-w-0">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={sorted.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-3 p-3">
                {days
                  .filter((day) => {
                    // 일자별: 선택 일자만.
                    if (segment.mode === "day") return day === segment.dayIndex;
                    // 경로별: 선택 leg 의 day 만 (leg 은 한 일자 안에서 성립).
                    if (segment.mode === "leg") {
                      const leg = legsWithCoords[segment.legIndex];
                      return leg ? day === leg.dayIndex : false;
                    }
                    return true;
                  })
                  .map((day) => {
                    const rawDayTasks = tasksByDay[day] ?? [];
                    // 경로별 선택 시: 해당 leg 의 출발·도착 task 만 노출.
                    const dayTasks =
                      segment.mode === "leg"
                        ? (() => {
                            const leg = legsWithCoords[segment.legIndex];
                            if (!leg) return [];
                            return rawDayTasks.filter(
                              (t) => t.id === leg.fromTaskId || t.id === leg.toTaskId,
                            );
                          })()
                        : rawDayTasks;
                    return (
                      <PlanDaySection
                        key={day}
                        day={day}
                        dayTasks={dayTasks}
                        formatDayLabel={formatDayLabel}
                        legsWithCoords={legsWithCoords}
                        expectedTimes={expectedTimes}
                        highlightedTaskId={highlightedTaskId}
                        onHoverTask={setHighlightedTaskId}
                        onOpenEdit={openEditSheet}
                        onDeleteTask={(id) => { deleteTask(id); }}
                        onToggleComplete={(t) =>
                          updateTask(t.id, {
                            completed_at: t.completed_at ? null : new Date().toISOString(),
                          })
                        }
                        onSwapAlt={(t, idx) => {
                          // 1순위(primary) 와 alt_places[idx] swap. 좌표 변경되므로
                          // 인접 leg 의 transport cache 도 함께 리셋(invalidateRouteData
                          // 는 sheet save 와 동일 패턴 — 여기선 단순 swap 만, 다음
                          // 렌더에서 useLegPaths 가 새 좌표로 다시 fetch).
                          const alts = t.alt_places ?? [];
                          const target = alts[idx];
                          if (!target) return;
                          const oldPrimary: AltPlace = {
                            name: t.place_name,
                            address: t.place_address,
                            lat: t.place_lat,
                            lng: t.place_lng,
                          };
                          const newAlts = [...alts];
                          newAlts[idx] = oldPrimary;
                          updateTask(t.id, {
                            place_name: target.name,
                            place_address: target.address,
                            place_lat: target.lat,
                            place_lng: target.lng,
                            alt_places: newAlts,
                            // 좌표 바뀌었으므로 transport cache 리셋
                            transport_mode: null,
                            transport_duration_sec: null,
                            transport_manual: false,
                            transport_durations: null,
                          });
                        }}
                        onUpdateTask={updateTask}
                        onOpenNew={openNewSheet}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>
      </div>

      <PlanTaskSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        task={sheetTask}
        planId={planId}
        defaultDayIndex={sheetDayIndex}
        availableDays={days}
        formatDayLabel={formatDayLabel}
        onAddNewDay={handleAddNewDay}
        onSave={handleSheetSave}
        defaultStartTime={sheetDefaultStartTime}
      />
    </div>
  );
}
