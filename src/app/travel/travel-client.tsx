"use client";

import { useRouter } from "next/navigation";
import { Plane, Route } from "lucide-react";
import PageHeader from "@/components/layout/page-header";
import HeaderViewMenu from "@/components/layout/header-view-menu";
import TravelList from "@/components/travel/travel-list";
import PullToRefresh from "@/components/ui/pull-to-refresh";
import { useCalendarEvents } from "@/hooks/use-calendar-events";
import { useEventTags } from "@/hooks/use-event-tags";
import { useTravelItems } from "@/hooks/use-travel-items";
import { useVisibleUserIds } from "@/hooks/use-visible-user-ids";
import { supabase } from "@/lib/supabase";

export default function TravelClient() {
  const router = useRouter();
  const { visibleUserIds } = useVisibleUserIds();

  // 여행 카드의 "달력 추가"는 calendar 쪽 mutation만 필요.
  // useCalendarEvents(year, month, visibleUserIds) 는 조회용으로 year/month 를 받지만,
  // 여기선 addEvent 만 쓰므로 임의의 현재 월을 넣어도 무방.
  const now = new Date();
  const { addEvent, deleteEvent } = useCalendarEvents(
    now.getFullYear(),
    now.getMonth() + 1,
    visibleUserIds
  );
  const { addTag } = useEventTags();
  // Pull-to-refresh 가 호출할 refetch — TravelList 가 자체 인스턴스로 fetch 하지만
  // 같은 cacheKey 라 SWR 패턴상 동일 결과 갱신.
  const { refetch: refetchTravel } = useTravelItems(visibleUserIds);

  return (
    <>
      <PageHeader
        title="여행"
        actions={
          <HeaderViewMenu
            items={[
              {
                key: "travel",
                label: "여행",
                icon: Plane,
                active: true,
                onSelect: () => {},
              },
              {
                key: "travel-plans",
                label: "여행 계획",
                icon: Route,
                onSelect: () => router.push("/travel/plans"),
              },
            ]}
          />
        }
      />
      <div className="flex flex-col h-[calc(100%-3.5rem)] overflow-hidden px-2 py-2 md:h-auto md:overflow-visible md:min-h-0 md:p-6 animate-page-in">
        <PullToRefresh onRefresh={async () => { await refetchTravel(); }}>
          <TravelList
            visibleUserIds={visibleUserIds}
            onNavigateToMonth={(y, m) => {
              router.push(`/calendar?y=${y}&m=${m}`);
            }}
            onAddEvent={async (data) => {
              return await addEvent(data);
            }}
            onAddEventTagToCalendar={async (name, color) => {
              return await addTag(name, color);
            }}
            onDeleteCalendarEventsByTitleDate={async (title, date) => {
              const { data } = await supabase
                .from("calendar_events")
                .select("id")
                .eq("title", title)
                .eq("start_date", date);
              if (data) {
                for (const ev of data as { id: string }[]) {
                  await deleteEvent(ev.id);
                }
              }
            }}
          />
        </PullToRefresh>
      </div>
    </>
  );
}
