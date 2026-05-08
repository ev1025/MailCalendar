import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from "@tanstack/react-query";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  travelItemsQueryKey,
} from "@/hooks/use-travel-items";
import {
  travelTagsQueryKey,
} from "@/hooks/use-travel-tags";
import {
  travelCategoriesQueryKey,
} from "@/hooks/use-travel-categories";
import type { TravelItem, TravelTag } from "@/types";
import TravelClient from "./travel-client";

interface TravelCategoryRow {
  id: string;
  name: string;
  color: string;
  is_builtin: boolean;
  sort_order?: number;
}

/**
 * Travel 페이지 — RSC.
 * 본인 user_id 기준으로 travel_items / travel_tags / travel_categories 를 prefetch.
 * visibleUserIds 는 localStorage 기반이라 서버에서 알 수 없음 → 본인만 가정.
 */
export default async function TravelPage() {
  const supa = await createSupabaseServerClient();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 5 * 60 * 1000 } },
  });

  try {
    const {
      data: { user },
    } = await supa.auth.getUser();

    if (user) {
      const { data: appUser } = await supa
        .from("app_users")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      const currentUserId =
        (appUser as { id?: string | null } | null)?.id ?? null;

      if (currentUserId) {
        // 본인 visibleUserIds=[currentUserId] 가정.
        const visibleUserIds = [currentUserId];
        const idsKey = currentUserId;

        // 병렬 fetch.
        const [itemsRes, tagsRes, catsRes] = await Promise.all([
          supa
            .from("travel_items")
            .select("*")
            .eq("user_id", currentUserId)
            .order("visited")
            .order("created_at", { ascending: false }),
          supa
            .from("travel_tags")
            .select("*")
            .eq("user_id", currentUserId)
            .order("name"),
          supa
            .from("travel_categories")
            .select("id, name, color, is_builtin, sort_order")
            .eq("user_id", currentUserId)
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true }),
        ]);

        queryClient.setQueryData<TravelItem[]>(
          travelItemsQueryKey(currentUserId, visibleUserIds),
          (itemsRes.data as TravelItem[]) ?? [],
        );
        queryClient.setQueryData<TravelTag[]>(
          travelTagsQueryKey(idsKey),
          (tagsRes.data as TravelTag[]) ?? [],
        );
        if (catsRes.data && catsRes.data.length > 0) {
          queryClient.setQueryData<TravelCategoryRow[]>(
            travelCategoriesQueryKey(currentUserId),
            catsRes.data as TravelCategoryRow[],
          );
        }
      }
    }
  } catch {
    // RSC prefetch 실패해도 클라이언트가 fetch 재시도.
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <TravelClient />
    </HydrationBoundary>
  );
}
