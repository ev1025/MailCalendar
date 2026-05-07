"use client";

import { useEffect, useMemo, useState } from "react";
import { parseYmd, daysBetween } from "@/lib/date-utils";
import { Trash2, Copy, CalendarPlus, CalendarMinus, Check } from "lucide-react";
import RowActionPopover from "@/components/ui/row-action-popover";
import ListToolbar from "@/components/ui/list-toolbar";
import PromptDialog from "@/components/ui/prompt-dialog";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { useTravelPlans } from "@/hooks/use-travel-plans";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { supabase } from "@/lib/supabase";
import { useCurrentUserId } from "@/lib/current-user";
import { buildCalendarEvents } from "@/lib/travel/calendar-sync";
import { toast } from "sonner";
import { translateError } from "@/lib/api-errors";
import type { TravelPlan, TravelPlanTask } from "@/types";
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const ORDER_KEY = "travel_plan_custom_order";

interface Props {
  onSelectPlan: (id: string) => void;
  /** 달력 탭 상단에서 선택된 "볼 사용자들" — 공유된 계획 포함 */
  visibleUserIds?: string[];
}

interface PlanCardProps {
  plan: TravelPlan;
  dragEnabled: boolean;
  /** 이 계획에서 calendar_events 로 추가된 일정이 있는지. true 일 때만 "달력에서 삭제" 메뉴 노출. */
  hasCalendarEvents: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onAddToCalendar: () => void;
  onRemoveFromCalendar: () => void;
}

function PlanCard({ plan, dragEnabled, hasCalendarEvents, onSelect, onDelete, onDuplicate, onAddToCalendar, onRemoveFromCalendar }: PlanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: plan.id, disabled: !dragEnabled });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // 드래그 바 없이 카드 전체가 드래그 타겟.
  // PointerSensor 의 distance=5 제약으로 단순 클릭은 onSelect, 5px 이상 이동 시
  // 드래그 시작 — click/drag 충돌 없음.
  const dragBindings = dragEnabled ? { ...attributes, ...listeners } : {};

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...dragBindings}
      onClick={onSelect}
      // touch-action: pan-y 로 모바일 vertical 스크롤 허용. TouchSensor 는 delay 200ms 후
      // 활성화되므로 빠른 스크롤·탭은 자연스럽게 처리되고 길게 누를 때만 드래그.
      className={`group relative rounded-lg border p-3 hover:bg-accent/50 transition-colors ${
        dragEnabled ? "touch-pan-y cursor-grab active:cursor-grabbing" : "cursor-pointer"
      }`}
    >
      <h3 className="text-sm font-semibold truncate pr-8">{plan.title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {formatPlanPeriod(plan.start_date, plan.end_date)}
      </p>
      <div className="absolute right-2 top-1/2 -translate-y-1/2 md:opacity-0 md:group-hover:opacity-100 transition">
        <RowActionPopover
          trigger="more-h"
          triggerLabel="계획 메뉴"
          side="bottom"
          align="end"
          items={[
            // 달력에 이미 추가된 상태면 "삭제"만, 아니면 "추가"만 노출 (둘 중 하나).
            hasCalendarEvents
              ? {
                  icon: <CalendarMinus className="h-3.5 w-3.5 text-rose-600" />,
                  label: "달력에서 삭제",
                  onClick: onRemoveFromCalendar,
                }
              : {
                  icon: <CalendarPlus className="h-3.5 w-3.5 text-blue-600" />,
                  label: "달력에 추가",
                  onClick: onAddToCalendar,
                },
            {
              icon: <Copy className="h-3.5 w-3.5" />,
              label: "복제",
              onClick: onDuplicate,
            },
            {
              icon: <Trash2 className="h-3.5 w-3.5" />,
              label: "삭제",
              destructive: true,
              onClick: onDelete,
            },
          ]}
        />
      </div>
    </div>
  );
}

export default function PlanList({ onSelectPlan, visibleUserIds }: Props) {
  const { plans, loading, addPlan, deletePlan, duplicatePlan } = useTravelPlans(visibleUserIds);
  const userId = useCurrentUserId();
  const [newOpen, setNewOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // 가본 곳 포함 토글 — 종료일 < 오늘 인 계획을 숨김 / 표시.
  // sessionStorage 영속 — 한 세션 동안만 사용자 선택을 기억.
  const [showVisited, setShowVisited] = useState(() => {
    if (typeof window === "undefined") return true;
    return sessionStorage.getItem("travel_plan_show_visited") !== "false";
  });
  const updateShowVisited = (v: boolean) => {
    setShowVisited(v);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("travel_plan_show_visited", String(v));
    }
  };
  // 사용자 드래그 정렬 — localStorage 영속. usePersistentState 가 lazy 초기 + 쓰기 동시 처리.
  const [customOrder, setCustomOrder] = usePersistentState<string[]>(ORDER_KEY, []);
  // "달력에 추가" 확인 다이얼로그 — 등록될 일정 수를 미리 안내.
  const [addToCalState, setAddToCalState] = useState<
    | { plan: TravelPlan; tasks: { count: number; events: Record<string, unknown>[] } }
    | null
  >(null);
  const [addToCalLoading, setAddToCalLoading] = useState(false);

  // (useEffect 로 customOrder 초기 로드하던 코드는 usePersistentState 가 lazy 처리해 제거)

  // 데스크탑(마우스) 와 모바일(터치) 의 활성화 조건 분리:
  //  - MouseSensor: 5px 움직이면 드래그 (퀵)
  //  - TouchSensor: 200ms 길게 누르면 드래그 (모바일 스크롤·탭과 충돌 방지)
  // 이전에 PointerSensor 를 같이 쓰던 것이 모바일 vertical 스와이프(스크롤 의도)도
  // 5px 임계로 드래그를 시작시켜 카드 탭 → 화면이 흔들리는 듯한 "리로드" 체감을 유발.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  // 종료일이 어제 이하(=end_date < today) 인 계획은 "가본 곳". end_date 가 없으면
  // 진행 중으로 간주 (안 숨김).
  const isPastPlan = (p: TravelPlan): boolean => {
    if (!p.end_date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = parseYmd(p.end_date);
    return end.getTime() < today.getTime();
  };

  // 검색 + 가본 곳 포함 필터.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return plans.filter((p) => {
      if (!showVisited && isPastPlan(p)) return false;
      if (!q) return true;
      if (p.title.toLowerCase().includes(q)) return true;
      if ((p.start_date ?? "").includes(q)) return true;
      if ((p.end_date ?? "").includes(q)) return true;
      return false;
    });
  }, [plans, search, showVisited]);

  // 기본 정렬: start_date 오름차순 (null 은 뒤로). 사용자 드래그 순서가 있으면
  // customOrder 를 우선 적용. 검색 중이면 날짜순 유지(드래그 비활성).
  const ordered = useMemo(() => {
    if (search.trim() || customOrder.length === 0) {
      return [...filtered].sort((a, b) => {
        const aHas = !!a.start_date;
        const bHas = !!b.start_date;
        if (aHas && bHas) return a.start_date!.localeCompare(b.start_date!);
        if (aHas) return -1;
        if (bHas) return 1;
        return a.title.localeCompare(b.title);
      });
    }
    const orderMap = new Map(customOrder.map((id, i) => [id, i]));
    return [...filtered].sort((a, b) => {
      const ai = orderMap.has(a.id) ? orderMap.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const bi = orderMap.has(b.id) ? orderMap.get(b.id)! : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      const aHas = !!a.start_date;
      const bHas = !!b.start_date;
      if (aHas && bHas) return a.start_date!.localeCompare(b.start_date!);
      if (aHas) return -1;
      if (bHas) return 1;
      return a.title.localeCompare(b.title);
    });
  }, [filtered, customOrder, search]);

  const dragEnabled = !search.trim();

  /**
   * 여행 계획의 task → 달력 일정 변환. 시간 규칙은 calendar-sync.ts buildCalendarEvents 참조
   * (출발지 stored / 도착지 체인 계산 / 체류 양수일 때만 종료시간).
   */
  const buildCalendarEventsFromPlan = async (plan: TravelPlan) => {
    if (!plan.start_date) {
      toast.error("계획에 시작일이 없습니다. 먼저 시작일을 설정해주세요.");
      return null;
    }
    const { data: tasks, error } = await supabase
      .from("travel_plan_tasks")
      .select("*")
      .eq("plan_id", plan.id);
    if (error || !tasks || tasks.length === 0) {
      toast.error(tasks && tasks.length === 0 ? "추가할 일정이 없습니다" : "일정 조회 실패");
      return null;
    }
    // 카테고리 색상 룩업.
    let categoryColors: Record<string, string> = {};
    if (userId) {
      const { data: cats } = await supabase
        .from("travel_categories")
        .select("name, color")
        .eq("user_id", userId);
      if (cats) {
        categoryColors = Object.fromEntries(
          (cats as { name: string; color: string }[]).map((c) => [c.name, c.color]),
        );
      }
    }
    const built = buildCalendarEvents({
      plan,
      tasks: tasks as TravelPlanTask[],
      categoryColors,
      userId,
    });
    return built; // null 또는 { count, events }
  };

  const requestAddToCalendar = async (plan: TravelPlan) => {
    const result = await buildCalendarEventsFromPlan(plan);
    if (!result) return;
    setAddToCalState({ plan, tasks: result });
  };

  const confirmAddToCalendar = async () => {
    if (!addToCalState) return;
    setAddToCalLoading(true);
    const { error } = await supabase
      .from("calendar_events")
      .insert(addToCalState.tasks.events);
    if (error) {
      // plan_id 컬럼 없는 구버전 DB 폴백 — 컬럼 빼고 재삽입.
      const fallback = addToCalState.tasks.events.map((e) => {
        const { plan_id: _omit, ...rest } = e as { plan_id?: unknown } & Record<string, unknown>;
        void _omit;
        return rest;
      });
      const retry = await supabase.from("calendar_events").insert(fallback);
      setAddToCalLoading(false);
      if (retry.error) {
        toast.error("달력 추가 실패: " + translateError(retry.error.message));
      } else {
        toast.success(`${addToCalState.tasks.count}개 일정을 달력에 추가했습니다`);
      }
      setAddToCalState(null);
      return;
    }
    setAddToCalLoading(false);
    toast.success(`${addToCalState.tasks.count}개 일정을 달력에 추가했습니다`);
    setAddToCalState(null);
    refreshPlansWithEvents();
  };

  // "달력에서 삭제" — 이 plan 으로부터 추가했던 calendar_events 일괄 삭제.
  const [removeFromCalState, setRemoveFromCalState] = useState<
    | { plan: TravelPlan; count: number }
    | null
  >(null);
  const [removeLoading, setRemoveLoading] = useState(false);
  // 이 사용자가 "달력에 추가" 한 적 있는 plan 들의 ID 집합. 메뉴에 "달력에서 삭제" 노출 여부.
  const [plansWithCalEvents, setPlansWithCalEvents] = useState<Set<string>>(new Set());

  const refreshPlansWithEvents = async () => {
    const { data, error } = await supabase
      .from("calendar_events")
      .select("plan_id")
      .not("plan_id", "is", null);
    if (error) return; // plan_id 컬럼 없는 구 DB → 빈 set 유지 → 메뉴도 안 보임
    setPlansWithCalEvents(
      new Set((data as { plan_id: string | null }[]).map((e) => e.plan_id).filter((x): x is string => !!x)),
    );
  };
  useEffect(() => {
    refreshPlansWithEvents();
  }, []);

  const requestRemoveFromCalendar = async (plan: TravelPlan) => {
    const { count, error } = await supabase
      .from("calendar_events")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", plan.id);
    if (error) {
      // plan_id 컬럼 없으면 DB 마이그 안 된 상태.
      toast.error("DB 마이그레이션 필요: calendar_events.plan_id 컬럼");
      return;
    }
    if (!count || count === 0) {
      toast.message("이 계획에서 추가한 일정이 없습니다");
      return;
    }
    setRemoveFromCalState({ plan, count });
  };

  const confirmRemoveFromCalendar = async () => {
    if (!removeFromCalState) return;
    setRemoveLoading(true);
    const { error } = await supabase
      .from("calendar_events")
      .delete()
      .eq("plan_id", removeFromCalState.plan.id);
    setRemoveLoading(false);
    if (error) {
      toast.error("달력에서 삭제 실패: " + translateError(error.message));
    } else {
      toast.success(`${removeFromCalState.count}개 일정을 달력에서 삭제했습니다`);
    }
    setRemoveFromCalState(null);
    refreshPlansWithEvents();
  };

  const handleDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = ordered.map((p) => p.id);
    const oldIdx = ids.indexOf(e.active.id as string);
    const newIdx = ids.indexOf(e.over.id as string);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(ids, oldIdx, newIdx);
    // customOrder 에 현재 필터 외 항목 보존
    const currentSet = new Set(ids);
    const preserved = customOrder.filter((id) => !currentSet.has(id));
    const next = [...reordered, ...preserved];
    for (const id of ids) if (!next.includes(id)) next.push(id);
    setCustomOrder(next);
  };

  return (
    // 모바일: 부모(main) 이 fixed h-dvh 내부 스크롤이므로 h-full + flex 체인 유지.
    // 데스크탑: document 스크롤이므로 h/overflow 제거, 자연 흐름.
    <div className="flex flex-col h-full md:h-auto w-full md:max-w-5xl md:mx-auto">
      {/* 상단 검색 + 새 계획 추가 — sticky. 패딩은 페이지 wrapper(px-2 py-2 md:p-6)
          가 책임지고 sticky 자체는 padding 없음 (이전엔 p-3 가 중복 적용돼 다른
          페이지보다 12~24px 더 들어갔음). 스크롤 시 가시성을 위한 backdrop 만 유지. */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur pb-3">
        <div className="flex flex-col gap-2">
          <ListToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="계획 제목·날짜 검색"
            filterCount={showVisited ? 0 : 1}
            onAdd={() => setNewOpen(true)}
          >
            <button
              type="button"
              onClick={() => updateShowVisited(!showVisited)}
              className={`flex items-center gap-1 shrink-0 rounded-md border px-2.5 h-8 text-[11px] transition-colors ${
                showVisited
                  ? "border-primary text-primary bg-primary/10"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              <Check className="h-3 w-3" />
              가본 곳 포함
            </button>
          </ListToolbar>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pt-3 md:flex-none md:overflow-visible">
        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-8">불러오는 중…</p>
        ) : ordered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
            <p className="text-sm text-muted-foreground">
              {plans.length === 0
                ? "아직 계획이 없습니다"
                : "검색 결과가 없습니다"}
            </p>
            {plans.length === 0 && (
              <p className="text-xs text-muted-foreground/70">
                검색창 옆 추가 버튼을 눌러 첫 여행 계획을 세워보세요
              </p>
            )}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={ordered.map((p) => p.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {ordered.map((p) => (
                  <PlanCard
                    key={p.id}
                    plan={p}
                    dragEnabled={dragEnabled}
                    hasCalendarEvents={plansWithCalEvents.has(p.id)}
                    onSelect={() => onSelectPlan(p.id)}
                    onDelete={() => setDeletingId(p.id)}
                    onDuplicate={async () => {
                      await duplicatePlan(p.id);
                    }}
                    onAddToCalendar={() => requestAddToCalendar(p)}
                    onRemoveFromCalendar={() => requestRemoveFromCalendar(p)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <PromptDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        title="새 여행 계획"
        placeholder="예: 제주 4박5일"
        confirmLabel="만들기"
        onConfirm={async (title) => {
          const { data } = await addPlan({ title });
          if (data) onSelectPlan(data.id);
        }}
      />

      <ConfirmDialog
        open={!!deletingId}
        onOpenChange={(o) => {
          if (!o) setDeletingId(null);
        }}
        title="여행 계획 삭제"
        description="계획 안의 모든 일정도 함께 삭제됩니다."
        confirmLabel="삭제"
        destructive
        onConfirm={async () => {
          if (deletingId) await deletePlan(deletingId);
          setDeletingId(null);
        }}
      />

      <ConfirmDialog
        open={!!addToCalState}
        onOpenChange={(o) => {
          if (!o && !addToCalLoading) setAddToCalState(null);
        }}
        title={addToCalState ? `"${addToCalState.plan.title}"을 달력에 추가` : "달력에 추가"}
        description={
          addToCalState ? (
            <span className="block">
              일정: {formatPlanRange(addToCalState.plan)}
            </span>
          ) : null
        }
        confirmLabel={addToCalLoading ? "추가 중..." : "추가"}
        onConfirm={confirmAddToCalendar}
      />

      <ConfirmDialog
        open={!!removeFromCalState}
        onOpenChange={(o) => {
          if (!o && !removeLoading) setRemoveFromCalState(null);
        }}
        title={
          removeFromCalState
            ? `"${removeFromCalState.plan.title}"을 달력에서 삭제`
            : "달력에서 삭제"
        }
        description={
          removeFromCalState ? (
            <span className="block space-y-1">
              <span className="block">
                일정: {formatPlanRange(removeFromCalState.plan)}
              </span>
              <span className="block text-xs text-muted-foreground/70">
                {removeFromCalState.count}개 일정이 달력에서 삭제됩니다
              </span>
            </span>
          ) : null
        }
        confirmLabel={removeLoading ? "삭제 중..." : "삭제"}
        destructive
        onConfirm={confirmRemoveFromCalendar}
      />
    </div>
  );
}

/** "2026-04-24" → "4/24". null 이면 "-". 시작·종료 같으면 단일. */
function formatPlanRange(plan: TravelPlan): string {
  const fmt = (s: string | null | undefined) =>
    s ? `${parseInt(s.slice(5, 7))}/${parseInt(s.slice(8, 10))}` : "-";
  const a = fmt(plan.start_date);
  const b = fmt(plan.end_date);
  if (a === "-" && b === "-") return "기간 미정";
  if (b === "-" || a === b) return a;
  return `${a} ~ ${b}`;
}

/** 카드 본문의 기간 표시 — 풀 ISO 날짜 + 일수.
 *  - 둘 다 null: "기간 미정"
 *  - 시작만 (또는 시작=종료): "YYYY-MM-DD (1일)" — ~ 안 붙음
 *  - 끝만: "YYYY-MM-DD (1일)" — 동일 처리
 *  - 둘 다 (다른 날): "YYYY-MM-DD ~ YYYY-MM-DD (N일)" (N = end-start+1) */
function formatPlanPeriod(start: string | null, end: string | null): string {
  if (!start && !end) return "기간 미정";
  // 한쪽만 있거나 양쪽이 같으면 1일짜리 여행
  if (!start || !end || start === end) {
    return `${start ?? end} (1일)`;
  }
  const days = daysBetween(start, end) + 1;
  return `${start} ~ ${end} (${days}일)`;
}
