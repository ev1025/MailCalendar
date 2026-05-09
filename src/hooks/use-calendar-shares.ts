"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCurrentUserId, useAppUsers } from "@/lib/current-user";
import { notifyUsers } from "./use-notifications";

export interface CalendarShare {
  id: string;
  owner_id: string;
  viewer_id: string;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
}

// Realtime publication 이 활성 안 된 환경 대비 — 짧은 staleTime 으로 mount/focus
// 시 background fetch 보장. 데이터 자체가 작아서 비용 미미.
const STALE_TIME = 30 * 1000;
const GC_TIME = 24 * 60 * 60 * 1000;

export function calendarSharesQueryKey(
  userId: string | null | undefined,
) {
  return ["calendar-shares", userId ?? ""] as const;
}

async function fetchShares(
  currentUserId: string | null | undefined,
): Promise<CalendarShare[]> {
  if (!currentUserId) return [];
  const { data, error } = await supabase
    .from("calendar_shares")
    .select("*")
    .or(`owner_id.eq.${currentUserId},viewer_id.eq.${currentUserId}`);
  if (error) return [];
  return ((data as CalendarShare[]) ?? []);
}

function invalidate(qc: QueryClient, userId: string | null | undefined) {
  qc.invalidateQueries({ queryKey: calendarSharesQueryKey(userId) });
}

/**
 * share 수락/거절/해제·초대 후 호출. share 변동은 곧 "어떤 user_id 의 데이터를
 * 볼 수 있는지" 가 바뀌는 것이므로 그 user 들의 도메인 캐시도 일괄 invalidate.
 *
 *  - calendar-events: visibleUserIds 가 자동 확장(useVisibleUserIds 가 새 user
 *    추가) → useCalendarEvents 의 queryKey 가 바뀌어 자동 fetch. 단 stale 캐시도
 *    같이 invalidate 해서 잔여 표시 방지.
 *  - event-tags / travel-items / travel-plans: 양방향 공유로 노출되는 데이터.
 *  - notifications: 공유 알림이 새로 들어온 경우 즉시 갱신.
 */
function cascadeInvalidate(qc: QueryClient, userId: string | null | undefined) {
  qc.invalidateQueries({ queryKey: calendarSharesQueryKey(userId) });
  qc.invalidateQueries({ queryKey: ["calendar-events", userId ?? ""] });
  qc.invalidateQueries({ queryKey: ["event-tags"] });
  qc.invalidateQueries({ queryKey: ["travel-items", userId ?? ""] });
  qc.invalidateQueries({ queryKey: ["travel-plans", userId ?? ""] });
  qc.invalidateQueries({ queryKey: ["travel-tags"] });
  qc.invalidateQueries({ queryKey: ["notifications", userId ?? ""] });
  qc.invalidateQueries({ queryKey: ["nav-badges", userId ?? ""] });
  // 공유 수락 시 상대 owner 의 프로필도 즉시 lookup 가능해야 — day-detail 등의
  // 아이콘 표시 race 방지.
  qc.invalidateQueries({ queryKey: ["app-users"] });
}

export function useCalendarShares() {
  const currentUserId = useCurrentUserId();
  const { users } = useAppUsers();
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => calendarSharesQueryKey(currentUserId),
    [currentUserId],
  );

  const sharesQuery = useQuery<CalendarShare[]>({
    queryKey,
    queryFn: () => fetchShares(currentUserId),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    enabled: !!currentUserId,
    // mount 마다 무조건 refetch — Realtime publication 미활성 환경에서도
    // 항상 fresh 한 share 상태 보장. 캐시 hit 으로 즉시 노출은 유지(stale-while-revalidate).
    refetchOnMount: "always",
  });

  const shares = sharesQuery.data ?? [];

  // Realtime — calendar_shares 테이블 변경 시 cascade invalidate.
  // (publication 활성 시 작동. 미활성 환경은 위 refetchOnMount 가 fallback.)
  useEffect(() => {
    if (!currentUserId) return;
    const rid = Math.random().toString(36).slice(2);
    const channel = supabase
      .channel(`calendar-shares:${currentUserId}:${rid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calendar_shares" },
        () => cascadeInvalidate(queryClient, currentUserId),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, queryClient]);

  const cascade = useCallback(
    () => cascadeInvalidate(queryClient, currentUserId),
    [queryClient, currentUserId],
  );

  const outgoing = useMemo(
    () => shares.filter((s) => s.owner_id === currentUserId),
    [shares, currentUserId],
  );
  const incoming = useMemo(
    () => shares.filter((s) => s.viewer_id === currentUserId),
    [shares, currentUserId],
  );

  // 양방향 — RLS 의 shared_user_ids() 와 정합. 한쪽만 수락(accepted) 되어도
  // 양쪽 모두 서로 일정을 볼 수 있어야 함.
  //   - 내가 viewer 인 share 의 owner (incoming.accepted)
  //   - 내가 owner 인 share 의 viewer (outgoing.accepted)
  const viewableUserIds = useMemo(
    () =>
      Array.from(
        new Set([
          ...(currentUserId ? [currentUserId] : []),
          ...incoming
            .filter((s) => s.status === "accepted")
            .map((s) => s.owner_id),
          ...outgoing
            .filter((s) => s.status === "accepted")
            .map((s) => s.viewer_id),
        ]),
      ),
    [incoming, outgoing, currentUserId],
  );

  const invite = useCallback(
    async (viewerId: string) => {
      if (!currentUserId || viewerId === currentUserId)
        return { error: "self" };
      const existing = outgoing.find((s) => s.viewer_id === viewerId);
      if (existing) return { error: "already invited" };
      const { error } = await supabase.from("calendar_shares").insert({
        owner_id: currentUserId,
        viewer_id: viewerId,
        status: "pending",
      });
      if (error) return { error };

      const myName =
        users.find((u) => u.id === currentUserId)?.name || "누군가";
      await notifyUsers(
        [viewerId],
        currentUserId,
        "calendar_share_request",
        `${myName}님이 캘린더를 공유했어요`,
        "수락하면 상대 일정이 내 캘린더에 표시됩니다",
        `/calendar`,
      );

      cascade();
      return { error: null };
    },
    [currentUserId, outgoing, users, cascade],
  );

  const accept = useCallback(
    async (shareId: string) => {
      const { error } = await supabase
        .from("calendar_shares")
        .update({ status: "accepted" })
        .eq("id", shareId);
      if (!error) cascade();
      return { error };
    },
    [cascade],
  );

  const reject = useCallback(
    async (shareId: string) => {
      const { error } = await supabase
        .from("calendar_shares")
        .update({ status: "rejected" })
        .eq("id", shareId);
      if (!error) cascade();
      return { error };
    },
    [cascade],
  );

  const cancel = useCallback(
    async (shareId: string) => {
      const { error } = await supabase
        .from("calendar_shares")
        .delete()
        .eq("id", shareId);
      if (!error) cascade();
      return { error };
    },
    [cascade],
  );

  return {
    shares,
    outgoing,
    incoming,
    viewableUserIds,
    loading: !!currentUserId && sharesQuery.isPending,
    invite,
    accept,
    reject,
    cancel,
    refetch: () => sharesQuery.refetch(),
  };
}
