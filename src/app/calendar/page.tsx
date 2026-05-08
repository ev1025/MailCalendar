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
 *  3) 본인 user_id 만 visibleUserIds 로 가정해 해당 월의 events 를 PostgREST 로 prefetch.
 *  4) TanStack Query 의 dehydrate 결과를 HydrationBoundary 로 감싸 클라이언트에 전달.
 *
 * 클라이언트의 useCalendarEvents 가 동일 queryKey 로 호출하면 즉시 cache hit →
 * 첫 paint 부터 데이터 노출, 깜빡임 0%.
 *
 * 공유받은 사용자(viewableUserIds)의 events 는 visibleUserIds 토글 후 클라이언트에서
 * 추가 fetch — 본인 일정이 즉시 보이는 게 우선. 공유 prefetch 는 추후 정교화 가능.
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
      queries: {
        staleTime: 5 * 60 * 1000,
      },
    },
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
        const startDate = monthBounds(year, month).start;
        const endDate =
          month === 12
            ? `${year + 1}-01-01`
            : monthBounds(year, month + 1).start;
        const visibleUserIds = [currentUserId];
        const queryKey = calendarEventsQueryKey(
          currentUserId,
          startDate,
          endDate,
          visibleUserIds,
        );

        const { data: events } = await supa
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

        queryClient.setQueryData<SharedEvent[]>(
          queryKey,
          (events as SharedEvent[]) ?? [],
        );
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
