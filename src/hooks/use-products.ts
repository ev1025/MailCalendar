"use client";

import { useCallback, useMemo } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Product } from "@/types";
import { useCurrentUserId } from "@/lib/current-user";

const STALE_TIME = 5 * 60 * 1000;
const GC_TIME = 24 * 60 * 60 * 1000;

export function productsQueryKey(userId: string | null | undefined) {
  return ["products", userId ?? ""] as const;
}

async function fetchProducts(
  userId: string | null | undefined,
): Promise<Product[]> {
  let query = supabase
    .from("products")
    .select("*")
    .order("is_active", { ascending: false })
    .order("category")
    .order("sub_category")
    .order("sort_order")
    .order("name");
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query;
  if (error) {
    const fallback = await supabase
      .from("products")
      .select("*")
      .order("is_active", { ascending: false })
      .order("category")
      .order("name");
    return ((fallback.data as Product[]) ?? []);
  }
  return ((data as Product[]) ?? []);
}

function invalidateProducts(qc: QueryClient, userId: string | null | undefined) {
  qc.invalidateQueries({ queryKey: productsQueryKey(userId) });
}

export function useProducts() {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => productsQueryKey(userId), [userId]);

  const productsQuery = useQuery<Product[]>({
    queryKey,
    queryFn: () => fetchProducts(userId),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

  const invalidate = useCallback(
    () => invalidateProducts(queryClient, userId),
    [queryClient, userId],
  );

  const addProduct = useCallback(
    async (item: Omit<Product, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase
        .from("products")
        .insert({ ...item, user_id: userId })
        .select()
        .single();
      if (error) {
        const retry = await supabase
          .from("products")
          .insert(item)
          .select()
          .single();
        if (!retry.error) invalidate();
        return { data: retry.data as Product | null, error: retry.error };
      }
      invalidate();
      return { data: data as Product | null, error: null };
    },
    [userId, invalidate],
  );

  const updateProduct = useCallback(
    async (id: string, updates: Partial<Product>) => {
      const { error } = await supabase
        .from("products")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (!error) invalidate();
      return { error };
    },
    [invalidate],
  );

  const deleteProduct = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", id);
      if (!error) invalidate();
      return { error };
    },
    [invalidate],
  );

  const batchUpdateSortOrder = useCallback(
    async (ids: string[]) => {
      await Promise.all(
        ids.map((id, i) =>
          supabase.from("products").update({ sort_order: i }).eq("id", id),
        ),
      );
      invalidate();
    },
    [invalidate],
  );

  return {
    products: productsQuery.data ?? [],
    loading: productsQuery.isPending,
    addProduct,
    updateProduct,
    deleteProduct,
    batchUpdateSortOrder,
    refetch: () => productsQuery.refetch(),
  };
}
