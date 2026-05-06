"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import {
  CalendarDays,
  TableProperties,
} from "lucide-react";
import MonthPicker from "@/components/layout/month-picker";
import PageHeader from "@/components/layout/page-header";
import HeaderViewMenu from "@/components/layout/header-view-menu";
import DdayDialog from "@/components/calendar/dday-dialog";
import { useDdaySettings } from "@/hooks/use-dday-settings";
import { useCalendarEvents } from "@/hooks/use-calendar-events";
import { useWeather } from "@/hooks/use-weather";
import { useEventTags } from "@/hooks/use-event-tags";
import { useCalendarShares } from "@/hooks/use-calendar-shares";
import { useVisibleUserIds } from "@/hooks/use-visible-user-ids";
import CalendarView from "@/components/calendar/calendar-view";
import DatabaseView from "@/components/calendar/database-view";
import EventForm from "@/components/calendar/event-form";
import DayDetail from "@/components/calendar/day-detail";
import RepeatScopeDialog, { type RepeatScope } from "@/components/calendar/repeat-scope-dialog";
import { useAppUsers } from "@/lib/current-user";
import { getHolidayMap } from "@/lib/holidays";
import { buildRepeatEvents } from "@/lib/calendar/build-repeat-events";
import type { CalendarEvent } from "@/types";

export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <CalendarPageInner />
    </Suspense>
  );
}

function CalendarPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewParam = searchParams.get("view");
  type View = "calendar" | "database";
  const view: View = viewParam === "database" ? "database" : "calendar";
  const setView = (v: View) => {
    const url = v === "calendar" ? "/calendar" : "/calendar?view=database";
    router.push(url, { scroll: false });
  };

  // /travel 페이지에서 onNavigateToMonth 로 이동 시 ?y=..&m=.. 로 넘어옴.
  // 초기값 + 쿼리 변화 모두 반영.
  const yParam = searchParams.get("y");
  const mParam = searchParams.get("m");
  const now = new Date();
  const [year, setYear] = useState(() =>
    yParam ? parseInt(yParam, 10) : now.getFullYear()
  );
  const [month, setMonth] = useState(() =>
    mParam ? parseInt(mParam, 10) : now.getMonth() + 1
  );
  // 캘린더 가로 스와이프 좌표 — capture 단계에서 저장. 이전엔 currentTarget 에
  // 직접 dataset 으로 저장했는데 dnd-kit 셀 캡처와 충돌 가능. ref 가 안정적.
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  // 월 전환 방향 — +1 = 다음달(왼쪽으로 밀려와 들어옴), -1 = 이전달(오른쪽에서 들어옴),
  // 0 = MonthPicker 직접 변경(슬라이드 없이 fade only).
  // AnimatePresence 없이 key 변경 + initial/animate 만으로 enter 애니메이션 → 레이아웃 안전.
  const slideDirRef = useRef(0);
  useEffect(() => {
    if (yParam) {
      const y = parseInt(yParam, 10);
      if (!Number.isNaN(y)) setYear(y);
    }
    if (mParam) {
      const m = parseInt(mParam, 10);
      if (!Number.isNaN(m)) setMonth(m);
    }
  }, [yParam, mParam]);

  const { users } = useAppUsers();
  const { viewableUserIds } = useCalendarShares();
  const { visibleUserIds, toggleVisible } = useVisibleUserIds();

  // 폼 (새 일정 / 수정)
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [defaultDate, setDefaultDate] = useState<string>("");

  // 날짜 상세
  const [dayDetailOpen, setDayDetailOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");

  // D-day 다이얼로그 — 설정에서 토글 ON + date/time 입력 시에만 버튼 노출.
  const [ddayOpen, setDdayOpen] = useState(false);
  const { settings: ddaySettings, isReady: ddayReady } = useDdaySettings();

  const {
    events,
    loading: eventsLoading,
    addEvent,
    addEventsBulk,
    updateEvent,
    updateEventSeries,
    deleteEvent,
    deleteEventSeries,
    batchUpdateSortOrder,
  } = useCalendarEvents(year, month, visibleUserIds);

  // 반복 일정 scope dialog 상태
  const [scopeDialog, setScopeDialog] = useState<
    | { kind: "edit"; anchor: CalendarEvent; pendingUpdates: Partial<Omit<CalendarEvent, "id" | "created_at">> }
    | { kind: "delete"; anchor: CalendarEvent }
    | null
  >(null);
  const { weatherMap } = useWeather(year, month);
  // 공유 owner 의 태그까지 색상이 보이려면 visibleUserIds 전달.
  const { tags, addTag, deleteTag, updateTagColor, updateTagName } = useEventTags(visibleUserIds);

  const handleSave = async (
    data: Omit<CalendarEvent, "id" | "created_at">,
    repeatCount?: number,
    repeatOpts?: {
      weeklyInterval?: number;
      monthlyNth?: { week: number; weekday: number } | null;
    },
  ) => {
    if (editing) {
      // 시리즈 일정 수정 → scope 선택 다이얼로그 표시
      if (editing.series_id) {
        setScopeDialog({ kind: "edit", anchor: editing, pendingUpdates: data });
        // 실제 저장은 scope 선택 후 진행 — form은 닫지 않기 위해 pending 반환
        return { error: null };
      }
      return await updateEvent(editing.id, data);
    }

    // 반복 일정 — 원본 + 추가분을 series_id 로 묶어 일괄 insert.
    if (repeatCount && (repeatCount > 1 || repeatCount === -1) && data.repeat) {
      const batch = buildRepeatEvents(data, repeatCount, repeatOpts);
      return await addEventsBulk(batch);
    }

    // 단일 저장.
    return await addEvent(data);
  };

  // 달력에서 날짜 클릭 → 일정 또는 공휴일 있으면 상세, 없으면 새 일정
  const handleDateClick = (date: string) => {
    const d = new Date(date + "T00:00:00");
    const hasEvents = events.some((ev) => {
      const start = new Date(ev.start_date + "T00:00:00");
      const end = ev.end_date ? new Date(ev.end_date + "T00:00:00") : start;
      return d >= start && d <= end;
    });
    const hasHoliday = !!getHolidayMap(d.getFullYear())[date];
    if (hasEvents || hasHoliday) {
      setSelectedDate(date);
      setDayDetailOpen(true);
    } else {
      setEditing(null);
      setDefaultDate(date);
      setFormOpen(true);
    }
  };

  // 날짜 상세에서 "새 일정 추가" 클릭
  const handleAddFromDay = () => {
    setEditing(null);
    setDefaultDate(selectedDate);
    setFormOpen(true);
  };

  // DB뷰에서 수정
  const handleEdit = (event: CalendarEvent) => {
    setEditing(event);
    setFormOpen(true);
  };

  // 삭제 — 시리즈 일정이면 scope 다이얼로그 띄우고, 아니면 바로 삭제
  const handleDelete = async (id: string) => {
    const target = events.find((e) => e.id === id);
    if (target && target.series_id) {
      setScopeDialog({ kind: "delete", anchor: target });
      return;
    }
    await deleteEvent(id);
  };

  const handleScopeConfirm = async (scope: RepeatScope) => {
    if (!scopeDialog) return;
    if (scopeDialog.kind === "edit") {
      await updateEventSeries(scopeDialog.anchor, scope, scopeDialog.pendingUpdates);
      setFormOpen(false);
      setEditing(null);
    } else {
      await deleteEventSeries(scopeDialog.anchor, scope);
    }
    setScopeDialog(null);
  };

  const viewLabel = view === "calendar" ? "달력" : "일정목록";

  return (
    <>
      <PageHeader
        title={viewLabel}
        actions={
          <div className="flex items-center gap-1">
            {/* D-day — 설정에서 토글 ON + 기준일 입력 시에만 노출. */}
            {ddayReady && (
              <button
                type="button"
                onClick={() => setDdayOpen(true)}
                aria-label="D-day"
                title="D-day"
                className="flex h-10 items-center px-3 rounded-full text-xs font-bold text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                D-day
              </button>
            )}
            <HeaderViewMenu
              items={[
                {
                  key: "calendar",
                  label: "달력",
                  icon: CalendarDays,
                  active: view === "calendar",
                  onSelect: () => setView("calendar"),
                },
                {
                  key: "database",
                  label: "일정목록",
                  icon: TableProperties,
                  active: view === "database",
                  onSelect: () => setView("database"),
                },
              ]}
            />
          </div>
        }
      />
    <div className="flex flex-col min-h-0 h-[calc(100%-3.5rem)] overflow-hidden px-2 py-2 md:h-auto md:overflow-visible md:min-h-0 md:p-6">

      {/* 데스크탑: MonthPicker(가운데) + 사용자 필터(우측 끝) 한 행.
          모바일: MonthPicker 만 한 행, 필터는 그 아래 별도 행 — 좁은 화면에서 가로 공간 부족. */}
      {(() => {
        const userChips =
          view === "calendar" && viewableUserIds.length > 1
            ? users
                .filter((u) => viewableUserIds.includes(u.id))
                .map((u) => {
                  const active = visibleUserIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleVisible(u.id)}
                      className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-all"
                      style={
                        active
                          ? {
                              borderColor: u.color,
                              backgroundColor: u.color + "20",
                              color: u.color,
                            }
                          : { opacity: 0.4 }
                      }
                    >
                      {u.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={u.avatar_url}
                          alt={u.name}
                          className="h-4 w-4 rounded-full object-cover"
                        />
                      ) : (
                        <span>{u.emoji || u.name[0]}</span>
                      )}
                      <span className="font-medium">{u.name}</span>
                    </button>
                  );
                })
            : null;

        return (
          <>
            <div className="mb-2 flex items-center shrink-0">
              {/* 좌측 spacer — MonthPicker 가운데 정렬용 (데스크탑) */}
              <div className="hidden md:block flex-1" />
              <div className="flex-1 md:flex-none flex justify-center">
                <MonthPicker
                  year={year}
                  month={month}
                  onYearChange={setYear}
                  onMonthChange={setMonth}
                />
              </div>
              {/* 우측: 사용자 필터 (데스크탑만 같은 행). 모바일은 별도 행. */}
              <div className="hidden md:flex flex-1 justify-end flex-wrap items-center gap-1.5">
                {userChips}
              </div>
            </div>
            {userChips && (
              <div className="md:hidden mb-2 flex flex-wrap items-center justify-center gap-1.5 shrink-0">
                {userChips}
              </div>
            )}
          </>
        );
      })()}

      {view === "calendar" ? (
        // 데스크톱은 document 스크롤이라 부모가 h-auto → flex-1 이 0 이 되어 달력이 쪼그라듦.
        // calendar-md-height 는 globals.css 에 직접 정의된 @media (min-width:768px) 규칙으로
        // md+ 에서 height: 80vh 를 강제함. Tailwind arbitrary value 캐시 문제 회피.
        //
        // 스와이프 처리: 캘린더 셀에 dnd-kit useDraggable 이 적용돼 있어 이전엔
        // currentTarget 의 dataset 으로 좌표 저장 → DOM 재구성·이벤트 위임 충돌 가능성.
        // ref 를 컴포넌트 클로저에 두고 capture 단계로 touchstart 받아 첫 좌표 안정화.
        // 가로 30px / 세로 30px 이내로 임계값 완화 + 단순 절댓값 비교.
        <div
          className="calendar-md-height"
          onTouchStartCapture={(e) => {
            const t = e.touches[0];
            swipeRef.current = { x: t.clientX, y: t.clientY };
          }}
          onTouchEndCapture={(e) => {
            const start = swipeRef.current;
            swipeRef.current = null;
            if (!start) return;
            const t = e.changedTouches[0];
            const dx = t.clientX - start.x;
            const dy = t.clientY - start.y;
            // 임계값 완화: 가로 40px 이상 & 세로 이동 50px 이내 (수직 스크롤·DnD 와 구분).
            if (Math.abs(dx) < 40 || Math.abs(dy) > 50) return;
            if (dx < 0) {
              // 왼쪽으로 밀기 → 다음 월. enter 방향 +1 (오른쪽에서 슬라이드 들어옴).
              slideDirRef.current = 1;
              if (month === 12) {
                setYear(year + 1);
                setMonth(1);
              } else {
                setMonth(month + 1);
              }
            } else {
              // 오른쪽으로 밀기 → 이전 월. enter 방향 -1 (왼쪽에서 슬라이드 들어옴).
              slideDirRef.current = -1;
              if (month === 1) {
                setYear(year - 1);
                setMonth(12);
              } else {
                setMonth(month - 1);
              }
            }
          }}
        >
        {/* 월 전환 enter 애니메이션 — key 변경 시 새 motion.div 가 마운트되며
            방향에 맞게 슬라이드 + fade. exit 애니메이션 없음(=mode="popLayout" 류
            absolute 처리 회피) → flex 체인 보존돼 레이아웃 안전.
            flex flex-col flex-1 min-h-0 → 부모 calendar-md-height 의 flex 체인 그대로 상속. */}
        <motion.div
          key={`${year}-${month}`}
          initial={{
            x: slideDirRef.current > 0 ? 40 : slideDirRef.current < 0 ? -40 : 0,
            opacity: 0,
          }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col flex-1 min-h-0"
          onAnimationComplete={() => {
            // 다음 mountcheck 이 MonthPicker 직접 변경일 수 있으니 리셋.
            slideDirRef.current = 0;
          }}
        >
          <CalendarView
            year={year}
            month={month}
            events={events}
            weatherMap={weatherMap}
            onDateClick={handleDateClick}
            onEventMove={async (eventId, newStart, newEnd) => {
              await updateEvent(eventId, { start_date: newStart, end_date: newEnd });
            }}
            onReorder={batchUpdateSortOrder}
          />
        </motion.div>
        </div>
      ) : (
        <DatabaseView
          events={events}
          weatherMap={weatherMap}
          tags={tags}
          loading={eventsLoading}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}

      {/* 날짜 상세 모달 (달력 날짜 클릭 시) */}
      <DayDetail
        open={dayDetailOpen}
        onOpenChange={setDayDetailOpen}
        date={selectedDate}
        events={events}
        weather={weatherMap[selectedDate]}
        tags={tags}
        visibleUserIds={visibleUserIds}
        holiday={selectedDate ? getHolidayMap(new Date(selectedDate + "T00:00:00").getFullYear())[selectedDate] : undefined}
        onAddEvent={handleAddFromDay}
        onEditEvent={(ev) => { setDayDetailOpen(false); setEditing(ev); setFormOpen(true); }}
        onDeleteEvent={async (id) => { await handleDelete(id); }}
        onReorder={batchUpdateSortOrder}
      />

      {/* 일정 추가/수정 폼 */}
      <EventForm
        open={formOpen}
        onOpenChange={setFormOpen}
        event={editing}
        defaultDate={defaultDate}
        tags={tags}
        onAddTag={addTag}
        onDeleteTag={deleteTag}
        onUpdateTagColor={updateTagColor}
        onRenameTag={updateTagName}
        weatherMap={weatherMap}
        onSave={handleSave}
        onBack={() => {
          if (editing) {
            setSelectedDate(editing.start_date);
            setDayDetailOpen(true);
          }
        }}
      />

      <RepeatScopeDialog
        open={!!scopeDialog}
        onOpenChange={(o) => { if (!o) setScopeDialog(null); }}
        action={scopeDialog?.kind === "delete" ? "삭제" : "수정"}
        onConfirm={handleScopeConfirm}
      />

      <DdayDialog
        open={ddayOpen}
        onOpenChange={setDdayOpen}
        date={ddaySettings.date}
        time={ddaySettings.time}
      />
    </div>
    </>
  );
}
