"use client";

import { useCallback, useMemo } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { TravelItem } from "@/types";
import { useCurrentUserId } from "@/lib/current-user";

const STALE_TIME = 5 * 60 * 1000;
const GC_TIME = 24 * 60 * 60 * 1000;

export function travelItemsQueryKey(
  userId: string | null | undefined,
  visibleUserIds?: string[],
) {
  return [
    "travel-items",
    userId ?? "",
    [...(visibleUserIds ?? [])].sort().join(","),
  ] as const;
}

async function fetchTravelItems(
  userId: string | null | undefined,
  visibleUserIds?: string[],
): Promise<TravelItem[]> {
  let query = supabase
    .from("travel_items")
    .select("*")
    .order("visited")
    .order("created_at", { ascending: false });
  const filterIds =
    visibleUserIds && visibleUserIds.length > 0
      ? visibleUserIds
      : userId
        ? [userId]
        : [];
  if (filterIds.length > 0) query = query.in("user_id", filterIds);
  const { data, error } = await query;
  if (error) {
    const fallback = await supabase
      .from("travel_items")
      .select("*")
      .order("visited")
      .order("created_at", { ascending: false });
    return ((fallback.data as TravelItem[]) ?? []);
  }
  return ((data as TravelItem[]) ?? []);
}

function invalidateTravelItems(
  qc: QueryClient,
  userId: string | null | undefined,
) {
  qc.invalidateQueries({ queryKey: ["travel-items", userId ?? ""] });
}

/**
 * visibleUserIds: 달력 탭에서 선택한 "볼 사용자들"
 *  - 전달 시 해당 사용자들의 여행 항목만 조회 (공유된 여행 포함)
 *  - 생략 시 내 항목만
 */
export function useTravelItems(visibleUserIds?: string[]) {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();

  // visibleUserIds 배열 참조가 매 렌더 바뀌어도 내용 같으면 queryKey 안정 (재패칭 방지).
  const visibleKey = useMemo(
    () => (visibleUserIds ?? []).slice().sort().join(","),
    [visibleUserIds],
  );
  const queryKey = useMemo(
    () => travelItemsQueryKey(userId, visibleUserIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, visibleKey],
  );

  const itemsQuery = useQuery<TravelItem[]>({
    queryKey,
    queryFn: () => fetchTravelItems(userId, visibleUserIds),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

  const items = itemsQuery.data ?? [];
  const invalidate = useCallback(
    () => invalidateTravelItems(queryClient, userId),
    [queryClient, userId],
  );

  // optimistic 캐시 업데이트 헬퍼.
  const optimisticUpdate = useCallback(
    (next: TravelItem[]) => {
      queryClient.setQueryData<TravelItem[]>(queryKey, next);
    },
    [queryClient, queryKey],
  );

  const addItem = useCallback(
    async (item: Omit<TravelItem, "id" | "created_at" | "updated_at">) => {
      if (!userId) {
        return {
          error: {
            message:
              "로그인 정보가 없습니다. 새로고침 후 다시 시도하세요.",
          },
        };
      }
      const { error } = await supabase
        .from("travel_items")
        .insert({ ...item, user_id: userId });
      if (!error) {
        invalidate();
        return { error: null };
      }
      const {
        month,
        color,
        visited_dates,
        place_name,
        address,
        lat,
        lng,
        places,
        ...rest
      } = item;
      void month;
      void color;
      void visited_dates;
      void place_name;
      void address;
      void lat;
      void lng;
      void places;
      const { error: retry } = await supabase
        .from("travel_items")
        .insert({ ...rest, user_id: userId });
      if (!retry) invalidate();
      return { error: retry };
    },
    [userId, invalidate],
  );

  const updateItem = useCallback(
    async (
      id: string,
      updates: Partial<Omit<TravelItem, "id" | "created_at">>,
    ) => {
      const now = new Date().toISOString();
      const prev = items;
      optimisticUpdate(
        prev.map((it) =>
          it.id === id ? { ...it, ...updates, updated_at: now } : it,
        ),
      );
      const { error } = await supabase
        .from("travel_items")
        .update({ ...updates, updated_at: now })
        .eq("id", id);
      if (error) {
        const {
          month,
          color,
          visited_dates,
          place_name,
          address,
          lat,
          lng,
          mood,
          price_tier,
          rating,
          couple_notes,
          cover_image_url,
          places,
          ...rest
        } = updates;
        void month;
        void color;
        void visited_dates;
        void place_name;
        void address;
        void lat;
        void lng;
        void mood;
        void price_tier;
        void rating;
        void couple_notes;
        void cover_image_url;
        void places;
        const { error: retry } = await supabase
          .from("travel_items")
          .update({ ...rest, updated_at: now })
          .eq("id", id);
        if (retry) {
          optimisticUpdate(prev);
        } else {
          invalidate();
        }
        return { error: retry };
      }
      return { error: null };
    },
    [items, optimisticUpdate, invalidate],
  );

  const deleteItem = useCallback(
    async (id: string) => {
      const prev = items;
      optimisticUpdate(prev.filter((it) => it.id !== id));
      const { error } = await supabase
        .from("travel_items")
        .delete()
        .eq("id", id);
      if (error) optimisticUpdate(prev);
      else invalidate();
      return { error };
    },
    [items, optimisticUpdate, invalidate],
  );

  const toggleVisited = useCallback(
    async (id: string, visited: boolean) => {
      const next = !visited;
      const now = new Date().toISOString();
      const prev = items;
      optimisticUpdate(
        prev.map((it) =>
          it.id === id ? { ...it, visited: next, updated_at: now } : it,
        ),
      );
      const { error } = await supabase
        .from("travel_items")
        .update({ visited: next, updated_at: now })
        .eq("id", id);
      if (error) invalidate();
      return { error };
    },
    [items, optimisticUpdate, invalidate],
  );

  return {
    items,
    loading: itemsQuery.isPending,
    addItem,
    updateItem,
    deleteItem,
    toggleVisited,
    refetch: () => itemsQuery.refetch(),
  };
}
