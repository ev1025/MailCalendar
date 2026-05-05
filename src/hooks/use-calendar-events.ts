"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { CalendarEvent } from "@/types";
import { useCurrentUserId } from "@/lib/current-user";
import { getSessionCache, setSessionCache } from "@/lib/session-cache";

export interface SharedEvent extends CalendarEvent {
  user_id?: string | null;
  shared_with?: string[] | null;
  shared_accepted_by?: string[] | null;
}

/**
 * visibleUserIds: 캘린더 상단에서 토글로 선택된 "어떤 사용자의 일정을 볼지"
 *  - 나 자신 (currentUserId) : 내가 만든 일정
 *  - 다른 사용자: 내가 수락한 그 사람 공유 일정만
 *  - 아무도 선택 안 하면 → 빈 캘린더
 */
export function useCalendarEvents(
  year: number,
  month: number,
  visibleUserIds: string[] = []
) {
  const currentUserId = useCurrentUserId();

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  // 캐시 키 — 같은 (월, 표시 사용자) 조합의 직전 결과를 즉시 hydrate.
  // 사용자 정렬해서 안정적인 키 생성.
  const cacheKey = useMemo(
    () =>
      `cal-events:${currentUserId ?? ""}:${startDate}:${endDate}:${[
        ...visibleUserIds,
      ]
        .sort()
        .join(",")}`,
    [currentUserId, startDate, endDate, visibleUserIds],
  );

  const [events, setEvents] = useState<SharedEvent[]>(
    () => getSessionCache<SharedEvent[]>(cacheKey) ?? [],
  );
  const [loading, setLoading] = useState(
    () => getSessionCache<SharedEvent[]>(cacheKey) === null,
  );

  const fetchEvents = useCallback(async () => {
    if (!currentUserId || visibleUserIds.length === 0) {
      // 깜빡임 방지: 기존 events 유지, loading만 false로
      setLoading(false);
      return;
    }
    // 표시 월과 겹치는 일정 모두 fetch — 단지 "이번 달에 시작한 일정"만 가져오면
    // 크로스월 일정(예: 5/31~6/1) 이 6월 달력에서 누락됨.
    // 조건: start_date < endDate AND (end_date >= startDate OR end_date IS NULL AND start_date >= startDate)
    // PostgREST .or() 로 표현. 첫 .lt 가 메인 컷, 그 안에서 끝나는 시점 검사를 OR 로.
    const { data } = await supabase
      .from("calendar_events")
      .select("*")
      .in("user_id", visibleUserIds)
      .lt("start_date", endDate)
      .or(`end_date.gte.${startDate},and(end_date.is.null,start_date.gte.${startDate})`)
      .order("start_date")
      .order("sort_order")
      .order("created_at");
    const rows = (data as SharedEvent[]) || [];
    setEvents(rows);
    setLoading(false);
    setSessionCache(cacheKey, rows);
  }, [cacheKey, startDate, endDate, visibleUserIds, currentUserId]);

  // 키 변경 시(월 전환 등) 캐시 즉시 hydrate. fetchEvents 가 백그라운드 갱신.
  useEffect(() => {
    const cached = getSessionCache<SharedEvent[]>(cacheKey);
    if (cached) {
      setEvents(cached);
      setLoading(false);
    } else {
      // 새 키 + 캐시 없음 → 빈 상태로 로딩 표시 (이전 월 잔상 방지).
      setEvents([]);
      setLoading(true);
    }
  }, [cacheKey]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // 인접 월(±1) prefetch — 사용자가 스와이프했을 때 캐시 히트로 즉시 표시.
  // fetch 와 별도 effect, 결과는 cache 만 갱신 (state 무영향).
  // 이미 캐시된 키는 skip — 네트워크 절약.
  const visibleKey = useMemo(
    () => [...visibleUserIds].sort().join(","),
    [visibleUserIds],
  );
  useEffect(() => {
    if (!currentUserId || visibleUserIds.length === 0) return;
    let cancelled = false;
    const prefetch = async (y: number, m: number) => {
      const sd = `${y}-${String(m).padStart(2, "0")}-01`;
      const ed =
        m === 12
          ? `${y + 1}-01-01`
          : `${y}-${String(m + 1).padStart(2, "0")}-01`;
      const k = `cal-events:${currentUserId}:${sd}:${ed}:${visibleKey}`;
      if (getSessionCache(k)) return;
      const { data } = await supabase
        .from("calendar_events")
        .select("*")
        .in("user_id", visibleUserIds)
        .lt("start_date", ed)
        .or(
          `end_date.gte.${sd},and(end_date.is.null,start_date.gte.${sd})`,
        )
        .order("start_date")
        .order("sort_order")
        .order("created_at");
      if (cancelled) return;
      setSessionCache(k, (data as SharedEvent[]) || []);
    };
    const prev =
      month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
    const next =
      month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
    prefetch(prev.y, prev.m).catch(() => {});
    prefetch(next.y, next.m).catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, currentUserId, visibleKey]);

  function safeData(data: Record<string, unknown>) {
    const { tag, repeat, sort_order, shared_with, shared_accepted_by, series_id, ...rest } =
      data;
    const result: Record<string, unknown> = { ...rest };
    if (tag !== undefined && tag !== null && tag !== "") result.tag = tag;
    if (repeat !== undefined && repeat !== null && repeat !== "none")
      result.repeat = repeat;
    if (sort_order !== undefined && sort_order !== null)
      result.sort_order = sort_order;
    if (shared_with !== undefined) result.shared_with = shared_with;
    if (shared_accepted_by !== undefined)
      result.shared_accepted_by = shared_accepted_by;
    if (series_id !== undefined) result.series_id = series_id;
    return result;
  }

  const addEvent = async (
    event: Omit<CalendarEvent, "id" | "created_at"> & {
      shared_with?: string[] | null;
    }
  ) => {
    const payload = {
      ...event,
      user_id: currentUserId,
    };
    const { error } = await supabase
      .from("calendar_events")
      .insert(safeData(payload as Record<string, unknown>));
    if (error) {
      const { tag, repeat, sort_order, shared_with, ...rest } = event;
      void tag;
      void repeat;
      void sort_order;
      void shared_with;
      const { error: retryError } = await supabase
        .from("calendar_events")
        .insert(rest);
      if (!retryError) await fetchEvents();
      return { error: retryError };
    }
    await fetchEvents();
    return { error: null };
  };

  const addEventsBulk = async (
    eventsToAdd: (Omit<CalendarEvent, "id" | "created_at"> & {
      shared_with?: string[] | null;
    })[]
  ) => {
    if (eventsToAdd.length === 0) return { error: null };
    const payloads = eventsToAdd.map((ev) =>
      safeData({ ...ev, user_id: currentUserId } as Record<string, unknown>)
    );
    const { error } = await supabase.from("calendar_events").insert(payloads);
    if (error) {
      const fallback = eventsToAdd.map((ev) => {
        const { tag, repeat, sort_order, shared_with, ...rest } = ev;
        void tag;
        void repeat;
        void sort_order;
        void shared_with;
        return { ...rest, user_id: currentUserId };
      });
      const { error: retryError } = await supabase
        .from("calendar_events")
        .insert(fallback);
      if (!retryError) await fetchEvents();
      return { error: retryError };
    }
    await fetchEvents();
    return { error: null };
  };

  const updateEvent = async (
    id: string,
    updates: Partial<Omit<CalendarEvent, "id" | "created_at">> & {
      shared_with?: string[] | null;
    }
  ) => {
    const { error } = await supabase
      .from("calendar_events")
      .update(safeData(updates as Record<string, unknown>))
      .eq("id", id);
    if (error) {
      const { tag, repeat, sort_order, shared_with, ...rest } = updates;
      void tag;
      void repeat;
      void sort_order;
      void shared_with;
      const { error: retryError } = await supabase
        .from("calendar_events")
        .update(rest)
        .eq("id", id);
      if (!retryError) await fetchEvents();
      return { error: retryError };
    }
    await fetchEvents();
    return { error: null };
  };

  const deleteEvent = async (id: string) => {
    const { data: ev } = await supabase
      .from("calendar_events")
      .select("title, start_date")
      .eq("id", id)
      .single();

    const { error } = await supabase
      .from("calendar_events")
      .delete()
      .eq("id", id);

    if (!error && ev) {
      // title 매칭으로 visited_dates 정리 — 같은 이름 여행이 우연히 많으면
      // 무한정 update 가능. start_date 가 visited_dates 에 포함된 행만 미리 필터해서
      // 실제 영향받을 행만 가져오고, 안전상 50 으로 제한.
      const { data: travelMatches } = await supabase
        .from("travel_items")
        .select("id, visited_dates")
        .eq("title", ev.title)
        .contains("visited_dates", [ev.start_date])
        .limit(50);

      if (travelMatches && travelMatches.length > 0) {
        // 병렬 업데이트 — 순차 await 시 50회 round-trip 누적.
        await Promise.all(
          (travelMatches as { id: string; visited_dates: string[] | null }[]).map((item) => {
            const next = (item.visited_dates ?? []).filter((d) => d !== ev.start_date);
            return supabase
              .from("travel_items")
              .update({
                visited_dates: next.length > 0 ? next : null,
                visited: next.length > 0,
                updated_at: new Date().toISOString(),
              })
              .eq("id", item.id);
          }),
        );
      }
    }

    if (!error) await fetchEvents();
    return { error };
  };

  /**
   * 반복 시리즈 업데이트.
   * scope="one": 이 일정만 (series_id 분리)
   * scope="following": 이 일정 포함 이후 모두
   * scope="all": 시리즈 전부
   *
   * 주의: start_date/end_date/repeat/series_id 필드는 updates에서 제외해서
   * 각 행의 날짜 정보를 보존. (제목/색/태그/시간/설명 등 공통 속성만 일괄 변경)
   */
  const updateEventSeries = async (
    anchor: CalendarEvent,
    scope: "one" | "following" | "all",
    updates: Partial<Omit<CalendarEvent, "id" | "created_at">> & {
      shared_with?: string[] | null;
    }
  ) => {
    if (scope === "one" || !anchor.series_id) {
      return updateEvent(anchor.id, updates);
    }
    // 공통 속성만 — 각 행별 날짜는 건드리지 않음
    const {
      start_date: _sd,
      end_date: _ed,
      repeat: _rp,
      ...common
    } = updates;
    void _sd;
    void _ed;
    void _rp;

    let query = supabase
      .from("calendar_events")
      .update(safeData(common as Record<string, unknown>))
      .eq("series_id", anchor.series_id);
    if (scope === "following") {
      query = query.gte("start_date", anchor.start_date);
    }
    const { error } = await query;
    if (!error) await fetchEvents();
    return { error };
  };

  /**
   * 반복 시리즈 삭제.
   * scope="one": 이 일정만
   * scope="following": 이 일정 포함 이후 모두
   * scope="all": 시리즈 전부
   */
  const deleteEventSeries = async (
    anchor: CalendarEvent,
    scope: "one" | "following" | "all"
  ) => {
    if (scope === "one" || !anchor.series_id) {
      return deleteEvent(anchor.id);
    }
    let query = supabase
      .from("calendar_events")
      .delete()
      .eq("series_id", anchor.series_id);
    if (scope === "following") {
      query = query.gte("start_date", anchor.start_date);
    }
    const { error } = await query;
    if (!error) await fetchEvents();
    return { error };
  };

  const batchUpdateSortOrder = async (ids: string[]) => {
    await Promise.all(
      ids.map((id, i) =>
        supabase
          .from("calendar_events")
          .update({ sort_order: i })
          .eq("id", id)
      )
    );
    await fetchEvents();
  };

  return {
    events,
    loading,
    addEvent,
    addEventsBulk,
    updateEvent,
    updateEventSeries,
    deleteEventSeries,
    deleteEvent,
    batchUpdateSortOrder,
    refetch: fetchEvents,
  };
}
