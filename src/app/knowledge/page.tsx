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
 * 모든 폴더와 모든 아이템(전체 보기 키)을 prefetchQuery.
 */
export default async function KnowledgePage() {
  const supa = await createSupabaseServerClient();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 5 * 60 * 1000 } },
  });

  try {
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: KNOWLEDGE_FOLDERS_KEY,
        queryFn: async (): Promise<KnowledgeFolder[]> => {
          const { data } = await supa
            .from("knowledge_folders")
            .select("*")
            .order("sort_order")
            .order("name");
          return (data as KnowledgeFolder[]) ?? [];
        },
      }),
      queryClient.prefetchQuery({
        queryKey: knowledgeItemsQueryKey(null),
        queryFn: async (): Promise<KnowledgeItem[]> => {
          const { data } = await supa
            .from("knowledge_items")
            .select("*")
            .order("pinned", { ascending: false })
            .order("updated_at", { ascending: false });
          return (data as KnowledgeItem[]) ?? [];
        },
      }),
    ]);
  } catch {
    // skip
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <KnowledgeClient />
    </HydrationBoundary>
  );
}
