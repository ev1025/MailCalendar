"use client";

import { useCallback, useMemo } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCurrentUserId } from "@/lib/current-user";
import { stripHtml } from "@/lib/sanitize";
import type { KnowledgeItem } from "@/types";

const STALE_TIME = 5 * 60 * 1000;
const GC_TIME = 24 * 60 * 60 * 1000;

export function knowledgeItemsQueryKey(folderId: string | null) {
  return ["knowledge-items", folderId ?? "all"] as const;
}

async function fetchItems(
  folderId: string | null,
): Promise<KnowledgeItem[]> {
  let query = supabase
    .from("knowledge_items")
    .select("*")
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false });
  if (folderId) query = query.eq("folder_id", folderId);
  const { data, error } = await query;
  if (error) return [];
  return ((data as KnowledgeItem[]) ?? []);
}

function invalidateAll(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["knowledge-items"] });
}

export function useKnowledgeItems(folderId: string | null) {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => knowledgeItemsQueryKey(folderId),
    [folderId],
  );

  const itemsQuery = useQuery<KnowledgeItem[]>({
    queryKey,
    queryFn: () => fetchItems(folderId),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

  const items = itemsQuery.data ?? [];
  const inv = useCallback(() => invalidateAll(queryClient), [queryClient]);

  const addItem = useCallback(
    async (item: Omit<KnowledgeItem, "id" | "created_at" | "updated_at">) => {
      if (!userId) return { data: null, error: "로그인이 필요합니다" };
      const { data, error } = await supabase
        .from("knowledge_items")
        .insert({
          ...item,
          excerpt: item.content
            ? stripHtml(item.content).slice(0, 200) || null
            : null,
          user_id: userId,
        })
        .select()
        .single();
      if (!error) inv();
      return { data: data as KnowledgeItem | null, error };
    },
    [userId, inv],
  );

  const updateItem = useCallback(
    async (id: string, updates: Partial<KnowledgeItem>) => {
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
      if (!error) inv();
      return { error };
    },
    [inv],
  );

  const deleteItem = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("knowledge_items")
        .delete()
        .eq("id", id);
      if (!error) inv();
      return { error };
    },
    [inv],
  );

  /**
   * 즐겨찾기 토글 — optimistic 업데이트.
   * 별 아이콘 즉각 반응 우선. 서버 실패 시 invalidate 로 진실값 동기화.
   */
  const togglePin = useCallback(
    async (id: string, currentPinned: boolean) => {
      const next = !currentPinned;
      const now = new Date().toISOString();
      queryClient.setQueryData<KnowledgeItem[]>(queryKey, (prev) =>
        (prev ?? []).map((it) =>
          it.id === id ? { ...it, pinned: next, updated_at: now } : it,
        ),
      );
      const { error } = await supabase
        .from("knowledge_items")
        .update({ pinned: next, updated_at: now })
        .eq("id", id);
      if (error) inv();
      return { error };
    },
    [queryClient, queryKey, inv],
  );

  return {
    items,
    loading: itemsQuery.isPending,
    addItem,
    updateItem,
    deleteItem,
    togglePin,
    refetch: () => itemsQuery.refetch(),
  };
}

export async function searchKnowledge(
  query: string,
): Promise<KnowledgeItem[]> {
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
