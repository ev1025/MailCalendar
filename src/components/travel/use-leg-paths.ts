"use client";

import { useEffect, useRef, useState } from "react";
import { getRouteData } from "@/hooks/use-route-data";
import type { TaskLeg } from "@/lib/travel/legs";

// 여행 계획의 표시 대상 leg 들에 대해 route path (polyline) 를 비동기 fetch.
// 중복 호출 방지 (pending ref) · 컴포넌트 unmount 대응 (cancelled flag) 포함.
// key 에 좌표도 포함 — task 좌표가 바뀌면(장소 변경) 새 key → stale path 방지.

export type LegPathMap = Record<string, [number, number][]>;

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

export function legPathKey(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  mode: string
): string {
  return `${round5(fromLat)},${round5(fromLng)}|${round5(toLat)},${round5(toLng)}|${mode}`;
}

export function useLegPaths(visibleLegs: TaskLeg[]): LegPathMap {
  const [legPaths, setLegPaths] = useState<LegPathMap>({});
  const pending = useRef<Set<string>>(new Set());
  // 이미 path 를 받은 key 들 — effect 가 legPaths(state)를 읽으면 stale 클로저라
  // visibleLegs 가 바뀔 때마다 해결된 경로까지 재패칭함 → ref 로 추적해 항상 최신값 참조.
  const resolved = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const leg of visibleLegs) {
        if (cancelled) return;
        const mode = leg.toTask.transport_mode;
        if (!mode) continue;
        if (
          leg.fromTask.place_lat == null ||
          leg.fromTask.place_lng == null ||
          leg.toTask.place_lat == null ||
          leg.toTask.place_lng == null
        ) continue;
        const key = legPathKey(
          leg.fromTask.place_lat,
          leg.fromTask.place_lng,
          leg.toTask.place_lat,
          leg.toTask.place_lng,
          mode
        );
        if (resolved.current.has(key) || pending.current.has(key)) continue;
        pending.current.add(key);
        try {
          const result = await getRouteData(
            { lat: leg.fromTask.place_lat, lng: leg.fromTask.place_lng },
            { lat: leg.toTask.place_lat, lng: leg.toTask.place_lng },
            mode
          );
          if (cancelled) return;
          if (result?.path && result.path.length > 1) {
            resolved.current.add(key);
            setLegPaths((p) => ({ ...p, [key]: result.path! }));
          }
        } finally {
          pending.current.delete(key);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [visibleLegs]);

  return legPaths;
}
