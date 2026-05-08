"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCurrentUserId } from "@/lib/current-user";

export interface AppNotification {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

const STALE_TIME = 30 * 1000;
const GC_TIME = 24 * 60 * 60 * 1000;

export function notificationsQueryKey(userId: string | null | undefined) {
  return ["notifications", userId ?? ""] as const;
}

async function fetchNotifications(
  userId: string | null | undefined,
): Promise<AppNotification[]> {
  if (!userId) return [];
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  return ((data as AppNotification[]) ?? []);
}

function invalidate(qc: QueryClient, userId: string | null | undefined) {
  qc.invalidateQueries({ queryKey: notificationsQueryKey(userId) });
}

export function useNotifications() {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => notificationsQueryKey(userId),
    [userId],
  );

  const notifQuery = useQuery<AppNotification[]>({
    queryKey,
    queryFn: () => fetchNotifications(userId),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    enabled: !!userId,
  });

  // Realtime — notifications 테이블 변경 시 invalidate.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => invalidate(queryClient, userId),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  const notifications = notifQuery.data ?? [];
  const unreadCount = notifications.filter((n) => !n.read).length;
  const inv = useCallback(
    () => invalidate(queryClient, userId),
    [queryClient, userId],
  );

  const markAsRead = useCallback(
    async (id: string) => {
      await supabase
        .from("notifications")
        .update({ read: true })
        .eq("id", id);
      inv();
    },
    [inv],
  );

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false);
    inv();
  }, [userId, inv]);

  return {
    notifications,
    unreadCount,
    loading: !!userId && notifQuery.data === undefined,
    markAsRead,
    markAllRead,
    refetch: () => notifQuery.refetch(),
  };
}

export async function notifyUsers(
  userIds: string[],
  actorId: string | null,
  type: string,
  title: string,
  body?: string,
  link?: string,
) {
  if (!userIds.length) return;
  const rows = userIds
    .filter((id) => id !== actorId)
    .map((uid) => ({
      user_id: uid,
      actor_id: actorId,
      type,
      title,
      body: body || null,
      link: link || null,
    }));
  if (!rows.length) return;
  await supabase.from("notifications").insert(rows);
}
