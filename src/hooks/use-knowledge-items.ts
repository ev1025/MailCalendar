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
import { toast } from "sonner";
import type { KnowledgeItem } from "@/types";

const STALE_TIME = 5 * 60 * 1000;
const GC_TIME = 24 * 60 * 60 * 1000;

export function knowledgeItemsQueryKey(
  folderId: string | null,
  userId?: string | null,
) {
  return ["knowledge-items", userId ?? "", folderId ?? "all"] as const;
}

async function fetchItems(
  folderId: string | null,
  userId: string | null | undefined,
): Promise<KnowledgeItem[]> {
  let query = supabase
    .from("knowledge_items")
    .select("*")
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false });
  if (folderId) query = query.eq("folder_id", folderId);
  // RLS 가 1차 방어이지만 클라이언트 anon key 직접 쿼리라 명시적 user_id 필터도 둠.
  if (userId) query = query.eq("user_id", userId);
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
    () => knowledgeItemsQueryKey(folderId, userId),
    [folderId, userId],
  );

  const itemsQuery = useQuery<KnowledgeItem[]>({
    queryKey,
    queryFn: () => fetchItems(folderId, userId),
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

  /**
   * 노트 삭제 — 낙관적 제거. `opts.undo`(기본 true)면 "실행취소" 토스트 노출.
   * 노트는 leaf(다른 테이블이 참조 안 함)라 삭제 즉시 실행하고, 실행취소 시
   * 원본 행을 같은 id 로 다시 insert 해 완전 복원. 일괄 삭제(여러 건 루프)는
   * 토스트 폭주를 막으려 호출처에서 `{ undo: false }` 로 끔(이미 확인 모달 통과).
   */
  const deleteItem = useCallback(
    async (id: string, opts?: { undo?: boolean }) => {
      const showUndo = opts?.undo ?? true;
      // 모든 knowledge-items 캐시에서 원본 행 확보 + 낙관적 제거.
      let original: KnowledgeItem | null = null;
      queryClient
        .getQueryCache()
        .findAll({ queryKey: ["knowledge-items"] })
        .forEach((q) => {
          const data = q.state.data as KnowledgeItem[] | undefined;
          if (!data) return;
          const found = data.find((it) => it.id === id);
          if (!found) return;
          if (!original) original = found;
          queryClient.setQueryData(
            q.queryKey,
            data.filter((it) => it.id !== id),
          );
        });

      const { error } = await supabase
        .from("knowledge_items")
        .delete()
        .eq("id", id);
      if (error) {
        inv(); // 실패 → 캐시 복원
        return { error };
      }

      if (showUndo && original) {
        const orig = original as KnowledgeItem;
        toast("노트를 삭제했어요", {
          duration: 5000,
          action: {
            label: "실행취소",
            onClick: async () => {
              const { error: reErr } = await supabase
                .from("knowledge_items")
                .insert(orig);
              inv();
              if (reErr) toast.error("복원 실패");
            },
          },
        });
      }
      inv();
      return { error: null };
    },
    [queryClient, inv],
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
  // PostgREST .or() 는 문자열 파싱이라 q 안의 , ( ) 등이 필터 구조를 깨뜨릴 수 있음.
  // 값을 "..." 로 감싸면 PostgREST 가 리터럴로 취급 → \ 와 " 만 이스케이프하면 안전.
  const safe = q.replace(/[\\"]/g, "\\$&");
  const { data, error } = await supabase
    .from("knowledge_items")
    .select("*")
    .or(`title.ilike."%${safe}%",content.ilike."%${safe}%"`)
    .order("updated_at", { ascending: false })
    .limit(30);
  if (error || !data) return [];
  return data as KnowledgeItem[];
}
