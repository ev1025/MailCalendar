"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCurrentUserId } from "@/lib/current-user";
import { useAutoRefetch } from "@/hooks/use-auto-refetch";
import { syncPlanCalendarEvents } from "@/lib/travel/calendar-sync";
import { getSessionCache, setSessionCache } from "@/lib/session-cache";
import type { TravelPlan } from "@/types";

/**
 * visibleUserIds: 달력 탭에서 선택한 "볼 사용자들"
 *  - 전달 시 해당 사용자들의 계획 조회 (공유된 계획 포함)
 *  - 생략 시 내 계획만
 *
 * 공유된 계획도 수정 가능 (RLS 정책에서 owner + accepted share 모두 허용).
 */
export function useTravelPlans(visibleUserIds?: string[]) {
  const userId = useCurrentUserId();

  const visibleKey = visibleUserIds?.join(",") ?? "";
  const cacheKey = useMemo(
    () => `travel-plans:${userId ?? ""}:${visibleKey}`,
    [userId, visibleKey],
  );

  const [plans, setPlans] = useState<TravelPlan[]>(
    () => getSessionCache<TravelPlan[]>(cacheKey) ?? [],
  );
  const [loading, setLoading] = useState(
    () => getSessionCache<TravelPlan[]>(cacheKey) === null,
  );

  const fetchPlans = useCallback(async () => {
    let query = supabase
      .from("travel_plans")
      .select("*")
      .order("updated_at", { ascending: false });
    const filterIds =
      visibleUserIds && visibleUserIds.length > 0
        ? visibleUserIds
        : (userId ? [userId] : []);
    if (filterIds.length > 0) query = query.in("user_id", filterIds);
    const { data, error } = await query;
    if (error) {
      // user_id 컬럼 미존재 구버전 대비
      const fallback = await supabase
        .from("travel_plans")
        .select("*")
        .order("updated_at", { ascending: false });
      if (fallback.data) {
        setPlans(fallback.data);
        setSessionCache(cacheKey, fallback.data);
      }
    } else if (data) {
      setPlans(data);
      setSessionCache(cacheKey, data);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, visibleKey, cacheKey]);

  useEffect(() => {
    const cached = getSessionCache<TravelPlan[]>(cacheKey);
    if (cached) {
      setPlans(cached);
      setLoading(false);
    } else {
      setPlans([]);
      setLoading(true);
    }
  }, [cacheKey]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  // 앱이 다시 포그라운드로 올라올 때 재조회 —
  // 공유자가 업데이트한 내용이 세션 중에 갱신되도록. auth 토큰 refresh 후
  // 백그라운드→포그라운드 복귀 + Auth 갱신 시 재조회.
  useAutoRefetch(fetchPlans);

  const addPlan = async (
    input: Pick<TravelPlan, "title"> & Partial<Pick<TravelPlan, "start_date" | "end_date" | "notes">>
  ) => {
    const payload = { ...input, user_id: userId };
    const first = await supabase
      .from("travel_plans")
      .insert(payload)
      .select("*")
      .single();
    if (!first.error) {
      await fetchPlans();
      return { data: first.data, error: null };
    }
    const retry = await supabase
      .from("travel_plans")
      .insert(input)
      .select("*")
      .single();
    if (!retry.error) await fetchPlans();
    return { data: retry.data, error: retry.error };
  };

  const updatePlan = async (id: string, updates: Partial<TravelPlan>) => {
    const { error } = await supabase
      .from("travel_plans")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (!error) {
      await fetchPlans();
      // start_date/end_date 가 바뀌면 day_index → 실제 날짜 매핑이 변하므로
      // 이미 등록된 calendar_events 도 다시 빌드해야 함. 등록 안 된 plan 은 no-op.
      if (
        Object.prototype.hasOwnProperty.call(updates, "start_date") ||
        Object.prototype.hasOwnProperty.call(updates, "end_date")
      ) {
        await syncPlanCalendarEvents({ planId: id, userId });
      }
    }
    return { error };
  };

  const deletePlan = async (id: string) => {
    const { error } = await supabase.from("travel_plans").delete().eq("id", id);
    if (!error) await fetchPlans();
    return { error };
  };

  // 계획 복제 — 메타 + 소속 tasks 전체를 새 plan 으로 복사. sort_order/day_index 유지.
  const duplicatePlan = async (id: string) => {
    const original = plans.find((p) => p.id === id);
    if (!original) return { error: "원본 계획을 찾을 수 없습니다" };
    const newPlan = await addPlan({
      title: `${original.title} (복사본)`,
      start_date: original.start_date ?? undefined,
      end_date: original.end_date ?? undefined,
      notes: original.notes ?? undefined,
    });
    if (newPlan.error || !newPlan.data) return { error: newPlan.error };
    // tasks 조회 후 그대로 복제 (id 는 생성 후 자동 부여)
    const { data: tasks, error: tErr } = await supabase
      .from("travel_plan_tasks")
      .select("*")
      .eq("plan_id", id);
    if (tErr) return { error: tErr };
    if (tasks && tasks.length > 0) {
      const cloned = tasks.map((t: Record<string, unknown>) => {
        const { id: _omitId, created_at: _c, ...rest } = t as { id: string; created_at: string };
        void _omitId; void _c;
        return { ...rest, plan_id: newPlan.data!.id };
      });
      await supabase.from("travel_plan_tasks").insert(cloned);
    }
    await fetchPlans();
    return { data: newPlan.data, error: null };
  };

  return { plans, loading, addPlan, updatePlan, deletePlan, duplicatePlan, refetch: fetchPlans };
}
