"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCurrentUserId } from "@/lib/current-user";
import { getSessionCache, setSessionCache } from "@/lib/session-cache";
import type { KnowledgeItem } from "@/types";

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

export function useKnowledgeItems(folderId: string | null) {
  const userId = useCurrentUserId();
  const cacheKey = useMemo(
    () => `knowledge-items:${folderId ?? "all"}`,
    [folderId],
  );

  const [items, setItems] = useState<KnowledgeItem[]>(
    () => getSessionCache<KnowledgeItem[]>(cacheKey) ?? [],
  );
  const [loading, setLoading] = useState(
    () => getSessionCache<KnowledgeItem[]>(cacheKey) === null,
  );

  const fetchItems = useCallback(async () => {
    let query = supabase
      .from("knowledge_items")
      .select("*")
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false });
    if (folderId) query = query.eq("folder_id", folderId);
    const { data, error } = await query;
    if (!error && data) {
      setItems(data as KnowledgeItem[]);
      setSessionCache(cacheKey, data);
    }
    setLoading(false);
  }, [folderId, cacheKey]);

  useEffect(() => {
    const cached = getSessionCache<KnowledgeItem[]>(cacheKey);
    if (cached) {
      setItems(cached);
      setLoading(false);
    } else {
      setItems([]);
      setLoading(true);
    }
  }, [cacheKey]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const addItem = async (
    item: Omit<KnowledgeItem, "id" | "created_at" | "updated_at">
  ) => {
    if (!userId) return { data: null, error: "로그인이 필요합니다" };
    const { data, error } = await supabase
      .from("knowledge_items")
      .insert({
        ...item,
        excerpt: item.content ? stripHtml(item.content).slice(0, 200) || null : null,
        user_id: userId,
      })
      .select()
      .single();
    if (!error) await fetchItems();
    return { data: data as KnowledgeItem | null, error };
  };

  const updateItem = async (id: string, updates: Partial<KnowledgeItem>) => {
    const patch: Partial<KnowledgeItem> = {
      ...updates,
      updated_at: new Date().toISOString(),
    };
    if (updates.content !== undefined) {
      const plain = updates.content ? stripHtml(updates.content) : "";
      patch.excerpt = plain ? plain.slice(0, 200) : null;
    }
    const { error } = await supabase
      .from("knowledge_items")
      .update(patch)
      .eq("id", id);
    if (!error) await fetchItems();
    return { error };
  };

  const deleteItem = async (id: string) => {
    const { error } = await supabase
      .from("knowledge_items")
      .delete()
      .eq("id", id);
    if (!error) await fetchItems();
    return { error };
  };

  /**
   * 즐겨찾기 토글 — optimistic 업데이트.
   * 일반 updateItem 처럼 await fetchItems 로 round-trip 하면 모바일에서 별 아이콘이
   * 한 박자 늦게 반응. 로컬 상태부터 바꾸고, 서버 실패 시 롤백.
   */
  const togglePin = async (id: string, currentPinned: boolean) => {
    const next = !currentPinned;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, pinned: next, updated_at: now } : it)));
    const { error } = await supabase
      .from("knowledge_items")
      .update({ pinned: next, updated_at: now })
      .eq("id", id);
    if (error) {
      // 롤백
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, pinned: currentPinned } : it)));
    }
    return { error };
  };

  return {
    items,
    loading,
    addItem,
    updateItem,
    deleteItem,
    togglePin,
    refetch: fetchItems,
  };
}

export async function searchKnowledge(query: string): Promise<KnowledgeItem[]> {
  if (!query.trim()) return [];
  const q = query.trim();
  const { data, error } = await supabase
    .from("knowledge_items")
    .select("*")
    .or(`title.ilike.%${q}%,content.ilike.%${q}%`)
    .order("updated_at", { ascending: false })
    .limit(30);
  if (error || !data) return [];
  return data as KnowledgeItem[];
}
