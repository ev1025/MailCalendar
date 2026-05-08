import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from "@tanstack/react-query";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { travelPlansQueryKey } from "@/hooks/use-travel-plans";
import { travelPlanTasksQueryKey } from "@/hooks/use-travel-plan-tasks";
import type { TravelPlan, TravelPlanTask } from "@/types";
import TravelPlansClient from "./plans-client";

/**
 * 여행 계획 페이지 — RSC.
 * 본인 user_id 의 travel_plans 를 prefetchQuery.
 * ?id=xxx 로 단일 plan 상세인 경우 해당 plan 의 tasks 도 같이.
 */
export default async function TravelPlansPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const params = await searchParams;
  const planId = params.id ?? null;

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

        const promises: Promise<unknown>[] = [
          queryClient.prefetchQuery({
            queryKey: travelPlansQueryKey(currentUserId, visibleUserIds),
            queryFn: async (): Promise<TravelPlan[]> => {
              const { data } = await supa
                .from("travel_plans")
                .select("*")
                .eq("user_id", currentUserId)
                .order("updated_at", { ascending: false });
              return (data as TravelPlan[]) ?? [];
            },
          }),
        ];

        if (planId) {
          promises.push(
            queryClient.prefetchQuery({
              queryKey: travelPlanTasksQueryKey(planId),
              queryFn: async (): Promise<TravelPlanTask[]> => {
                const { data } = await supa
                  .from("travel_plan_tasks")
                  .select("*")
                  .eq("plan_id", planId)
                  .order("day_index", { ascending: true })
                  .order("start_time", {
                    ascending: true,
                    nullsFirst: false,
                  })
                  .order("manual_order", { ascending: true });
                return (data as TravelPlanTask[]) ?? [];
              },
            }),
          );
        }

        await Promise.all(promises);
      }
    }
  } catch {
    // skip
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <TravelPlansClient />
    </HydrationBoundary>
  );
}
