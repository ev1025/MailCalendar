"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import PlanTaskRow from "@/components/travel/plan-task-row";
import PlanTaskSheet from "@/components/travel/plan-task-sheet";
import PlanSegmentTabs, { type Segment } from "@/components/travel/plan-segment-tabs";
import PlanLegCard from "@/components/travel/plan-leg-card";
import PlanRouteMap from "@/components/travel/plan-route-map";
import PlanDetailHeader from "@/components/travel/plan-detail-header";
import PlanDateRange from "@/components/travel/plan-date-range";
import { useTravelPlans } from "@/hooks/use-travel-plans";
import { useTravelPlanTasks } from "@/hooks/use-travel-plan-tasks";
import { sortTasks } from "@/lib/travel/sort-tasks";
import { tasksToLegs } from "@/lib/travel/legs";
import { invalidateRouteData } from "@/hooks/use-route-data";
import { computeExpectedTimes } from "@/lib/travel/expected-time";
import { addMinutes } from "@/lib/travel/time";
import { useLegPaths, legPathKey } from "@/components/travel/use-leg-paths";
import { colorForLeg } from "@/lib/travel/transit-colors";
import { createPlanDragEndHandler } from "@/components/travel/use-plan-drag-and-drop";
import type { TravelPlanTask } from "@/types";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toDragProps } from "@/lib/dnd-types";

interface Props {
  planId: string;
  onBack: () => void;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const TRANSPORT_RESET = {
  transport_mode: null,
  transport_duration_sec: null,
  transport_manual: false,
  transport_durations: null,
} as const;

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(startIso: string, endIso: string): number {
  const s = new Date(startIso + "T00:00:00");
  const e = new Date(endIso + "T00:00:00");
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / 86400000));
}

// 빈 일자에도 드롭 가능하도록 일자 섹션 전체를 droppable zone 으로 감쌈.
function DayDropZone({ day, children }: { day: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${day}` });
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col gap-2 rounded-md transition-colors ${
        isOver ? "bg-primary/5 ring-2 ring-primary/30" : ""
      }`}
    >
      {children}
    </div>
  );
}

// 개별 task 행 — DnD 연동용 래퍼
function SortableTaskRow({
  task,
  onClick,
  onDelete,
  expectedTime,
}: {
  task: TravelPlanTask;
  onClick: () => void;
  onDelete: () => void;
  expectedTime?: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });
  const dragProps = toDragProps<HTMLButtonElement>({ attributes, listeners });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <PlanTaskRow
        task={task}
        onClick={onClick}
        onDelete={onDelete}
        expectedTime={expectedTime}
        dragListeners={dragProps.listeners}
        dragAttributes={dragProps.attributes}
      />
    </div>
  );
}

export default function PlanDetail({ planId, onBack }: Props) {
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

  const sorted = useMemo(() => sortTasks(tasks), [tasks]);
  const expectedTimes = useMemo(() => computeExpectedTimes(sorted), [sorted]);
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
  // 범위 밖 day_index 를 가진 task(orphan) 는 tasksByDay 에서 마지막 날로 clamp
  // 해 시각적으로 누락되지 않게. 범위가 없으면 task 가 쓰는 day_index 합집합.
  const days = useMemo(() => {
    if (plan?.start_date && plan?.end_date) {
      const total = daysBetween(plan.start_date, plan.end_date);
      return Array.from({ length: total + 1 }, (_, i) => i);
    }
    const set = new Set<number>();
    for (const t of sorted) set.add(t.day_index);
    if (set.size === 0) set.add(0);
    return Array.from(set).sort((a, b) => a - b);
  }, [sorted, plan?.start_date, plan?.end_date]);

  const formatDayLabel = (dayIndex: number): string => {
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const baseIso = plan?.start_date ?? todayIso;
    const iso = addDaysISO(baseIso, dayIndex);
    const d = new Date(iso + "T00:00:00");
    return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
  };

  const totalDays = plan?.start_date && plan?.end_date
    ? daysBetween(plan.start_date, plan.end_date) + 1
    : 0;

  const visibleLegs = useMemo(() => {
    if (segment.mode === "all") return legsWithCoords;
    if (segment.mode === "day") {
      return legsWithCoords.filter((l) => l.dayIndex === segment.dayIndex);
    }
    const one = legsWithCoords[segment.legIndex];
    return one ? [one] : [];
  }, [segment, legsWithCoords]);

  const legPaths = useLegPaths(visibleLegs);

  const { pins, legs: mapLegs } = useMemo(() => {
    const taskToPin = (t: TravelPlanTask) =>
      t.place_lat != null && t.place_lng != null
        ? { lat: t.place_lat, lng: t.place_lng, label: t.place_name, taskId: t.id }
        : null;

    let shownTasks: TravelPlanTask[];
    if (segment.mode === "all") shownTasks = sorted;
    else if (segment.mode === "day")
      shownTasks = sorted.filter((t) => t.day_index === segment.dayIndex);
    else {
      const leg = legsWithCoords[segment.legIndex];
      shownTasks = leg ? [leg.fromTask, leg.toTask] : [];
    }
    const shownPinsAll = shownTasks.map(taskToPin).filter(Boolean) as {
      lat: number; lng: number; label: string; taskId: string;
    }[];

    const taskIdToIdx = new Map(shownPinsAll.map((p, i) => [p.taskId, i]));
    type MapLegSpec = { fromIdx: number; toIdx: number; path?: [number, number][]; strokeColor?: string };
    const legsForMap: MapLegSpec[] = [];
    for (const l of visibleLegs) {
      const fromIdx = taskIdToIdx.get(l.fromTaskId);
      const toIdx = taskIdToIdx.get(l.toTaskId);
      if (fromIdx === undefined || toIdx === undefined) continue;
      legsForMap.push({
        fromIdx,
        toIdx,
        strokeColor: colorForLeg(l.toTask.transport_mode, l.toTask.transport_route),
        path:
          l.toTask.transport_mode &&
          l.fromTask.place_lat != null &&
          l.fromTask.place_lng != null &&
          l.toTask.place_lat != null &&
          l.toTask.place_lng != null
            ? legPaths[
                legPathKey(
                  l.fromTask.place_lat,
                  l.fromTask.place_lng,
                  l.toTask.place_lat,
                  l.toTask.place_lng,
                  l.toTask.transport_mode
                )
              ]
            : undefined,
      });
    }

    const shownPins = shownPinsAll.map(({ lat, lng, label }) => ({ lat, lng, label }));
    return { pins: shownPins, legs: legsForMap };
  }, [segment, sorted, legsWithCoords, visibleLegs, legPaths]);

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

  return (
    <div className="flex flex-col">
      <PlanDetailHeader
        title={plan.title}
        onBack={onBack}
        onRename={(next) => updatePlan(plan.id, { title: next })}
      />

      <div>
        <div className="mx-auto w-full max-w-2xl">
          <PlanDateRange
            startDate={plan.start_date}
            endDate={plan.end_date}
            totalDays={totalDays}
            onChangeStart={(iso) => updatePlan(plan.id, { start_date: iso })}
            onChangeEnd={(iso) => updatePlan(plan.id, { end_date: iso })}
          />

          {/* 경로맵 */}
          <div className="flex flex-col gap-2 p-3 border-b">
            <PlanSegmentTabs
              segment={segment}
              onChange={setSegment}
              days={days}
              legs={legsWithCoords}
            />
            <PlanRouteMap pins={pins} legs={mapLegs} heightClass="h-60 md:h-[28rem]" />
          </div>

          {/* 일자별 섹션 — 전체를 하나의 DndContext 로 감싸 일자 간 이동도 지원 */}
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
                            (t) => t.id === leg.fromTaskId || t.id === leg.toTaskId
                          );
                        })()
                      : rawDayTasks;
                  return (
                    <section key={day} className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold">{formatDayLabel(day)}</h3>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                      <DayDropZone day={day}>
                        {dayTasks.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            {dayTasks.map((t, i) => {
                              const next = dayTasks[i + 1];
                              const leg = next
                                ? legsWithCoords.find(
                                    (l) => l.fromTaskId === t.id && l.toTaskId === next.id
                                  )
                                : undefined;
                              // 이 구간의 출발 시각 = 현재 task 의 [도착시간 + 체류]
                              const arr = expectedTimes[t.id]?.time ?? null;
                              const legDeparture =
                                leg && arr ? addMinutes(arr, t.stay_minutes ?? 0) : null;
                              return (
                                <div key={t.id} className="flex flex-col gap-1.5">
                                  <SortableTaskRow
                                    task={t}
                                    onClick={() => openEditSheet(t)}
                                    onDelete={() => deleteTask(t.id)}
                                    expectedTime={
                                      expectedTimes[t.id]?.predicted
                                        ? expectedTimes[t.id]?.time ?? null
                                        : null
                                    }
                                  />
                                  {leg && (
                                    <PlanLegCard
                                      leg={leg}
                                      legDeparture={legDeparture}
                                      onUpdateTask={updateTask}
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openNewSheet(day)}
                          className="self-start h-8 text-xs"
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" /> 일정 추가
                        </Button>
                      </DayDropZone>
                    </section>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
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
