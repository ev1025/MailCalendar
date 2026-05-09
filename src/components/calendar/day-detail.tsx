"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { parseYmd } from "@/lib/date-utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Clock, Trash2 } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CalendarEvent, EventTag, WeatherData } from "@/types";
import { useTravelTags } from "@/hooks/use-travel-tags";
import { useAppUsers, useCurrentUserId } from "@/lib/current-user";
import { format, parseISO, isSameDay, isWithinInterval } from "date-fns";
import { ko } from "date-fns/locale";
import WeatherIcon from "./weather-icon";
import WeatherHourlyDialog from "./weather-hourly-dialog";

type EventWithOwner = CalendarEvent & { user_id?: string | null };

interface DayDetailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  events: CalendarEvent[];
  weather?: WeatherData;
  tags?: EventTag[];
  holiday?: string;
  /** 공유받은 owner 의 travel_tags 까지 색상이 보이도록. */
  visibleUserIds?: string[];
  onAddEvent: () => void;
  onEditEvent?: (event: CalendarEvent) => void;
  onDeleteEvent?: (id: string) => void;
  onReorder?: (ids: string[]) => void;
  /** 헤더 우측 날씨 칩 클릭 — 부모가 시간별 날씨 다이얼로그를 자기 레벨에서 띄움.
   *  미지정 시 내부 fallback 으로 자체 다이얼로그 마운트(Base UI nested 이슈 가능). */
  onWeatherClick?: (date: string, weather: WeatherData) => void;
}

function SortableItem({ ev, tagColorMap, isOwner, owner, onEdit, onDelete }: {
  ev: EventWithOwner;
  tagColorMap: Record<string, string>;
  isOwner: boolean;
  owner?: { name: string; color: string; emoji?: string | null; avatar_url?: string | null };
  onEdit?: (event: CalendarEvent) => void;
  onDelete?: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ev.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group flex items-center gap-2 rounded-lg border pl-3 pr-1.5 py-2 hover:bg-accent/50 transition-colors touch-none"
    >
      {/* 일정 내용 (클릭 시 수정) */}
      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          onEdit?.(ev);
        }}
      >
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: ev.color }} />
          <p className="font-medium text-sm truncate">{ev.title}</p>
        </div>
        {(ev.start_time || ev.tag) && (
          <div className="flex items-center gap-2 mt-0.5 pl-[18px]">
            {ev.start_time && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {ev.start_time.slice(0, 5)}
                {ev.end_time && ` ~ ${ev.end_time.slice(0, 5)}`}
              </span>
            )}
            {ev.tag && ev.tag.split(",").map((t) => {
              const c = tagColorMap[t] || "#6B7280";
              return (
                <Badge key={t} className="text-xs h-4 px-1.5" style={{ backgroundColor: c + "20", color: c, borderColor: c + "40" }}>
                  {t}
                </Badge>
              );
            })}
          </div>
        )}
      </div>

      {/* 오른쪽 영역: 내 일정 → 휴지통, 타인 일정 → 등록자 프로필 */}
      {isOwner && onDelete ? (
        <button
          type="button"
          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(ev.id);
          }}
          aria-label="삭제"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : owner ? (
        <div
          className="shrink-0 flex items-center gap-1 rounded-full pl-0.5 pr-2 py-0.5 text-xs font-medium"
          style={{
            backgroundColor: owner.color + "20",
            color: owner.color,
            border: `1px solid ${owner.color}40`,
          }}
          title={`${owner.name} 등록`}
          aria-label={`${owner.name} 등록`}
        >
          <div className="h-5 w-5 rounded-full overflow-hidden flex items-center justify-center shrink-0" style={{ backgroundColor: owner.color + "30" }}>
            {owner.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={owner.avatar_url} alt={owner.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-[10px]">{owner.emoji || owner.name[0]}</span>
            )}
          </div>
          <span className="truncate max-w-[60px]">{owner.name}</span>
        </div>
      ) : null}
    </div>
  );
}

export default function DayDetail({
  open,
  onOpenChange,
  date,
  events,
  weather,
  tags: tagList = [],
  holiday,
  visibleUserIds,
  onAddEvent,
  onEditEvent,
  onDeleteEvent,
  onReorder,
  onWeatherClick,
}: DayDetailProps) {
  const { tags: travelTags } = useTravelTags(visibleUserIds);
  const currentUserId = useCurrentUserId();
  // 날씨 칩 클릭 → 시간별 상세 다이얼로그. onWeatherClick prop 이 있으면 부모에 위임.
  const [hourlyOpen, setHourlyOpen] = useState(false);
  const { users } = useAppUsers();
  const usersById = new Map(users.map((u) => [u.id, u]));
  const tagColorMap: Record<string, string> = {};
  for (const t of tagList) tagColorMap[t.name] = t.color;
  for (const t of travelTags) {
    if (!tagColorMap[t.name]) tagColorMap[t.name] = t.color;
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // 모바일: 200ms 길게 눌러야 드래그 시작 — 탭(편집)·세로 스크롤과 분리.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  if (!date) return null;

  const d = parseYmd(date);
  const dateLabel = format(d, "yyyy년 M월 d일 (EEEE)", { locale: ko });

  const dayEvents = events.filter((ev) => {
    const start = parseISO(ev.start_date);
    const end = ev.end_date ? parseISO(ev.end_date) : start;
    return isSameDay(d, start) || isSameDay(d, end) || isWithinInterval(d, { start, end });
  }).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const handleDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id || !onReorder) return;
    const oldIdx = dayEvents.findIndex((ev) => ev.id === e.active.id);
    const newIdx = dayEvents.findIndex((ev) => ev.id === e.over!.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(dayEvents, oldIdx, newIdx);
    onReorder(reordered.map((ev) => ev.id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showBackButton={false} className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 min-w-0">
            <DialogTitle className="text-sm md:text-base truncate min-w-0">
              {dateLabel}
            </DialogTitle>
            {weather && (
              <button
                type="button"
                onClick={() => {
                  // onWeatherClick prop 우선 — 부모(calendar/page) 가 자기 레벨에서
                  // 다이얼로그를 띄워 Base UI nested context 충돌 회피.
                  if (onWeatherClick) onWeatherClick(date, weather);
                  else setHourlyOpen(true);
                }}
                // 우측 정렬로 날짜와 거리 확보. compact tone — 폰트 살짝 축소, 패딩 최소.
                className="ml-auto shrink-0 rounded-md px-0.5 py-0.5 text-[11px] hover:bg-accent transition-colors"
                aria-label="시간별 날씨 보기"
                title="시간별 날씨 보기"
              >
                <WeatherIcon weather={weather} showRange dense />
              </button>
            )}
          </div>
        </DialogHeader>
        <div className="flex flex-col gap-2 min-h-0">
          {/* 공휴일 — 삭제 불가 고정 항목 */}
          {holiday && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 pl-3 pr-2.5 py-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-400 shrink-0" />
              <p className="text-sm font-medium text-red-600 flex-1">{holiday}</p>
            </div>
          )}
          {dayEvents.length === 0 && !holiday ? (
            <p className="text-sm text-muted-foreground py-4 text-center">일정이 없습니다</p>
          ) : dayEvents.length > 0 ? (
            <div className="flex flex-col gap-1.5 max-h-[50vh] overflow-y-auto -mx-1 px-1">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={dayEvents.map((ev) => ev.id)} strategy={verticalListSortingStrategy}>
                  {/* enter/exit 애니메이션 — 추가시 위에서 부드럽게 슬라이드,
                      삭제시 우측으로 fade-out. dnd-kit transform 은 SortableItem 의
                      inner div 에 적용되므로 외부 motion.div 와 충돌 없음. */}
                  <AnimatePresence initial={false}>
                    {dayEvents.map((ev) => {
                      const evOwn = ev as EventWithOwner;
                      const ownerId = evOwn.user_id ?? null;
                      const isOwner = !ownerId || ownerId === currentUserId;
                      // ownerId 가 있는데 useAppUsers 에 매핑이 안 보이면(앱 사용자
                      // 목록 fetch 직전 race 등) "공유 사용자" 라는 placeholder 라도
                      // 노출 — 그래야 사용자가 "이 일정은 다른 사람 것" 이란 사실을 인지.
                      const lookedUp = ownerId ? usersById.get(ownerId) : undefined;
                      const owner = isOwner
                        ? undefined
                        : (lookedUp ?? {
                            id: ownerId ?? "",
                            name: "공유 사용자",
                            color: "#6B7280",
                            emoji: null,
                            avatar_url: null,
                          });
                      return (
                        <motion.div
                          key={ev.id}
                          initial={{ opacity: 0, y: -6, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, x: 24, scale: 0.96 }}
                          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                        >
                          <SortableItem
                            ev={evOwn}
                            tagColorMap={tagColorMap}
                            isOwner={isOwner}
                            owner={owner}
                            onEdit={(e) => { onOpenChange(false); onEditEvent?.(e); }}
                            onDelete={onDeleteEvent}
                          />
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </SortableContext>
              </DndContext>
            </div>
          ) : null}
          <Button
            variant="outline"
            className="w-full mt-1 shrink-0"
            onClick={() => { onOpenChange(false); onAddEvent(); }}
          >
            <Plus className="mr-1 h-4 w-4" />
            새 일정 추가
          </Button>
        </div>
      </DialogContent>

      <WeatherHourlyDialog
        open={hourlyOpen}
        onOpenChange={setHourlyOpen}
        date={date}
        weather={weather}
      />
    </Dialog>
  );
}
