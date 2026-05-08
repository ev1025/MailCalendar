import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from "@tanstack/react-query";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { travelItemsQueryKey } from "@/hooks/use-travel-items";
import { travelTagsQueryKey } from "@/hooks/use-travel-tags";
import { travelCategoriesQueryKey } from "@/hooks/use-travel-categories";
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
 * 본인 user_id 기준 travel_items / travel_tags / travel_categories prefetchQuery.
 */
export default async function TravelPage() {
  const supa = await createSupabaseServerClient();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 5 * 60 * 1000 } },
  });

  try {
    const {
      data: { session },
    } = await supa.auth.getSession();
    const user = session?.user ?? null;

    if (user) {
      const { data: appUser } = await supa
        .from("app_users")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      const currentUserId =
        (appUser as { id?: string | null } | null)?.id ?? null;

      if (currentUserId) {
        const visibleUserIds = [currentUserId];
        const idsKey = currentUserId;

        await Promise.all([
          queryClient.prefetchQuery({
            queryKey: travelItemsQueryKey(currentUserId, visibleUserIds),
            queryFn: async (): Promise<TravelItem[]> => {
              const { data } = await supa
                .from("travel_items")
                .select("*")
                .eq("user_id", currentUserId)
                .order("visited")
                .order("created_at", { ascending: false });
              return (data as TravelItem[]) ?? [];
            },
          }),
          queryClient.prefetchQuery({
            queryKey: travelTagsQueryKey(idsKey),
            queryFn: async (): Promise<TravelTag[]> => {
              const { data } = await supa
                .from("travel_tags")
                .select("*")
                .eq("user_id", currentUserId)
                .order("name");
              return (data as TravelTag[]) ?? [];
            },
          }),
          queryClient.prefetchQuery({
            queryKey: travelCategoriesQueryKey(currentUserId),
            queryFn: async (): Promise<TravelCategoryRow[]> => {
              const { data } = await supa
                .from("travel_categories")
                .select("id, name, color, is_builtin, sort_order")
                .eq("user_id", currentUserId)
                .order("sort_order", { ascending: true })
                .order("created_at", { ascending: true });
              return (data as TravelCategoryRow[]) ?? [];
            },
          }),
        ]);
      }
    }
  } catch {
    // skip
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <TravelClient />
    </HydrationBoundary>
  );
}
