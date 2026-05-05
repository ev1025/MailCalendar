"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCurrentUserId } from "@/lib/current-user";
import { getSessionCache, setSessionCache } from "@/lib/session-cache";
import type { ProductPurchase } from "@/types";

export function useProductPurchases(productId: string | null) {
  const userId = useCurrentUserId();
  const cacheKey = useMemo(
    () => (productId ? `product-purchases:${productId}` : null),
    [productId],
  );

  const [purchases, setPurchases] = useState<ProductPurchase[]>(() =>
    cacheKey ? getSessionCache<ProductPurchase[]>(cacheKey) ?? [] : [],
  );
  const [loading, setLoading] = useState(false);

  const fetchPurchases = useCallback(async () => {
    if (!productId || !cacheKey) {
      setPurchases([]);
      return;
    }
    const { data, error } = await supabase
      .from("product_purchases")
      .select("*")
      .eq("product_id", productId)
      .order("purchased_at", { ascending: false });
    if (!error && data) {
      setPurchases(data as ProductPurchase[]);
      setSessionCache(cacheKey, data);
    }
    setLoading(false);
  }, [productId, cacheKey]);

  useEffect(() => {
    if (!cacheKey) {
      setPurchases([]);
      return;
    }
    const cached = getSessionCache<ProductPurchase[]>(cacheKey);
    if (cached) {
      setPurchases(cached);
      setLoading(false);
    } else {
      setPurchases([]);
      setLoading(true);
    }
  }, [cacheKey]);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  const addPurchase = async (
    item: Omit<ProductPurchase, "id" | "created_at">
  ) => {
    if (!userId) return { error: "로그인이 필요합니다" };
    const { error } = await supabase
      .from("product_purchases")
      .insert({ ...item, user_id: userId });
    if (!error) await fetchPurchases();
    return { error };
  };

  const updatePurchase = async (
    id: string,
    updates: Partial<ProductPurchase>
  ) => {
    const { error } = await supabase
      .from("product_purchases")
      .update(updates)
      .eq("id", id);
    if (!error) await fetchPurchases();
    return { error };
  };

  const deletePurchase = async (id: string) => {
    const { error } = await supabase
      .from("product_purchases")
      .delete()
      .eq("id", id);
    if (!error) await fetchPurchases();
    return { error };
  };

  return {
    purchases,
    loading,
    addPurchase,
    updatePurchase,
    deletePurchase,
    refetch: fetchPurchases,
  };
}

export function computeUnitPrice(p: ProductPurchase): number {
  const q = p.quantity || 1;
  const paid = (p.total_price || 0) - (p.points || 0);
  return q > 0 ? paid / q : 0;
}
