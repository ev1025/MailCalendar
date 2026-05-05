"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { syncPlanCalendarEvents } from "@/lib/travel/calendar-sync";
import { useCurrentUserId } from "@/lib/current-user";
import { useAutoRefetch } from "@/hooks/use-auto-refetch";
import { getSessionCache, setSessionCache } from "@/lib/session-cache";
import type { TravelPlanTask } from "@/types";

// 특정 plan_id 의 travel_plan_tasks CRUD.
// 정렬 기준: day_index → start_time(있으면) → manual_order.
//
// task 가 변경되면 (이 plan 으로 "달력에 추가" 한 적 있을 때 한해)
// calendar_events 를 자동 재빌드 — 사용자가 별도 동기화 액션 안 해도 일정이 따라옴.

export function useTravelPlanTasks(planId: string | null) {
  const userId = useCurrentUserId();
  const cacheKey = useMemo(
    () => (planId ? `travel-plan-tasks:${planId}` : null),
    [planId],
  );

  const [tasks, setTasks] = useState<TravelPlanTask[]>(() =>
    cacheKey ? getSessionCache<TravelPlanTask[]>(cacheKey) ?? [] : [],
  );
  const [loading, setLoading] = useState(
    () => !cacheKey || getSessionCache<TravelPlanTask[]>(cacheKey) === null,
  );

  // task 변경 후 호출. 이 plan 이 calendar_events 를 가지고 있을 때만 재동기화.
  // 카드뷰의 hasCalendarEvents 표시는 plan-list 가 별도로 갱신.
  const syncCalendar = useCallback(async () => {
    if (!planId) return;
    await syncPlanCalendarEvents({ planId, userId });
  }, [planId, userId]);

  const fetchTasks = useCallback(async () => {
    if (!planId || !cacheKey) {
      setTasks([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("travel_plan_tasks")
      .select("*")
      .eq("plan_id", planId)
      .order("day_index", { ascending: true })
      .order("start_time", { ascending: true, nullsFirst: false })
      .order("manual_order", { ascending: true });
    const rows = (data as TravelPlanTask[]) ?? [];
    setTasks(rows);
    setSessionCache(cacheKey, rows);
    setLoading(false);
  }, [planId, cacheKey]);

  useEffect(() => {
    if (!cacheKey) {
      setTasks([]);
      setLoading(false);
      return;
    }
    const cached = getSessionCache<TravelPlanTask[]>(cacheKey);
    if (cached) {
      setTasks(cached);
      setLoading(false);
    } else {
      setTasks([]);
      setLoading(true);
    }
  }, [cacheKey]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // 포그라운드 복귀 / 세션 refresh 시 재조회 — 공유자 수정 내용 갱신.
  useAutoRefetch(fetchTasks);

  const addTask = async (input: Omit<TravelPlanTask, "id" | "created_at">) => {
    const { data, error } = await supabase
      .from("travel_plan_tasks")
      .insert(input)
      .select("*")
      .single();
    if (!error) {
      await fetchTasks();
      await syncCalendar();
    }
    return { data, error };
  };

  const updateTask = async (id: string, updates: Partial<TravelPlanTask>) => {
    const { error } = await supabase
      .from("travel_plan_tasks")
      .update(updates)
      .eq("id", id);
    if (!error) {
      await fetchTasks();
      await syncCalendar();
    }
    return { error };
  };

  const deleteTask = async (id: string) => {
    const { error } = await supabase.from("travel_plan_tasks").delete().eq("id", id);
    if (!error) {
      await fetchTasks();
      await syncCalendar();
    }
    return { error };
  };

  // 여행 항목의 places[] 를 일괄 삽입 (add-to-plan-dialog 용)
  const bulkInsert = async (rows: Omit<TravelPlanTask, "id" | "created_at">[]) => {
    if (rows.length === 0) return { error: null };
    const { error } = await supabase.from("travel_plan_tasks").insert(rows);
    if (!error) {
      await fetchTasks();
      await syncCalendar();
    }
    return { error };
  };

  return {
    tasks,
    loading,
    addTask,
    updateTask,
    deleteTask,
    bulkInsert,
    refetch: fetchTasks,
  };
}
