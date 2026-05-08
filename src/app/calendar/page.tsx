import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from "@tanstack/react-query";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  calendarEventsQueryKey,
  type SharedEvent,
} from "@/hooks/use-calendar-events";
import { monthBounds } from "@/lib/date-utils";
import CalendarClient from "./calendar-client";

/**
 * Calendar 페이지 — Server Component.
 *
 * 책임:
 *  1) 쿠키 세션에서 로그인 사용자(auth.users → app_users 매핑)를 식별.
 *  2) URL 의 ?y=YYYY&m=MM (없으면 오늘 기준)으로 표시 월 결정.
 *  3) 본인 user_id 만 visibleUserIds 로 가정해 해당 월의 events 를 prefetchQuery.
 *  4) TanStack Query 의 dehydrate 결과를 HydrationBoundary 로 감싸 클라이언트에 전달.
 *
 * 클라이언트의 useCalendarEvents 가 동일 queryKey 로 호출하면 즉시 cache hit →
 * 첫 paint 부터 데이터 노출, 깜빡임 0%.
 *
 * `prefetchQuery` 패턴:
 *  - setQueryData 직접 호출보다 정석. queryFn 결과를 자동 setQueryData + 메타
 *    (dataUpdatedAt / fetchStatus 등) 정확히 동기화.
 *  - 동일 queryKey + queryFn 조합을 client useQuery 가 받으면 isPending=false 즉시 hit.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const yearParsed = params.y ? parseInt(params.y, 10) : NaN;
  const monthParsed = params.m ? parseInt(params.m, 10) : NaN;
  const year = Number.isFinite(yearParsed) ? yearParsed : now.getFullYear();
  const month = Number.isFinite(monthParsed) ? monthParsed : now.getMonth() + 1;

  const supa = await createSupabaseServerClient();
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 5 * 60 * 1000 },
    },
  });

  try {
    // getSession() — JWT 쿠키 로컬 디코딩(0.1ms). RPC 없음.
    // RSC prefetch 는 어차피 RLS 가 보호하므로 server 검증 불필요.
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
        const startDate = monthBounds(year, month).start;
        const endDate =
          month === 12
            ? `${year + 1}-01-01`
            : monthBounds(year, month + 1).start;
        const visibleUserIds = [currentUserId];

        await queryClient.prefetchQuery({
          queryKey: calendarEventsQueryKey(
            currentUserId,
            startDate,
            endDate,
            visibleUserIds,
          ),
          queryFn: async (): Promise<SharedEvent[]> => {
            const { data } = await supa
              .from("calendar_events")
              .select("*")
              .in("user_id", visibleUserIds)
              .lt("start_date", endDate)
              .or(
                `end_date.gte.${startDate},and(end_date.is.null,start_date.gte.${startDate})`,
              )
              .order("start_date")
              .order("sort_order")
              .order("created_at");
            return (data as SharedEvent[]) ?? [];
          },
        });
      }
    }
  } catch {
    // RSC prefetch 실패해도 클라이언트가 fetch 재시도하므로 무해.
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CalendarClient />
    </HydrationBoundary>
  );
}
