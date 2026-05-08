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

const STALE_TIME = 5 * 60 * 1000;
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
  });

  const shares = sharesQuery.data ?? [];

  // Realtime — calendar_shares 테이블 변경 시 invalidate.
  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel(`calendar-shares:${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calendar_shares" },
        () => invalidate(queryClient, currentUserId),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, queryClient]);

  const inv = useCallback(
    () => invalidate(queryClient, currentUserId),
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

  const viewableUserIds = useMemo(
    () =>
      Array.from(
        new Set([
          ...(currentUserId ? [currentUserId] : []),
          ...incoming
            .filter((s) => s.status === "accepted")
            .map((s) => s.owner_id),
        ]),
      ),
    [incoming, currentUserId],
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

      inv();
      return { error: null };
    },
    [currentUserId, outgoing, users, inv],
  );

  const accept = useCallback(
    async (shareId: string) => {
      const { error } = await supabase
        .from("calendar_shares")
        .update({ status: "accepted" })
        .eq("id", shareId);
      if (!error) inv();
      return { error };
    },
    [inv],
  );

  const reject = useCallback(
    async (shareId: string) => {
      const { error } = await supabase
        .from("calendar_shares")
        .update({ status: "rejected" })
        .eq("id", shareId);
      if (!error) inv();
      return { error };
    },
    [inv],
  );

  const cancel = useCallback(
    async (shareId: string) => {
      const { error } = await supabase
        .from("calendar_shares")
        .delete()
        .eq("id", shareId);
      if (!error) inv();
      return { error };
    },
    [inv],
  );

  return {
    shares,
    outgoing,
    incoming,
    viewableUserIds,
    loading: !!currentUserId && sharesQuery.data === undefined,
    invite,
    accept,
    reject,
    cancel,
    refetch: () => sharesQuery.refetch(),
  };
}
