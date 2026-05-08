import CalendarClient from "./calendar-client";

/**
 * Calendar 페이지 — 단순 RSC wrapper.
 *
 * 이전엔 server 에서 supabase 쿼리로 데이터 prefetch + HydrationBoundary 로 넘겼으나
 * 매 navigation 마다 server fetch (auth + app_users + 본인 events) 가 직렬로
 * 300~650ms 추가되어 navigation 체감 속도가 SPA 보다 현저히 느려짐.
 *
 * 결정: server prefetch 폐기. 데이터는 client useCalendarEvents + TanStack
 * Query 의 persistQueryClient (localStorage 영속) 가 처리.
 *  - persist cache hit: 첫 paint 즉시 표시 (RSC prefetch 와 동등 효과)
 *  - cache miss: client 마운트 직후 fetch — 5분 staleTime 안의 background revalidate
 *
 * RSC 자체는 유지 (Link prefetch 가벼운 page shell만 prefetch 가능).
 */
export default function CalendarPage() {
  return <CalendarClient />;
}
