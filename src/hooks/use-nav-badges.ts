"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCurrentUserId } from "@/lib/current-user";
import { useAutoRefetch } from "@/hooks/use-auto-refetch";

/**
 * 하단 네비/사이드바에 노출할 뱃지 카운트.
 *
 * 가벼운 count 쿼리만 사용 — 캐시 hydrate 흐름 외부.
 *  - calendar: 오늘 일정 개수 (start_date <= today <= end_date)
 *  - finance: 오늘이 결제일인 활성 고정비 개수
 *
 * 너무 많은 쿼리를 하지 않기 위해 5분 stale-while-revalidate.
 */
export function useNavBadges() {
  const userId = useCurrentUserId();
  const [todayEvents, setTodayEvents] = useState(0);
  const [todayFixed, setTodayFixed] = useState(0);

  const refetch = async () => {
    if (!userId) return;
    const today = new Date();
    const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const dayOfMonth = today.getDate();

    // 1) 오늘 포함 일정 — start_date <= today AND (end_date IS NULL ? start_date == today : end_date >= today)
    // PostgREST: start_date.lte.today AND (end_date.gte.today OR (end_date.is.null AND start_date.eq.today))
    const ev = await supabase
      .from("calendar_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .lte("start_date", ymd)
      .or(`end_date.gte.${ymd},and(end_date.is.null,start_date.eq.${ymd})`);
    if (typeof ev.count === "number") setTodayEvents(ev.count);

    // 2) 오늘이 결제일인 활성 고정비
    const fx = await supabase
      .from("fixed_expenses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("day_of_month", dayOfMonth);
    if (typeof fx.count === "number") setTodayFixed(fx.count);
  };

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // 포그라운드 복귀 시 갱신.
  useAutoRefetch(refetch);

  return { todayEvents, todayFixed };
}
