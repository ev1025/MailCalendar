import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from "@tanstack/react-query";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { KNOWLEDGE_FOLDERS_KEY } from "@/hooks/use-knowledge-folders";
import { knowledgeItemsQueryKey } from "@/hooks/use-knowledge-items";
import type { KnowledgeFolder, KnowledgeItem } from "@/types";
import KnowledgeClient from "./knowledge-client";

/**
 * Knowledge 페이지 — RSC.
 * 모든 폴더와 모든 아이템(전체 보기 키)을 prefetch.
 */
export default async function KnowledgePage() {
  const supa = await createSupabaseServerClient();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 5 * 60 * 1000 } },
  });

  try {
    const [foldersRes, itemsRes] = await Promise.all([
      supa
        .from("knowledge_folders")
        .select("*")
        .order("sort_order")
        .order("name"),
      supa
        .from("knowledge_items")
        .select("*")
        .order("pinned", { ascending: false })
        .order("updated_at", { ascending: false }),
    ]);

    queryClient.setQueryData<KnowledgeFolder[]>(
      KNOWLEDGE_FOLDERS_KEY,
      (foldersRes.data as KnowledgeFolder[]) ?? [],
    );
    queryClient.setQueryData<KnowledgeItem[]>(
      knowledgeItemsQueryKey(null),
      (itemsRes.data as KnowledgeItem[]) ?? [],
    );
  } catch {
    // skip
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <KnowledgeClient />
    </HydrationBoundary>
  );
}
