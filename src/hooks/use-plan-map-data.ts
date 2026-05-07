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
}

interface MapLegSpec {
  fromIdx: number;
  toIdx: number;
  path?: [number, number][];
  strokeColor?: string;
}

export function usePlanMapData(
  segment: Segment,
  sorted: TravelPlanTask[],
  legsWithCoords: TaskLeg[],
  visibleLegs: TaskLeg[],
  legPaths: LegPathsMap,
): { pins: MapPin[]; legs: MapLegSpec[] } {
  return useMemo(() => {
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
      lat: number;
      lng: number;
      label: string;
      taskId: string;
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

    const pins: MapPin[] = shownPinsAll.map(({ lat, lng, label }) => ({ lat, lng, label }));
    return { pins, legs: legsForMap };
  }, [segment, sorted, legsWithCoords, visibleLegs, legPaths]);
}
