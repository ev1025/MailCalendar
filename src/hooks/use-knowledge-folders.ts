"use client";

import { useCallback } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCurrentUserId } from "@/lib/current-user";
import type { KnowledgeFolder } from "@/types";

const STALE_TIME = 10 * 60 * 1000;
const GC_TIME = 24 * 60 * 60 * 1000;

export const KNOWLEDGE_FOLDERS_KEY = ["knowledge-folders"] as const;

async function fetchFolders(): Promise<KnowledgeFolder[]> {
  const { data, error } = await supabase
    .from("knowledge_folders")
    .select("*")
    .order("sort_order")
    .order("name");
  if (error) return [];
  return ((data as KnowledgeFolder[]) ?? []);
}

function invalidate(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: KNOWLEDGE_FOLDERS_KEY });
}

export function useKnowledgeFolders() {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();

  const foldersQuery = useQuery<KnowledgeFolder[]>({
    queryKey: KNOWLEDGE_FOLDERS_KEY,
    queryFn: fetchFolders,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

  const folders = foldersQuery.data ?? [];
  const inv = useCallback(() => invalidate(queryClient), [queryClient]);

  const addFolder = useCallback(
    async (name: string, icon?: string, parentId?: string | null) => {
      if (!userId) return { data: null, error: "로그인이 필요합니다" };
      const { data, error } = await supabase
        .from("knowledge_folders")
        .insert({
          name,
          icon: icon || null,
          parent_id: parentId || null,
          sort_order: folders.length,
          user_id: userId,
        })
        .select()
        .single();
      if (!error) inv();
      return { data: data as KnowledgeFolder | null, error };
    },
    [userId, folders.length, inv],
  );

  const updateFolder = useCallback(
    async (id: string, updates: Partial<KnowledgeFolder>) => {
      const { error } = await supabase
        .from("knowledge_folders")
        .update(updates)
        .eq("id", id);
      if (!error) inv();
      return { error };
    },
    [inv],
  );

  const deleteFolder = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("knowledge_folders")
        .delete()
        .eq("id", id);
      if (!error) inv();
      return { error };
    },
    [inv],
  );

  const reorderFolders = useCallback(
    async (ids: string[]) => {
      await Promise.all(
        ids.map((id, i) =>
          supabase
            .from("knowledge_folders")
            .update({ sort_order: i })
            .eq("id", id),
        ),
      );
      inv();
    },
    [inv],
  );

  return {
    folders,
    loading: foldersQuery.isPending,
    addFolder,
    updateFolder,
    deleteFolder,
    reorderFolders,
    refetch: () => foldersQuery.refetch(),
  };
}
