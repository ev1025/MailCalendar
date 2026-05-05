"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Product } from "@/types";
import { useCurrentUserId } from "@/lib/current-user";
import { getSessionCache, setSessionCache } from "@/lib/session-cache";

export function useProducts() {
  const userId = useCurrentUserId();
  const cacheKey = useMemo(() => `products:${userId ?? ""}`, [userId]);

  const [products, setProducts] = useState<Product[]>(
    () => getSessionCache<Product[]>(cacheKey) ?? [],
  );
  const [loading, setLoading] = useState(
    () => getSessionCache<Product[]>(cacheKey) === null,
  );

  const fetchProducts = useCallback(async () => {
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
      // sort_order 컬럼 없는 구 DB 폴백
      const fallback = await supabase
        .from("products")
        .select("*")
        .order("is_active", { ascending: false })
        .order("category")
        .order("name");
      if (fallback.data) {
        setProducts(fallback.data as Product[]);
        setSessionCache(cacheKey, fallback.data);
      }
    } else if (data) {
      setProducts(data as Product[]);
      setSessionCache(cacheKey, data);
    }
    setLoading(false);
  }, [userId, cacheKey]);

  useEffect(() => {
    const cached = getSessionCache<Product[]>(cacheKey);
    if (cached) {
      setProducts(cached);
      setLoading(false);
    } else {
      setProducts([]);
      setLoading(true);
    }
  }, [cacheKey]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const addProduct = async (
    item: Omit<Product, "id" | "created_at" | "updated_at">
  ) => {
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
      if (!retry.error) await fetchProducts();
      return { data: retry.data as Product | null, error: retry.error };
    }
    await fetchProducts();
    return { data: data as Product | null, error: null };
  };

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    const { error } = await supabase
      .from("products")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (!error) await fetchProducts();
    return { error };
  };

  const deleteProduct = async (id: string) => {
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (!error) await fetchProducts();
    return { error };
  };

  /** 그룹 내 드래그 정렬 결과를 sort_order 0..n 으로 일괄 반영. */
  const batchUpdateSortOrder = async (ids: string[]) => {
    await Promise.all(
      ids.map((id, i) =>
        supabase.from("products").update({ sort_order: i }).eq("id", id),
      ),
    );
    await fetchProducts();
  };

  return {
    products,
    loading,
    addProduct,
    updateProduct,
    deleteProduct,
    batchUpdateSortOrder,
    refetch: fetchProducts,
  };
}
