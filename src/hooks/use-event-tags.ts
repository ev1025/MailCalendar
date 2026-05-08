"use client";

import { useCallback, useMemo } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { EventTag } from "@/types";
import { useCurrentUserId } from "@/lib/current-user";

const STALE_TIME = 10 * 60 * 1000;
const GC_TIME = 24 * 60 * 60 * 1000;

export function eventTagsQueryKey(idsKey: string) {
  return ["event-tags", idsKey] as const;
}

async function fetchEventTags(
  userId: string | null | undefined,
  visibleUserIds?: string[],
): Promise<EventTag[]> {
  let query = supabase.from("event_tags").select("*").order("name");
  if (visibleUserIds && visibleUserIds.length > 0) {
    query = query.in("user_id", visibleUserIds);
  } else if (userId) {
    query = query.eq("user_id", userId);
  }
  const { data, error } = await query;
  if (error) {
    const fallback = await supabase
      .from("event_tags")
      .select("*")
      .order("name");
    return ((fallback.data as EventTag[]) ?? []);
  }
  return ((data as EventTag[]) ?? []);
}

function invalidateAll(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["event-tags"] });
}

/**
 * 일정 태그 훅.
 * visibleUserIds 를 넘기면 그 사용자들 (보통 "내" + "공유받은 owner") 의 태그 모두 조회.
 * RLS 가 "Read own or shared" 로 열려 있어야 (supabase-rls-event-tags-shared.sql) 정상 동작.
 */
export function useEventTags(visibleUserIds?: string[]) {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();
  const idsKey =
    visibleUserIds && visibleUserIds.length > 0
      ? [...visibleUserIds].sort().join(",")
      : userId ?? "";
  const queryKey = useMemo(() => eventTagsQueryKey(idsKey), [idsKey]);

  const tagsQuery = useQuery<EventTag[]>({
    queryKey,
    queryFn: () => fetchEventTags(userId, visibleUserIds),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

  const tags = tagsQuery.data ?? [];
  const inv = useCallback(() => invalidateAll(queryClient), [queryClient]);

  const addTag = useCallback(
    async (name: string, color: string) => {
      const { error } = await supabase
        .from("event_tags")
        .insert({ name: name.trim(), color, user_id: userId });
      if (error) {
        const retry = await supabase
          .from("event_tags")
          .insert({ name: name.trim(), color });
        if (!retry.error) inv();
        return { error: retry.error };
      }
      inv();
      return { error: null };
    },
    [userId, inv],
  );

  const deleteTag = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("event_tags")
        .delete()
        .eq("id", id);
      if (!error) inv();
      return { error };
    },
    [inv],
  );

  const updateTagColor = useCallback(
    async (id: string, color: string) => {
      const { error } = await supabase
        .from("event_tags")
        .update({ color })
        .eq("id", id);
      if (!error) inv();
      return { error };
    },
    [inv],
  );

  const updateTagName = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return { error: "empty" };
      const { error } = await supabase
        .from("event_tags")
        .update({ name: trimmed })
        .eq("id", id);
      if (!error) inv();
      return { error };
    },
    [inv],
  );

  return {
    tags,
    addTag,
    deleteTag,
    updateTagColor,
    updateTagName,
    refetch: () => tagsQuery.refetch(),
  };
}
