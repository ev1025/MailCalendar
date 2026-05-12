"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { syncPlanCalendarEvents } from "@/lib/travel/calendar-sync";
import { useCurrentUserId } from "@/lib/current-user";
import type { TravelPlanTask } from "@/types";

const STALE_TIME = 5 * 60 * 1000;
const GC_TIME = 24 * 60 * 60 * 1000;

export function travelPlanTasksQueryKey(planId: string | null) {
  return ["travel-plan-tasks", planId ?? ""] as const;
}

async function fetchPlanTasks(
  planId: string | null,
): Promise<TravelPlanTask[]> {
  if (!planId) return [];
  // 정렬 우선순위는 클라이언트 sortTasks 와 동일하게 — day_index → manual_order →
  // start_time. (이전엔 DB 가 start_time 우선이라 초기 렌더 / calendar-sync 가
  // 클라이언트 표시 순서와 어긋났음.)
  const { data } = await supabase
    .from("travel_plan_tasks")
    .select("*")
    .eq("plan_id", planId)
    .order("day_index", { ascending: true })
    .order("manual_order", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: false });
  return ((data as TravelPlanTask[]) ?? []);
}

function invalidateTasks(qc: QueryClient, planId: string | null) {
  qc.invalidateQueries({ queryKey: travelPlanTasksQueryKey(planId) });
}

export function useTravelPlanTasks(planId: string | null) {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => travelPlanTasksQueryKey(planId),
    [planId],
  );

  const tasksQuery = useQuery<TravelPlanTask[]>({
    queryKey,
    queryFn: () => fetchPlanTasks(planId),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    enabled: !!planId,
  });

  const invalidate = useCallback(
    () => invalidateTasks(queryClient, planId),
    [queryClient, planId],
  );

  // task 변경 후 calendar_events 도 영향. plan 이 등록된 적 있다면 재동기화.
  // 짧은 시간(연속 update — 정렬 드래그 등)에 여러 번 호출되면 마지막 한 번만 실행
  // 되도록 trailing debounce. immediate=true 인 경우(폼 저장 등)엔 즉시 실행 후
  // 잠금. 일반은 600ms.
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, []);

  const syncCalendar = useCallback(
    (opts?: { immediate?: boolean }) => {
      if (!planId) return;
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      const run = async () => {
        await syncPlanCalendarEvents({ planId, userId });
        queryClient.invalidateQueries({
          queryKey: ["calendar-events", userId ?? ""],
        });
      };
      if (opts?.immediate) {
        // fire-and-forget — 호출자 await 안 해도 진행.
        void run();
        return;
      }
      syncTimerRef.current = setTimeout(() => {
        void run();
      }, 600);
    },
    [planId, userId, queryClient],
  );

  const addTask = useCallback(
    async (input: Omit<TravelPlanTask, "id" | "created_at">) => {
      const { data, error } = await supabase
        .from("travel_plan_tasks")
        .insert(input)
        .select("*")
        .single();
      if (!error) {
        invalidate();
        syncCalendar();
      }
      return { data, error };
    },
    [invalidate, syncCalendar],
  );

  const updateTask = useCallback(
    async (id: string, updates: Partial<TravelPlanTask>) => {
      const { error } = await supabase
        .from("travel_plan_tasks")
        .update(updates)
        .eq("id", id);
      if (!error) {
        invalidate();
        syncCalendar();
      }
      return { error };
    },
    [invalidate, syncCalendar],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("travel_plan_tasks")
        .delete()
        .eq("id", id);
      if (!error) {
        invalidate();
        syncCalendar();
      }
      return { error };
    },
    [invalidate, syncCalendar],
  );

  const bulkInsert = useCallback(
    async (rows: Omit<TravelPlanTask, "id" | "created_at">[]) => {
      if (rows.length === 0) return { error: null };
      const { error } = await supabase
        .from("travel_plan_tasks")
        .insert(rows);
      if (!error) {
        invalidate();
        syncCalendar();
      }
      return { error };
    },
    [invalidate, syncCalendar],
  );

  return {
    tasks: tasksQuery.data ?? [],
    loading: !!planId && tasksQuery.isPending,
    addTask,
    updateTask,
    deleteTask,
    bulkInsert,
    refetch: () => tasksQuery.refetch(),
  };
}
