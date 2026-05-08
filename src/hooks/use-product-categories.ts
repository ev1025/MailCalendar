"use client";

import { useCallback, useMemo } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCurrentUserId } from "@/lib/current-user";

/**
 * 생필품 분류 — Supabase product_categories 테이블에서 조회/관리.
 * 빌트인(영양제/화장품/단백질/음식/생필품/구독) + 사용자 추가 분류.
 * 시드는 비어 있으면 첫 fetch 시 자동 INSERT.
 */

export interface ProductCategoryTag {
  id: string;
  name: string;
  color: string;
  is_builtin?: boolean;
  sort_order?: number;
}

const DEFAULT_SEED: { name: string; color: string; sort_order: number }[] = [
  { name: "영양제", color: "#22C55E", sort_order: 0 },
  { name: "화장품", color: "#EC4899", sort_order: 1 },
  { name: "단백질", color: "#F59E0B", sort_order: 2 },
  { name: "음식", color: "#EF4444", sort_order: 3 },
  { name: "생필품", color: "#3B82F6", sort_order: 4 },
  { name: "구독", color: "#8B5CF6", sort_order: 5 },
];

const STALE_TIME = 30 * 60 * 1000; // 카테고리는 자주 바뀌지 않음 — 길게.
const GC_TIME = 24 * 60 * 60 * 1000;

export function productCategoriesQueryKey(userId: string | null | undefined) {
  return ["product-categories", userId ?? ""] as const;
}

async function fetchProductCategories(
  userId: string | null | undefined,
): Promise<ProductCategoryTag[]> {
  if (!userId) return [];
  const { data } = await supabase
    .from("product_categories")
    .select("id, name, color, is_builtin, sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (!data || data.length === 0) {
    await supabase
      .from("product_categories")
      .insert(
        DEFAULT_SEED.map((s) => ({
          ...s,
          user_id: userId,
          is_builtin: true,
        })),
      );
    const retry = await supabase
      .from("product_categories")
      .select("id, name, color, is_builtin, sort_order")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true });
    return ((retry.data as ProductCategoryTag[]) ?? []);
  }
  return data as ProductCategoryTag[];
}

function invalidate(qc: QueryClient, userId: string | null | undefined) {
  qc.invalidateQueries({ queryKey: productCategoriesQueryKey(userId) });
}

export function useProductCategories() {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => productCategoriesQueryKey(userId),
    [userId],
  );

  const tagsQuery = useQuery<ProductCategoryTag[]>({
    queryKey,
    queryFn: () => fetchProductCategories(userId),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

  const tags = tagsQuery.data ?? [];
  const inv = useCallback(
    () => invalidate(queryClient, userId),
    [queryClient, userId],
  );

  const categories: string[] = tags.map((t) => t.name);

  const addCategory = useCallback(
    async (name: string, color?: string) => {
      const trimmed = name.trim();
      if (!trimmed) return { error: null };
      if (!userId) return { error: "no user" };
      if (tags.some((t) => t.name === trimmed)) return { error: null };
      const maxOrder = tags.reduce(
        (m, t) => Math.max(m, t.sort_order ?? 0),
        -1,
      );
      const { error } = await supabase.from("product_categories").insert({
        user_id: userId,
        name: trimmed,
        color: color || "#6B7280",
        is_builtin: false,
        sort_order: maxOrder + 1,
      });
      if (!error) inv();
      return { error };
    },
    [userId, tags, inv],
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      const target = tags.find((t) => t.id === id || t.name === id);
      if (!target) return { error: "not found" };
      if (target.is_builtin)
        return { error: "기본 분류는 삭제할 수 없습니다" };
      const { error } = await supabase
        .from("product_categories")
        .delete()
        .eq("id", target.id);
      if (!error) inv();
      return { error };
    },
    [tags, inv],
  );

  const updateCategoryColor = useCallback(
    async (id: string, color: string) => {
      const target = tags.find((t) => t.id === id || t.name === id);
      if (!target) return { error: "not found" };
      // optimistic — 캐시에 즉시 반영 후 background 갱신.
      queryClient.setQueryData<ProductCategoryTag[]>(queryKey, (prev) =>
        (prev ?? []).map((t) =>
          t.id === target.id ? { ...t, color } : t,
        ),
      );
      const { error } = await supabase
        .from("product_categories")
        .update({ color })
        .eq("id", target.id);
      if (error) inv();
      return { error };
    },
    [tags, inv, queryClient, queryKey],
  );

  return {
    categories,
    tags: tags.map((t) => ({ id: t.name, name: t.name, color: t.color })),
    addCategory,
    deleteCategory,
    updateCategoryColor,
    customCategories: tags.filter((t) => !t.is_builtin).map((t) => t.name),
    removeCategory: deleteCategory,
  };
}
