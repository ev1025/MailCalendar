"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCurrentUserId } from "@/lib/current-user";
import { getSessionCache, setSessionCache } from "@/lib/session-cache";
import type { KnowledgeFolder } from "@/types";

const KF_CACHE_KEY = "knowledge-folders";

export function useKnowledgeFolders() {
  const userId = useCurrentUserId();
  const [folders, setFolders] = useState<KnowledgeFolder[]>(
    () => getSessionCache<KnowledgeFolder[]>(KF_CACHE_KEY) ?? [],
  );
  const [loading, setLoading] = useState(
    () => getSessionCache<KnowledgeFolder[]>(KF_CACHE_KEY) === null,
  );

  const fetchFolders = useCallback(async () => {
    const { data, error } = await supabase
      .from("knowledge_folders")
      .select("*")
      .order("sort_order")
      .order("name");
    if (!error && data) {
      setFolders(data as KnowledgeFolder[]);
      setSessionCache(KF_CACHE_KEY, data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  const addFolder = async (
    name: string,
    icon?: string,
    parentId?: string | null
  ) => {
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
    if (!error) await fetchFolders();
    return { data: data as KnowledgeFolder | null, error };
  };

  const updateFolder = async (id: string, updates: Partial<KnowledgeFolder>) => {
    const { error } = await supabase
      .from("knowledge_folders")
      .update(updates)
      .eq("id", id);
    if (!error) await fetchFolders();
    return { error };
  };

  const deleteFolder = async (id: string) => {
    const { error } = await supabase
      .from("knowledge_folders")
      .delete()
      .eq("id", id);
    if (!error) await fetchFolders();
    return { error };
  };

  const reorderFolders = async (ids: string[]) => {
    await Promise.all(
      ids.map((id, i) =>
        supabase
          .from("knowledge_folders")
          .update({ sort_order: i })
          .eq("id", id)
      )
    );
    await fetchFolders();
  };

  return {
    folders,
    loading,
    addFolder,
    updateFolder,
    deleteFolder,
    reorderFolders,
    refetch: fetchFolders,
  };
}
