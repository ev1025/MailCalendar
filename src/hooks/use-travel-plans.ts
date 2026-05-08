"use client";

import { useCallback, useMemo } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCurrentUserId } from "@/lib/current-user";
import { syncPlanCalendarEvents } from "@/lib/travel/calendar-sync";
import type { TravelPlan } from "@/types";

const STALE_TIME = 5 * 60 * 1000;
const GC_TIME = 24 * 60 * 60 * 1000;

export function travelPlansQueryKey(
  userId: string | null | undefined,
  visibleUserIds?: string[],
) {
  return [
    "travel-plans",
    userId ?? "",
    [...(visibleUserIds ?? [])].sort().join(","),
  ] as const;
}

async function fetchTravelPlans(
  userId: string | null | undefined,
  visibleUserIds?: string[],
): Promise<TravelPlan[]> {
  let query = supabase
    .from("travel_plans")
    .select("*")
    .order("updated_at", { ascending: false });
  const filterIds =
    visibleUserIds && visibleUserIds.length > 0
      ? visibleUserIds
      : userId
        ? [userId]
        : [];
  if (filterIds.length > 0) query = query.in("user_id", filterIds);
  const { data, error } = await query;
  if (error) {
    const fallback = await supabase
      .from("travel_plans")
      .select("*")
      .order("updated_at", { ascending: false });
    return ((fallback.data as TravelPlan[]) ?? []);
  }
  return ((data as TravelPlan[]) ?? []);
}

function invalidatePlans(qc: QueryClient, userId: string | null | undefined) {
  qc.invalidateQueries({ queryKey: ["travel-plans", userId ?? ""] });
}

/**
 * visibleUserIds: 달력 탭에서 선택한 "볼 사용자들"
 *  - 전달 시 해당 사용자들의 계획 조회 (공유된 계획 포함)
 *  - 생략 시 내 계획만
 */
export function useTravelPlans(visibleUserIds?: string[]) {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();

  const queryKey = useMemo(
    () => travelPlansQueryKey(userId, visibleUserIds),
    [userId, visibleUserIds],
  );

  const plansQuery = useQuery<TravelPlan[]>({
    queryKey,
    queryFn: () => fetchTravelPlans(userId, visibleUserIds),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

  const plans = plansQuery.data ?? [];
  const invalidate = useCallback(
    () => invalidatePlans(queryClient, userId),
    [queryClient, userId],
  );

  const addPlan = useCallback(
    async (
      input: Pick<TravelPlan, "title"> &
        Partial<Pick<TravelPlan, "start_date" | "end_date" | "notes">>,
    ) => {
      const payload = { ...input, user_id: userId };
      const first = await supabase
        .from("travel_plans")
        .insert(payload)
        .select("*")
        .single();
      if (!first.error) {
        invalidate();
        return { data: first.data, error: null };
      }
      const retry = await supabase
        .from("travel_plans")
        .insert(input)
        .select("*")
        .single();
      if (!retry.error) invalidate();
      return { data: retry.data, error: retry.error };
    },
    [userId, invalidate],
  );

  const updatePlan = useCallback(
    async (id: string, updates: Partial<TravelPlan>) => {
      const { error } = await supabase
        .from("travel_plans")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (!error) {
        invalidate();
        if (
          Object.prototype.hasOwnProperty.call(updates, "start_date") ||
          Object.prototype.hasOwnProperty.call(updates, "end_date")
        ) {
          await syncPlanCalendarEvents({ planId: id, userId });
          // 캘린더 events 도 invalidate.
          queryClient.invalidateQueries({
            queryKey: ["calendar-events", userId ?? ""],
          });
        }
      }
      return { error };
    },
    [invalidate, userId, queryClient],
  );

  const deletePlan = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("travel_plans")
        .delete()
        .eq("id", id);
      if (!error) invalidate();
      return { error };
    },
    [invalidate],
  );

  const duplicatePlan = useCallback(
    async (id: string) => {
      const original = plans.find((p) => p.id === id);
      if (!original) return { error: "원본 계획을 찾을 수 없습니다" };
      const newPlan = await addPlan({
        title: `${original.title} (복사본)`,
        start_date: original.start_date ?? undefined,
        end_date: original.end_date ?? undefined,
        notes: original.notes ?? undefined,
      });
      if (newPlan.error || !newPlan.data) return { error: newPlan.error };
      const { data: tasks, error: tErr } = await supabase
        .from("travel_plan_tasks")
        .select("*")
        .eq("plan_id", id);
      if (tErr) return { error: tErr };
      if (tasks && tasks.length > 0) {
        const cloned = tasks.map((t: Record<string, unknown>) => {
          const { id: _omitId, created_at: _c, ...rest } = t as {
            id: string;
            created_at: string;
          };
          void _omitId;
          void _c;
          return { ...rest, plan_id: newPlan.data!.id };
        });
        await supabase.from("travel_plan_tasks").insert(cloned);
      }
      invalidate();
      return { data: newPlan.data, error: null };
    },
    [plans, addPlan, invalidate],
  );

  return {
    plans,
    loading: plansQuery.data === undefined,
    addPlan,
    updatePlan,
    deletePlan,
    duplicatePlan,
    refetch: () => plansQuery.refetch(),
  };
}
