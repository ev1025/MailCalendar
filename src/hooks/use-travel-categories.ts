"use client";

import { useCallback, useMemo } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCurrentUserId } from "@/lib/current-user";

interface TravelCategoryRow {
  id: string;
  name: string;
  color: string;
  is_builtin: boolean;
  sort_order?: number;
}

const DEFAULT_SEED: { name: string; color: string; sort_order: number }[] = [
  { name: "자연", color: "#22C55E", sort_order: 0 },
  { name: "숙소", color: "#A855F7", sort_order: 1 },
  { name: "식당", color: "#F50B0B", sort_order: 2 },
  { name: "놀거리", color: "#3B82F6", sort_order: 3 },
  { name: "데이트", color: "#EC4899", sort_order: 4 },
  { name: "공연", color: "#E1D04E", sort_order: 5 },
  { name: "쇼핑", color: "#06B6D4", sort_order: 6 },
];

export const BUILTIN_TRAVEL_CATEGORIES = DEFAULT_SEED.map((s) => s.name);
export const BUILTIN_TRAVEL_CATEGORY_COLORS: Record<string, string> =
  Object.fromEntries(DEFAULT_SEED.map((s) => [s.name, s.color]));

const STALE_TIME = 30 * 60 * 1000;
const GC_TIME = 24 * 60 * 60 * 1000;

export function travelCategoriesQueryKey(
  userId: string | null | undefined,
) {
  return ["travel-categories", userId ?? ""] as const;
}

async function fetchRows(
  userId: string | null | undefined,
): Promise<TravelCategoryRow[]> {
  if (!userId) return [];
  const { data } = await supabase
    .from("travel_categories")
    .select("id, name, color, is_builtin, sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (!data || data.length === 0) {
    await supabase
      .from("travel_categories")
      .insert(
        DEFAULT_SEED.map((s) => ({
          ...s,
          user_id: userId,
          is_builtin: true,
        })),
      );
    const retry = await supabase
      .from("travel_categories")
      .select("id, name, color, is_builtin, sort_order")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true });
    return ((retry.data as TravelCategoryRow[]) ?? []);
  }
  return data as TravelCategoryRow[];
}

function invalidate(qc: QueryClient, userId: string | null | undefined) {
  qc.invalidateQueries({ queryKey: travelCategoriesQueryKey(userId) });
}

export function useTravelCategories() {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => travelCategoriesQueryKey(userId),
    [userId],
  );

  const rowsQuery = useQuery<TravelCategoryRow[]>({
    queryKey,
    queryFn: () => fetchRows(userId),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

  const rows = rowsQuery.data ?? [];
  const inv = useCallback(
    () => invalidate(queryClient, userId),
    [queryClient, userId],
  );

  const categories: string[] = rows.map((r) => r.name);
  const colors: Record<string, string> = Object.fromEntries(
    rows.map((r) => [r.name, r.color]),
  );

  const addCategory = useCallback(
    async (name: string, color?: string) => {
      const trimmed = name.trim();
      if (!trimmed) return { error: "empty" };
      if (!userId) return { error: "no user" };
      if (rows.some((r) => r.name === trimmed)) return { error: null };
      const maxOrder = rows.reduce(
        (m, r) => Math.max(m, r.sort_order ?? 0),
        -1,
      );
      const { error } = await supabase.from("travel_categories").insert({
        user_id: userId,
        name: trimmed,
        color: color || "#6B7280",
        is_builtin: false,
        sort_order: maxOrder + 1,
      });
      if (!error) inv();
      return { error };
    },
    [userId, rows, inv],
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      const target = rows.find((r) => r.id === id || r.name === id);
      if (!target) return { error: "not found" };
      if (target.is_builtin) return { error: "builtin" };
      const { error } = await supabase
        .from("travel_categories")
        .delete()
        .eq("id", target.id);
      if (!error) inv();
      return { error };
    },
    [rows, inv],
  );

  const updateCategoryColor = useCallback(
    async (id: string, color: string) => {
      const target = rows.find((r) => r.id === id || r.name === id);
      if (!target) return { error: "not found" };
      queryClient.setQueryData<TravelCategoryRow[]>(queryKey, (prev) =>
        (prev ?? []).map((r) =>
          r.id === target.id ? { ...r, color } : r,
        ),
      );
      const { error } = await supabase
        .from("travel_categories")
        .update({ color })
        .eq("id", target.id);
      if (error) inv();
      return { error };
    },
    [rows, queryClient, queryKey, inv],
  );

  const updateCategoryName = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return { error: "empty" };
      const target = rows.find((r) => r.id === id || r.name === id);
      if (!target) return { error: "not found" };
      if (trimmed === target.name) return { error: null };
      if (target.is_builtin) return { error: "builtin" };
      const { error } = await supabase
        .from("travel_categories")
        .update({ name: trimmed })
        .eq("id", target.id);
      if (!error) inv();
      return { error };
    },
    [rows, inv],
  );

  return {
    categories,
    colors,
    addCategory,
    deleteCategory,
    updateCategoryColor,
    updateCategoryName,
  };
}
