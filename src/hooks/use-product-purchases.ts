"use client";

import { useCallback, useMemo } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCurrentUserId } from "@/lib/current-user";
import type { ProductPurchase } from "@/types";

const STALE_TIME = 5 * 60 * 1000;
const GC_TIME = 24 * 60 * 60 * 1000;

export function productPurchasesQueryKey(productId: string | null) {
  return ["product-purchases", productId ?? ""] as const;
}

async function fetchPurchases(
  productId: string | null,
): Promise<ProductPurchase[]> {
  if (!productId) return [];
  const { data, error } = await supabase
    .from("product_purchases")
    .select("*")
    .eq("product_id", productId)
    .order("purchased_at", { ascending: false });
  if (error) return [];
  return ((data as ProductPurchase[]) ?? []);
}

function invalidate(qc: QueryClient, productId: string | null) {
  qc.invalidateQueries({ queryKey: productPurchasesQueryKey(productId) });
}

export function useProductPurchases(productId: string | null) {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => productPurchasesQueryKey(productId),
    [productId],
  );

  const purchasesQuery = useQuery<ProductPurchase[]>({
    queryKey,
    queryFn: () => fetchPurchases(productId),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    enabled: !!productId,
  });

  const inv = useCallback(
    () => invalidate(queryClient, productId),
    [queryClient, productId],
  );

  const addPurchase = useCallback(
    async (item: Omit<ProductPurchase, "id" | "created_at">) => {
      if (!userId) return { error: "로그인이 필요합니다" };
      const { error } = await supabase
        .from("product_purchases")
        .insert({ ...item, user_id: userId });
      if (!error) inv();
      return { error };
    },
    [userId, inv],
  );

  const updatePurchase = useCallback(
    async (id: string, updates: Partial<ProductPurchase>) => {
      const { error } = await supabase
        .from("product_purchases")
        .update(updates)
        .eq("id", id);
      if (!error) inv();
      return { error };
    },
    [inv],
  );

  const deletePurchase = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("product_purchases")
        .delete()
        .eq("id", id);
      if (!error) inv();
      return { error };
    },
    [inv],
  );

  return {
    purchases: purchasesQuery.data ?? [],
    loading: !!productId && purchasesQuery.data === undefined,
    addPurchase,
    updatePurchase,
    deletePurchase,
    refetch: () => purchasesQuery.refetch(),
  };
}

export function computeUnitPrice(p: ProductPurchase): number {
  const q = p.quantity || 1;
  const paid = (p.total_price || 0) - (p.points || 0);
  return q > 0 ? paid / q : 0;
}
