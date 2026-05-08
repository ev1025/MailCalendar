"use client";

import { useCallback, useMemo } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCurrentUserId } from "@/lib/current-user";
import type { TravelTag } from "@/types";

const STALE_TIME = 10 * 60 * 1000;
const GC_TIME = 24 * 60 * 60 * 1000;

export function travelTagsQueryKey(idsKey: string) {
  return ["travel-tags", idsKey] as const;
}

async function fetchTags(
  userId: string | null | undefined,
  visibleUserIds?: string[],
): Promise<TravelTag[]> {
  let query = supabase.from("travel_tags").select("*").order("name");
  if (visibleUserIds && visibleUserIds.length > 0) {
    query = query.in("user_id", visibleUserIds);
  } else if (userId) {
    query = query.eq("user_id", userId);
  }
  const { data } = await query;
  return ((data as TravelTag[]) ?? []);
}

function invalidateAll(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["travel-tags"] });
}

export function useTravelTags(visibleUserIds?: string[]) {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();
  const idsKey =
    visibleUserIds && visibleUserIds.length > 0
      ? [...visibleUserIds].sort().join(",")
      : userId ?? "";
  const queryKey = useMemo(() => travelTagsQueryKey(idsKey), [idsKey]);

  const tagsQuery = useQuery<TravelTag[]>({
    queryKey,
    queryFn: () => fetchTags(userId, visibleUserIds),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

  const tags = tagsQuery.data ?? [];
  const inv = useCallback(() => invalidateAll(queryClient), [queryClient]);

  const addTag = useCallback(
    async (name: string, color: string) => {
      if (!userId) return { error: "로그인이 필요합니다" };
      const { error } = await supabase
        .from("travel_tags")
        .insert({ name: name.trim(), color, user_id: userId });
      if (!error) inv();
      return { error };
    },
    [userId, inv],
  );

  const deleteTag = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("travel_tags")
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
        .from("travel_tags")
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
        .from("travel_tags")
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
