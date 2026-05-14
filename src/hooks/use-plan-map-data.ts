"use client";

import { useMemo } from "react";
import { colorForLeg } from "@/lib/travel/transit-colors";
import { legPathKey } from "@/components/travel/use-leg-paths";
import type { TravelPlanTask } from "@/types";
import type { TaskLeg } from "@/lib/travel/legs";
import type { Segment } from "@/components/travel/plan-segment-tabs";

/**
 * 세그먼트 모드(전체/일자별/경로별) 에 따라 지도에 표시할 pins + legs 계산.
 *
 * 이전엔 plan-detail.tsx 내부의 50+ 줄짜리 useMemo 였음. 같은 페이지의 다른 책임
 * (state, sheet, drag-drop) 와 섞여 있어 가독성 저하 → 별도 훅으로 분리해
 * "맵 데이터 산출" 책임만 격리.
 */

type LegPathsMap = Record<string, [number, number][] | undefined>;

interface MapPin {
  lat: number;
  lng: number;
  label: string;
  /** 일자별 색 구분에 사용. */
  dayIndex?: number;
  /** 추후 양방향 하이라이트(맵 ↔ 일정 행)에 사용. */
  taskId?: string;
  /** task.start_time (stored "HH:MM:SS" or null) — InfoWindow 표시용. */
  time?: string | null;
  /** 다음 task 까지 이동시간(초) — 다음 task 의 transport_duration_sec. 마지막은 null. */
  nextDurationSec?: number | null;
}

interface MapLegSpec {
  fromIdx: number;
  toIdx: number;
  path?: [number, number][];
  strokeColor?: string;
  /** car / walk / bus / subway / train / taxi / null — 선 색·점선 스타일 결정. */
  mode?: string | null;
}

export function usePlanMapData(
  segment: Segment,
  sorted: TravelPlanTask[],
  legsWithCoords: TaskLeg[],
  visibleLegs: TaskLeg[],
  legPaths: LegPathsMap,
): { pins: MapPin[]; legs: MapLegSpec[] } {
  return useMemo(() => {
    // 다음 task 의 transport_duration_sec = "이 task → 다음 task" 의 이동시간.
    // shownTasks 인덱싱 후 인덱스로 lookup.
    const taskToPin = (t: TravelPlanTask, idx: number, list: TravelPlanTask[]) =>
      t.place_lat != null && t.place_lng != null
        ? {
            lat: t.place_lat,
            lng: t.place_lng,
            label: t.place_name,
            taskId: t.id,
            dayIndex: t.day_index,
            time: t.start_time,
            nextDurationSec: list[idx + 1]?.transport_duration_sec ?? null,
          }
        : null;

    let shownTasks: TravelPlanTask[];
    if (segment.mode === "all") shownTasks = sorted;
    else if (segment.mode === "day")
      shownTasks = sorted.filter((t) => t.day_index === segment.dayIndex);
    else {
      const leg = legsWithCoords[segment.legIndex];
      shownTasks = leg ? [leg.fromTask, leg.toTask] : [];
    }
    const shownPinsAll = shownTasks
      .map((t, i) => taskToPin(t, i, shownTasks))
      .filter(Boolean) as {
      lat: number;
      lng: number;
      label: string;
      taskId: string;
      dayIndex: number;
      time: string | null;
      nextDurationSec: number | null;
    }[];

    const taskIdToIdx = new Map(shownPinsAll.map((p, i) => [p.taskId, i]));
    const legsForMap: MapLegSpec[] = [];
    for (const l of visibleLegs) {
      const fromIdx = taskIdToIdx.get(l.fromTaskId);
      const toIdx = taskIdToIdx.get(l.toTaskId);
      if (fromIdx === undefined || toIdx === undefined) continue;
      legsForMap.push({
        fromIdx,
        toIdx,
        mode: l.toTask.transport_mode,
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
                  l.toTask.transport_mode,
                )
              ]
            : undefined,
      });
    }

    const pins: MapPin[] = shownPinsAll.map(
      ({ lat, lng, label, dayIndex, taskId, time, nextDurationSec }) => ({
        lat,
        lng,
        label,
        dayIndex,
        taskId,
        time,
        nextDurationSec,
      }),
    );
    return { pins, legs: legsForMap };
  }, [segment, sorted, legsWithCoords, visibleLegs, legPaths]);
}
