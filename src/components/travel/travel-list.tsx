"use client";

import { memo, useState, useEffect } from "react";
import { Plus, Trash2, CalendarPlus, Check, ArrowUp, ArrowDown, Filter, X, Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import RowActionPopover from "@/components/ui/row-action-popover";
import FilterPanel from "@/components/ui/filter-panel";
import SearchInput from "@/components/ui/search-input";
import TravelForm from "./travel-form";
import TravelToCalendarDialog from "./travel-to-calendar-dialog";
import AddToPlanDialog from "./add-to-plan-dialog";
import { useTravelItems } from "@/hooks/use-travel-items";
import { useTravelTags } from "@/hooks/use-travel-tags";
import { useTravelCategories } from "@/hooks/use-travel-categories";
import { useEventTags } from "@/hooks/use-event-tags";
import { toast } from "sonner";
import type { TravelItem, CalendarEvent } from "@/types";
import {
  DndContext,
  closestCenter,
  PointerSensor,
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
import { toDragProps } from "@/lib/dnd-types";

const ORDER_KEY = "travel_list_custom_order";

function loadCustomOrder(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomOrder(ids: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ORDER_KEY, JSON.stringify(ids));
}

type SortField = "title" | "category" | "region" | "tag" | "month";
type SortDir = "asc" | "desc";
type SortKey = { field: SortField; dir: SortDir };

// hook 의 DEFAULT_COLORS 와 동일해야 함 — 카테고리 색이 표시 컴포넌트와 어긋나지 않게.
// hook 이 우선이고 이 맵은 fallback 용 (사용자 정의 색 없을 때).
const CATEGORY_COLORS: Record<string, string> = {
  자연: "#22C55E",
  숙소: "#A855F7",
  식당: "#F50B0B",
  놀거리: "#3B82F6",
  데이트: "#EC4899",
  공연: "#E1D04E",
  쇼핑: "#06B6D4",
};

interface TravelRowProps {
  item: TravelItem;
  tagColorMap: Record<string, string>;
  categoryColors: Record<string, string>;
  dragEnabled: boolean;
  onEdit: () => void;
  onToggleVisited: () => void;
  onAddToCalendar: () => void;
  onAddToPlan: () => void;
  onDelete: () => void;
}

// TravelRow 는 자주 리렌더되는 큰 리스트 항목 — memo 로 props 변경 없을 땐 스킵.
// (visibleUserIds 토글·필터 변경 시 부모만 리렌더되는 일이 많음)
const TravelRow = memo(function TravelRow({
  item,
  tagColorMap,
  categoryColors,
  dragEnabled,
  onEdit,
  onToggleVisited,
  onAddToCalendar,
  onAddToPlan,
  onDelete,
}: TravelRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, disabled: !dragEnabled });
  const dragProps = toDragProps<HTMLElement>({ attributes, listeners });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  // 사용자 정의 분류는 categoryColors 에 있고, 기본 5개는 CATEGORY_COLORS 에 있어 둘 다 탐색.
  const color = categoryColors[item.category] || CATEGORY_COLORS[item.category] || "#6B7280";

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`hover:bg-accent/50 transition-colors border-b last:border-b-0 cursor-pointer ${item.visited ? "opacity-60" : ""}`}
      onClick={onEdit}
    >
      {/* 왼쪽 드래그 핸들 + 액션 팝오버 — 너비·여백 최소화로 본문 영역 확보. */}
      <td className="px-0 py-1 border-r whitespace-nowrap w-6 align-middle" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-center">
          <RowActionPopover
            triggerLabel="행 메뉴"
            dragAttributes={dragEnabled ? dragProps.attributes : undefined}
            dragListeners={dragEnabled ? dragProps.listeners : undefined}
            items={[
              {
                icon: <Check className="h-3.5 w-3.5" />,
                iconClassName: "text-finance-gain",
                label: item.visited ? "가본 곳 해제" : "가본 곳으로 표시",
                textClassName: item.visited ? "text-finance-gain" : undefined,
                onClick: onToggleVisited,
              },
              {
                icon: <CalendarPlus className="h-3.5 w-3.5 text-blue-600" />,
                label: "달력에 추가",
                onClick: onAddToCalendar,
              },
              {
                icon: <Route className="h-3.5 w-3.5 text-purple-600" />,
                label: "계획에 추가",
                onClick: onAddToPlan,
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
      </td>
      {/* 제목 */}
      <td className="px-2 py-1 md:py-2 border-r overflow-hidden align-middle">
        <span className="text-[11px] font-medium truncate block">{item.title}</span>
      </td>
      {/* 분류 — Badge 를 flex items-center 로 감싸 다른 cell 들과 세로 정렬 통일.
          이전엔 Badge 만 직접 자식이라 td 의 baseline 정렬에 끌려가 살짝 떠 보였음. */}
      <td className="px-2 py-1 md:py-2 border-r whitespace-nowrap align-middle">
        <div className="flex items-center">
          <Badge variant="outline" className="text-[10px] h-4 px-1.5" style={{ borderColor: color + "60", color }}>
            {item.category}
          </Badge>
        </div>
      </td>
      {/* 시기 */}
      <td className="px-2 py-1 md:py-2 border-r text-[11px] text-muted-foreground whitespace-nowrap align-middle">
        {item.month ? `${item.month}월` : "-"}
      </td>
      {/* 위치 — place_name 있으면 우선, 없으면 region */}
      <td className="px-2 py-1 md:py-2 border-r text-[11px] text-muted-foreground whitespace-nowrap align-middle">
        {item.place_name || item.region || "-"}
      </td>
      {/* 태그 */}
      <td className="px-2 py-1 md:py-2 whitespace-nowrap align-middle">
        <div className="flex items-center gap-1">
          {item.tag ? item.tag.split(",").map((t) => {
            const tc = tagColorMap[t] || "#6B7280";
            return (
              <Badge key={t} className="text-[10px] h-4 font-normal px-1.5 py-0 shrink-0" style={{ backgroundColor: tc + "20", color: tc, borderColor: tc + "40" }}>
                {t}
              </Badge>
            );
          }) : <span className="text-[11px] text-muted-foreground/40">-</span>}
        </div>
      </td>
    </tr>
  );
});

interface TravelListProps {
  onNavigateToMonth?: (year: number, month: number) => void;
  onAddEvent?: (event: Omit<CalendarEvent, "id" | "created_at">) => Promise<{ error: unknown }>;
  onAddEventTagToCalendar?: (name: string, color: string) => Promise<{ error: unknown }>;
  onDeleteCalendarEventsByTitleDate?: (title: string, date: string) => Promise<void>;
  /** 달력 상단에서 선택된 "볼 사용자들" — 여행 항목도 이 기준으로 필터 */
  visibleUserIds?: string[];
}

export default function TravelList({ onNavigateToMonth, onAddEvent, onAddEventTagToCalendar, onDeleteCalendarEventsByTitleDate, visibleUserIds }: TravelListProps = {}) {
  const { items, loading, addItem, updateItem, deleteItem, toggleVisited } = useTravelItems(visibleUserIds);
  // 공유 owner 의 태그까지 색상이 보이려면 visibleUserIds 전달.
  const { tags, addTag, deleteTag, updateTagColor } = useTravelTags(visibleUserIds);
  const { tags: eventTags, addTag: addEventTag, deleteTag: deleteEventTag, updateTagColor: updateEventTagColor, updateTagName: updateEventTagName, refetch: refetchEventTags } = useEventTags(visibleUserIds);

  const [search, setSearch] = useState("");
  const [showVisited, setShowVisited] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("travel_show_visited") !== "false";
  });
  const updateShowVisited = (v: boolean) => {
    setShowVisited(v);
    localStorage.setItem("travel_show_visited", String(v));
  };
  const [customOrder, setCustomOrder] = useState<string[]>([]);

  useEffect(() => {
    setCustomOrder(loadCustomOrder());
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [openFilter, setOpenFilter] = useState<"category" | "tag" | null>(null);
  const [sortKeys, setSortKeys] = useState<SortKey[]>([]);
  // 필터 토글 — 가본곳/분류/태그 필터 행의 노출 여부. 기본 false (숨김).
  const [filterOpen, setFilterOpen] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TravelItem | null>(null);
  const [calendarItem, setCalendarItem] = useState<TravelItem | null>(null);
  const [planItem, setPlanItem] = useState<TravelItem | null>(null);

  const tagColorMap: Record<string, string> = {};
  for (const t of tags) tagColorMap[t.name] = t.color;
  for (const t of eventTags) tagColorMap[t.name] = t.color;

  // 사용자 정의 분류 색상 맵 — 기본 5개 외의 분류에도 색상 반영.
  const { colors: categoryColors } = useTravelCategories();

  const allCategories = [...new Set(items.map((i) => i.category))];
  const allItemTags = [...new Set(items.flatMap((i) => i.tag ? i.tag.split(",") : []))];

  // 3단계 사이클 + 다중 정렬
  // 미선택 → 오름차순 추가 → 내림차순 → 정렬 해제(리스트에서 제거)
  const cycleSort = (field: SortField) => {
    setSortKeys((prev) => {
      const idx = prev.findIndex((k) => k.field === field);
      if (idx === -1) return [...prev, { field, dir: "asc" }];
      if (prev[idx].dir === "asc") {
        const next = [...prev];
        next[idx] = { field, dir: "desc" };
        return next;
      }
      return prev.filter((k) => k.field !== field);
    });
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    const idx = sortKeys.findIndex((k) => k.field === field);
    // 정렬되지 않은 열에는 화살표 숨김
    if (idx === -1) return null;
    const k = sortKeys[idx];
    return (
      <span className="inline-flex items-center ml-0.5">
        {k.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
        {sortKeys.length > 1 && (
          <span className="ml-0.5 text-[10px] tabular-nums font-semibold text-primary">{idx + 1}</span>
        )}
      </span>
    );
  };

  const hasActiveSortOrFilter =
    !!search.trim() ||
    filterCategories.length > 0 ||
    filterTags.length > 0 ||
    sortKeys.length > 0;

  const filteredBase = items.filter((item) => {
    if (!showVisited && item.visited) return false;
    if (filterCategories.length > 0 && !filterCategories.includes(item.category)) return false;
    // 태그 AND: 선택한 태그를 모두 가진 항목만 통과
    if (filterTags.length > 0) {
      if (!item.tag) return false;
      const itemTags = item.tag.split(",");
      if (!filterTags.every((ft) => itemTags.includes(ft))) return false;
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!item.title.toLowerCase().includes(q) && !(item.region || "").toLowerCase().includes(q) && !(item.tag || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const cmpByField = (a: TravelItem, b: TravelItem, field: SortField): number => {
    if (field === "title") return a.title.localeCompare(b.title);
    if (field === "category") return a.category.localeCompare(b.category);
    if (field === "region") return (a.region || "").localeCompare(b.region || "");
    if (field === "month") return (a.month ?? 99) - (b.month ?? 99);
    return (a.tag || "").localeCompare(b.tag || "");
  };

  const filtered = hasActiveSortOrFilter || customOrder.length === 0
    ? [...filteredBase].sort((a, b) => {
        for (const k of sortKeys) {
          const cmp = cmpByField(a, b, k.field) * (k.dir === "asc" ? 1 : -1);
          if (cmp !== 0) return cmp;
        }
        // 정렬 키가 없으면 제목 오름차순 기본
        return sortKeys.length === 0 ? a.title.localeCompare(b.title) : 0;
      })
    : (() => {
        const orderMap = new Map(customOrder.map((id, i) => [id, i]));
        return [...filteredBase].sort((a, b) => {
          const ai = orderMap.has(a.id) ? orderMap.get(a.id)! : Number.MAX_SAFE_INTEGER;
          const bi = orderMap.has(b.id) ? orderMap.get(b.id)! : Number.MAX_SAFE_INTEGER;
          if (ai !== bi) return ai - bi;
          return a.title.localeCompare(b.title);
        });
      })();

  const dragEnabled = !hasActiveSortOrFilter;

  const handleDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = filtered.map((i) => i.id);
    const oldIdx = ids.indexOf(e.active.id as string);
    const newIdx = ids.indexOf(e.over.id as string);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(ids, oldIdx, newIdx);
    // 전체 customOrder에 반영: filtered에 속하지 않은 id는 유지
    const filteredSet = new Set(ids);
    const preserved = customOrder.filter((id) => !filteredSet.has(id));
    const next = [...reordered, ...preserved];
    // 혹시 이번에 처음 보이는 아이템(customOrder에 없던)도 누락 없게 추가
    for (const id of ids) if (!next.includes(id)) next.push(id);
    setCustomOrder(next);
    saveCustomOrder(next);
  };

  const handleRemoveVisitedDate = async (itemId: string, date: string) => {
    const target = items.find((i) => i.id === itemId);
    if (!target || !target.visited_dates) return;
    const next = target.visited_dates.filter((d) => d !== date);
    await updateItem(itemId, {
      visited_dates: next.length > 0 ? next : null,
      visited: next.length > 0,
    });
    if (onDeleteCalendarEventsByTitleDate) {
      await onDeleteCalendarEventsByTitleDate(target.title, date);
    }
  };

  const handleAddToCalendar = async (date: string, endDate: string | null, startTime: string | null, endTime: string | null) => {
    if (!calendarItem) return;
    if (!onAddEvent) {
      toast.error("캘린더 추가 기능을 사용할 수 없습니다");
      return;
    }
    const meta = [
      calendarItem.month != null ? `🗓️ ${calendarItem.month}월` : null,
      calendarItem.region ? `📍 ${calendarItem.region}` : null,
    ].filter(Boolean).join("  ");
    const desc = [
      calendarItem.notes,
      meta || null,
    ].filter(Boolean).join("\n\n");

    // 여행/일정 태그를 캘린더 색상으로 표시하려면 event_tags에도 등록되어 있어야 함
    const itemTagNames = calendarItem.tag ? calendarItem.tag.split(",") : [];
    const existingEventTagNames = new Set(eventTags.map((t) => t.name));
    const travelTagColorMap: Record<string, string> = {};
    for (const t of tags) travelTagColorMap[t.name] = t.color;
    for (const name of itemTagNames) {
      if (!existingEventTagNames.has(name)) {
        const color = travelTagColorMap[name] || "#6B7280";
        if (onAddEventTagToCalendar) {
          await onAddEventTagToCalendar(name, color);
        } else {
          await addEventTag(name, color);
        }
      }
    }
    await refetchEventTags();

    const { error } = await onAddEvent({
      title: calendarItem.title,
      description: desc || null,
      start_date: date,
      end_date: endDate,
      start_time: startTime,
      end_time: endTime,
      color: calendarItem.color || CATEGORY_COLORS[calendarItem.category] || "#3B82F6",
      tag: calendarItem.tag,
      repeat: null,
    });
    if (error) {
      toast.error("캘린더 추가 실패");
      return;
    }

    const existingDates = calendarItem.visited_dates || [];
    const newDates = existingDates.includes(date) ? existingDates : [...existingDates, date].sort();
    await updateItem(calendarItem.id, { visited: true, visited_dates: newDates });

  };

  const columns = [
    { label: "", field: null },
    { label: "제목", field: "title" as SortField },
    { label: "분류", field: "category" as SortField },
    { label: "시기", field: "month" as SortField },
    { label: "위치", field: "region" as SortField },
    { label: "태그", field: "tag" as SortField },
  ];

  return (
    // 데스크톱에서 테이블이 화면 끝까지 뻗어 제목 열이 과하게 길어지는 걸 막기 위해
    // md+ 에서 최대 너비 제한 + 가운데 정렬. 모바일은 w-full 로 그대로.
    <div className="flex flex-col gap-3 w-full md:max-w-5xl md:mx-auto">
      {/* 상단 toolbar — [검색 | 필터 토글 | + 추가]. 필터 토글 active 시 아래에 sub-filter 행 노출. */}
      <div className="flex items-center gap-2">
        <SearchInput value={search} onChange={setSearch} className="flex-1 md:flex-none md:w-56" />
        {/* 필터 토글 — active 하위 필터 개수 badge 표시 (가본곳 OFF / 분류 / 태그 합계). */}
        {(() => {
          const activeCount =
            (showVisited ? 0 : 1) + filterCategories.length + filterTags.length;
          const isActive = filterOpen || activeCount > 0;
          return (
            <button
              type="button"
              onClick={() => setFilterOpen((o) => !o)}
              className={`flex items-center gap-1 shrink-0 rounded-md border px-2.5 h-8 text-[11px] transition-colors ${
                isActive
                  ? "border-primary text-primary bg-primary/10"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              <Filter className="h-3 w-3" />
              필터{activeCount > 0 && ` (${activeCount})`}
            </button>
          );
        })()}
        <Button size="sm" className="h-8 shrink-0" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          추가
        </Button>
      </div>

      {/* sub-filter 행 — 필터 토글 active 시에만 노출. 가본곳 포함 / 분류 / 태그. */}
      {filterOpen && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => updateShowVisited(!showVisited)}
            className={`flex items-center gap-1 shrink-0 rounded-md border px-2.5 h-8 text-[11px] transition-colors ${
              showVisited ? "border-primary text-primary bg-primary/10" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            <Check className="h-3 w-3" />
            가본 곳 포함
          </button>
          {allCategories.length > 0 && (
            <div
              className={`flex items-center shrink-0 rounded-md border h-8 text-[11px] transition-colors ${
                filterCategories.length > 0 ? "border-primary text-primary bg-primary/10" : "text-muted-foreground"
              }`}
            >
              <button
                type="button"
                data-filter-btn
                onClick={() => setOpenFilter((o) => (o === "category" ? null : "category"))}
                className="flex items-center gap-1 px-2.5 h-full hover:bg-accent/50 rounded-md"
              >
                <Filter className="h-3 w-3" />
                분류{filterCategories.length > 0 && ` (${filterCategories.length})`}
              </button>
              {filterCategories.length > 0 && (
                <button
                  type="button"
                  aria-label="분류 필터 초기화"
                  title="분류 필터 초기화"
                  onClick={() => setFilterCategories([])}
                  className="flex h-full w-6 items-center justify-center border-l border-primary/30 hover:bg-foreground/10 rounded-r-md"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
          {allItemTags.length > 0 && (
            <div
              className={`flex items-center shrink-0 rounded-md border h-8 text-[11px] transition-colors ${
                filterTags.length > 0 ? "border-primary text-primary bg-primary/10" : "text-muted-foreground"
              }`}
            >
              <button
                type="button"
                data-filter-btn
                onClick={() => setOpenFilter((o) => (o === "tag" ? null : "tag"))}
                className="flex items-center gap-1 px-2.5 h-full hover:bg-accent/50 rounded-md"
              >
                <Filter className="h-3 w-3" />
                태그{filterTags.length > 0 && ` (${filterTags.length})`}
              </button>
              {filterTags.length > 0 && (
                <button
                  type="button"
                  aria-label="태그 필터 초기화"
                  title="태그 필터 초기화"
                  onClick={() => setFilterTags([])}
                  className="flex h-full w-6 items-center justify-center border-l border-primary/30 hover:bg-foreground/10 rounded-r-md"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {/* 필터 패널 — 분류/태그 모두 같은 자리에서 교체 (바깥 클릭 시 자동 닫힘) */}
      <FilterPanel
        open={openFilter === "category" && allCategories.length > 0}
        items={allCategories}
        selected={filterCategories}
        colorOf={(c) => CATEGORY_COLORS[c] || "#6B7280"}
        onToggle={(c) =>
          setFilterCategories((prev) =>
            prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
          )
        }
        onClear={() => setFilterCategories([])}
        onClose={() => setOpenFilter(null)}
      />
      <FilterPanel
        open={openFilter === "tag" && allItemTags.length > 0}
        items={allItemTags}
        selected={filterTags}
        colorOf={(t) => tagColorMap[t] || "#6B7280"}
        onToggle={(t) =>
          setFilterTags((prev) =>
            prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
          )
        }
        onClear={() => setFilterTags([])}
        onClose={() => setOpenFilter(null)}
      />

      {loading ? (
        <div className="py-20" aria-hidden />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <p className="text-sm text-muted-foreground">
            {items.length === 0 ? "여행 항목이 없습니다" : "검색 결과가 없습니다"}
          </p>
          {items.length === 0 && (
            <p className="text-[11px] text-muted-foreground/60">+ 추가 버튼으로 시작하세요</p>
          )}
        </div>
      ) : (
        <div className="rounded-lg border max-h-[65vh] overflow-auto">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <table className="w-full border-collapse">
              <colgroup>
                <col style={{ width: "1%" }} />
                {/* 제목: 40%. 남는 공간은 태그 열(width 미지정) 이 자동 흡수. */}
                <col style={{ width: "40%" }} />
                <col style={{ width: "1%" }} />
                <col style={{ width: "1%" }} />
                <col style={{ width: "1%" }} />
                <col />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-muted text-[11px] text-muted-foreground">
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col.label || "grip"}
                      className={`text-left font-medium px-2 py-2 border-b border-r last:border-r-0 select-none whitespace-nowrap ${
                        col.field ? "cursor-pointer hover:bg-muted/60" : ""
                      }`}
                      onClick={col.field ? () => cycleSort(col.field!) : undefined}
                    >
                      {col.field ? (
                        <div className="flex items-center font-medium pr-2">
                          {col.label} <SortIcon field={col.field} />
                        </div>
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <SortableContext items={filtered.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                  {filtered.map((item) => (
                    <TravelRow
                      key={item.id}
                      item={item}
                      tagColorMap={tagColorMap}
                      categoryColors={categoryColors}
                      dragEnabled={dragEnabled}
                      onEdit={() => { setEditing(item); setFormOpen(true); }}
                      onToggleVisited={() => toggleVisited(item.id, item.visited)}
                      onAddToCalendar={() => setCalendarItem(item)}
                      onAddToPlan={() => setPlanItem(item)}
                      onDelete={() => deleteItem(item.id)}
                    />
                  ))}
                </SortableContext>
              </tbody>
            </table>
          </DndContext>
        </div>
      )}

      <TravelForm
        open={formOpen}
        onOpenChange={setFormOpen}
        item={editing ? items.find((i) => i.id === editing.id) ?? editing : null}
        tags={tags}
        eventTags={eventTags}
        onAddTag={addTag}
        onDeleteTag={deleteTag}
        onUpdateTagColor={updateTagColor}
        onAddEventTag={addEventTag}
        onDeleteEventTag={deleteEventTag}
        onUpdateEventTagColor={updateEventTagColor}
        onRenameEventTag={updateEventTagName}
        onNavigateToMonth={onNavigateToMonth}
        onRemoveVisitedDate={handleRemoveVisitedDate}
        onSave={async (data) => {
          if (editing) return await updateItem(editing.id, data);
          return await addItem(data);
        }}
      />

      <TravelToCalendarDialog
        open={!!calendarItem}
        onOpenChange={(o) => !o && setCalendarItem(null)}
        item={calendarItem}
        travelTags={tags}
        eventTags={eventTags}
        onAddToCalendar={handleAddToCalendar}
      />

      <AddToPlanDialog
        open={!!planItem}
        onOpenChange={(o) => !o && setPlanItem(null)}
        travelItem={planItem}
      />
    </div>
  );
}
