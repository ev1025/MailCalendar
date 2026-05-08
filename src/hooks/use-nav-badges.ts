"use client";

import { useEffect } from "react";
import {
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCurrentUserId } from "@/lib/current-user";
import { todayYmd } from "@/lib/date-utils";

/**
 * 하단 네비/사이드바에 노출할 뱃지 카운트.
 * 가벼운 count 쿼리. Realtime + invalidate 로 변경 시 즉시 갱신.
 *  - calendar: 오늘 일정 개수
 *  - finance: 오늘이 결제일인 활성 고정비 개수
 */
const STALE_TIME = 60 * 1000; // 1분 — 폴링 폐기, Realtime + 자동 invalidate 의존.
const GC_TIME = 24 * 60 * 60 * 1000;

export function navBadgesQueryKey(userId: string | null | undefined) {
  return ["nav-badges", userId ?? ""] as const;
}

async function fetchNavBadges(userId: string | null | undefined) {
  if (!userId) return { todayEvents: 0, todayFixed: 0 };
  const today = new Date();
  const ymd = todayYmd();
  const dayOfMonth = today.getDate();

  const [ev, fx] = await Promise.all([
    supabase
      .from("calendar_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .lte("start_date", ymd)
      .or(
        `end_date.gte.${ymd},and(end_date.is.null,start_date.eq.${ymd})`,
      ),
    supabase
      .from("fixed_expenses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("day_of_month", dayOfMonth),
  ]);
  return {
    todayEvents: ev.count ?? 0,
    todayFixed: fx.count ?? 0,
  };
}

export function useNavBadges() {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();

  const badgesQuery = useQuery({
    queryKey: navBadgesQueryKey(userId),
    queryFn: () => fetchNavBadges(userId),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    enabled: !!userId,
  });

  // Realtime — calendar_events / fixed_expenses 변경 시 invalidate.
  // RLS가 select에만 작동하므로 보수적으로 변경 즉시 invalidate.
  useEffect(() => {
    if (!userId) return;
    const rid = Math.random().toString(36).slice(2);
    const channel = supabase
      .channel(`nav-badges:${userId}:${rid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calendar_events" },
        () =>
          queryClient.invalidateQueries({
            queryKey: navBadgesQueryKey(userId),
          }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fixed_expenses" },
        () =>
          queryClient.invalidateQueries({
            queryKey: navBadgesQueryKey(userId),
          }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return {
    todayEvents: badgesQuery.data?.todayEvents ?? 0,
    todayFixed: badgesQuery.data?.todayFixed ?? 0,
  };
}
