"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CalendarEvent } from "@/types";
import { useCurrentUserId } from "@/lib/current-user";
import { monthBounds } from "@/lib/date-utils";

export interface SharedEvent extends CalendarEvent {
  user_id?: string | null;
  shared_with?: string[] | null;
  shared_accepted_by?: string[] | null;
}

const STALE_TIME = 5 * 60 * 1000; // 5분 fresh — 그 이후 background revalidate.
const GC_TIME = 24 * 60 * 60 * 1000; // 24시간 메모리 보존 — 페이지 이동 후 복귀 시 즉시 표시.

/**
 * 표준 queryKey 생성기. RSC prefetch / 클라이언트 query / mutation invalidate
 * 모두 같은 키 형태를 공유.
 */
export function calendarEventsQueryKey(
  currentUserId: string | null | undefined,
  startDate: string,
  endDate: string,
  visibleUserIds: string[],
) {
  return [
    "calendar-events",
    currentUserId ?? "",
    startDate,
    endDate,
    [...visibleUserIds].sort().join(","),
  ] as const;
}

/**
 * 한 달 범위의 캘린더 이벤트를 PostgREST에서 가져온다.
 * cross-month 일정도 포함되도록 (start_date < endDate) AND (end_date >= startDate
 * OR end_date IS NULL AND start_date >= startDate) 조건.
 */
export async function fetchCalendarEventsBetween(
  startDate: string,
  endDate: string,
  visibleUserIds: string[],
): Promise<SharedEvent[]> {
  if (visibleUserIds.length === 0) return [];
  const { data, error } = await supabase
    .from("calendar_events")
    .select("*")
    .in("user_id", visibleUserIds)
    .lt("start_date", endDate)
    .or(
      `end_date.gte.${startDate},and(end_date.is.null,start_date.gte.${startDate})`,
    )
    .order("start_date")
    .order("sort_order")
    .order("created_at");
  if (error) throw error;
  return (data as SharedEvent[]) ?? [];
}

/**
 * 같은 currentUserId 의 모든 월 캐시를 일괄 invalidate.
 * 변경(insert/update/delete) 시 호출. 각 월의 stale 처리만 하고 실제 fetch는
 * 활성 useQuery 가 있는 월만 트리거됨 → 비용 효율적.
 */
function invalidateCalendarEvents(
  qc: QueryClient,
  currentUserId: string | null | undefined,
) {
  qc.invalidateQueries({
    queryKey: ["calendar-events", currentUserId ?? ""],
  });
}

/**
 * visibleUserIds: 캘린더 상단에서 토글로 선택된 "어떤 사용자의 일정을 볼지"
 *  - 나 자신 (currentUserId) : 내가 만든 일정
 *  - 다른 사용자: 내가 수락한 그 사람 공유 일정만
 *  - 아무도 선택 안 하면 → 빈 캘린더
 *
 * 내부 구현: TanStack Query 기반.
 *  - useQuery 로 메인 월 fetch (queryKey 변경 시 자동 refetch)
 *  - useEffect + queryClient.prefetchQuery 로 인접 월 ±1 prefetch
 *  - Supabase Realtime postgres_changes 구독 → 변경 시 invalidate
 *  - mutations(addEvent 등)는 직접 supabase 호출 후 invalidate (PoC; optimistic은 후속)
 */
export function useCalendarEvents(
  year: number,
  month: number,
  visibleUserIds: string[] = [],
) {
  const currentUserId = useCurrentUserId();
  const queryClient = useQueryClient();

  const startDate = monthBounds(year, month).start;
  const endDate =
    month === 12 ? `${year + 1}-01-01` : monthBounds(year, month + 1).start;

  const queryKey = useMemo(
    () =>
      calendarEventsQueryKey(currentUserId, startDate, endDate, visibleUserIds),
    [currentUserId, startDate, endDate, visibleUserIds],
  );

  const enabled = !!currentUserId && visibleUserIds.length > 0;

  const queryResult = useQuery<SharedEvent[]>({
    queryKey,
    queryFn: () =>
      fetchCalendarEventsBetween(startDate, endDate, visibleUserIds),
    enabled,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

  // 인접 월 ±1 prefetch — 사용자가 스와이프했을 때 캐시 hit으로 즉시 표시.
  const visibleKey = useMemo(
    () => [...visibleUserIds].sort().join(","),
    [visibleUserIds],
  );
  useEffect(() => {
    if (!enabled) return;
    const prefetchMonth = (y: number, m: number) => {
      const sd = monthBounds(y, m).start;
      const ed = m === 12 ? `${y + 1}-01-01` : monthBounds(y, m + 1).start;
      const k = calendarEventsQueryKey(currentUserId, sd, ed, visibleUserIds);
      queryClient.prefetchQuery({
        queryKey: k,
        queryFn: () => fetchCalendarEventsBetween(sd, ed, visibleUserIds),
        staleTime: STALE_TIME,
      });
    };
    const prev =
      month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
    const next =
      month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
    prefetchMonth(prev.y, prev.m);
    prefetchMonth(next.y, next.m);
    // visibleKey 가 의존성 — eslint 룰은 visibleUserIds 도 요구하지만 동등 표현.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, currentUserId, visibleKey, enabled, queryClient]);

  // Realtime — calendar_events 테이블 변경 시 invalidate.
  // RLS 가 select 에만 작동하지만 realtime 메타는 모든 행 전송 가능 →
  // 페이로드 user_id 가 visibleUserIds 와 무관하면 무시. 페이로드 누락 가능성 감안해
  // 보수적으로 항상 invalidate (비용은 stale 처리만, 실 fetch는 활성 월만).
  useEffect(() => {
    if (!currentUserId) return;
    // channel name 에 random suffix — strict mode 이중 effect 시 cleanup(비동기)
    // 끝나기 전에 같은 이름으로 .channel() 호출되면 Supabase 캐시가 같은 객체를
    // 반환해 이미 subscribed 채널에 .on() 등록되어 throw. random 으로 매번 새 객체.
    const rid = Math.random().toString(36).slice(2);
    const channel = supabase
      .channel(`calendar-events:${currentUserId}:${rid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calendar_events" },
        () => {
          invalidateCalendarEvents(queryClient, currentUserId);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, queryClient]);

  // ---------- mutation helpers ----------
  // safeData: 기존 시리즈/태그/공유 등 옵션 필드를 안전하게 dropdown 처리.
  // (예전 fallback 패턴 유지: insert 실패 시 옵션 필드 제거하고 재시도)
  function safeData(data: Record<string, unknown>) {
    const {
      tag,
      repeat,
      sort_order,
      shared_with,
      shared_accepted_by,
      series_id,
      ...rest
    } = data;
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

  const invalidate = useCallback(
    () => invalidateCalendarEvents(queryClient, currentUserId),
    [queryClient, currentUserId],
  );

  const addEvent = useCallback(
    async (
      event: Omit<CalendarEvent, "id" | "created_at"> & {
        shared_with?: string[] | null;
      },
    ) => {
      const payload = { ...event, user_id: currentUserId };
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
        if (!retryError) invalidate();
        return { error: retryError };
      }
      invalidate();
      return { error: null };
    },
    [currentUserId, invalidate],
  );

  const addEventsBulk = useCallback(
    async (
      eventsToAdd: (Omit<CalendarEvent, "id" | "created_at"> & {
        shared_with?: string[] | null;
      })[],
    ) => {
      if (eventsToAdd.length === 0) return { error: null };
      const payloads = eventsToAdd.map((ev) =>
        safeData({ ...ev, user_id: currentUserId } as Record<string, unknown>),
      );
      const { error } = await supabase
        .from("calendar_events")
        .insert(payloads);
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
        if (!retryError) invalidate();
        return { error: retryError };
      }
      invalidate();
      return { error: null };
    },
    [currentUserId, invalidate],
  );

  const updateEvent = useCallback(
    async (
      id: string,
      updates: Partial<Omit<CalendarEvent, "id" | "created_at">> & {
        shared_with?: string[] | null;
      },
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
        if (!retryError) invalidate();
        return { error: retryError };
      }
      invalidate();
      return { error: null };
    },
    [invalidate],
  );

  const deleteEvent = useCallback(
    async (id: string) => {
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
        const { data: travelMatches } = await supabase
          .from("travel_items")
          .select("id, visited_dates")
          .eq("title", ev.title)
          .contains("visited_dates", [ev.start_date])
          .limit(50);

        if (travelMatches && travelMatches.length > 0) {
          await Promise.all(
            (
              travelMatches as { id: string; visited_dates: string[] | null }[]
            ).map((item) => {
              const next = (item.visited_dates ?? []).filter(
                (d) => d !== ev.start_date,
              );
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

      if (!error) invalidate();
      return { error };
    },
    [invalidate],
  );

  const updateEventSeries = useCallback(
    async (
      anchor: CalendarEvent,
      scope: "one" | "following" | "all",
      updates: Partial<Omit<CalendarEvent, "id" | "created_at">> & {
        shared_with?: string[] | null;
      },
    ) => {
      if (scope === "one" || !anchor.series_id) {
        return updateEvent(anchor.id, updates);
      }
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
      if (!error) invalidate();
      return { error };
    },
    [invalidate, updateEvent],
  );

  const deleteEventSeries = useCallback(
    async (anchor: CalendarEvent, scope: "one" | "following" | "all") => {
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
      if (!error) invalidate();
      return { error };
    },
    [invalidate, deleteEvent],
  );

  const batchUpdateSortOrder = useCallback(
    async (ids: string[]) => {
      await Promise.all(
        ids.map((id, i) =>
          supabase
            .from("calendar_events")
            .update({ sort_order: i })
            .eq("id", id),
        ),
      );
      invalidate();
    },
    [invalidate],
  );

  return {
    events: queryResult.data ?? [],
    // 캐시 hit 인 경우 isPending=false, 즉시 데이터 표시 → 깜빡임 없음.
    // enabled=false 인 동안은 의미 없으므로 false 로 통일.
    loading: enabled && queryResult.isPending,
    addEvent,
    addEventsBulk,
    updateEvent,
    updateEventSeries,
    deleteEventSeries,
    deleteEvent,
    batchUpdateSortOrder,
    refetch: () => queryResult.refetch(),
  };
}
