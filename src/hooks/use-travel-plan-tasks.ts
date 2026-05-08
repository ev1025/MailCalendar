"use client";

import { useCallback, useMemo } from "react";
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
  const { data } = await supabase
    .from("travel_plan_tasks")
    .select("*")
    .eq("plan_id", planId)
    .order("day_index", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: false })
    .order("manual_order", { ascending: true });
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

  // task 변경 후 calendar_events 도 영향. plan 이 등록된 적 있다면 재동기화 + invalidate.
  const syncCalendar = useCallback(async () => {
    if (!planId) return;
    await syncPlanCalendarEvents({ planId, userId });
    queryClient.invalidateQueries({
      queryKey: ["calendar-events", userId ?? ""],
    });
  }, [planId, userId, queryClient]);

  const addTask = useCallback(
    async (input: Omit<TravelPlanTask, "id" | "created_at">) => {
      const { data, error } = await supabase
        .from("travel_plan_tasks")
        .insert(input)
        .select("*")
        .single();
      if (!error) {
        invalidate();
        await syncCalendar();
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
        await syncCalendar();
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
        await syncCalendar();
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
        await syncCalendar();
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
