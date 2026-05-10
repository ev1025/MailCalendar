"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { parseYmd } from "@/lib/date-utils";
import { ArrowUp, Filter, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import FilterPanel from "@/components/ui/filter-panel";
import SearchInput from "@/components/ui/search-input";
import WeatherIcon from "./weather-icon";
import type { CalendarEvent, EventTag, WeatherData } from "@/types";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

interface DatabaseViewProps {
  events: CalendarEvent[];
  weatherMap: Record<string, WeatherData>;
  tags: EventTag[];
  /** 첫 fetch 중일 때 true — empty state 플래시 방지. */
  loading?: boolean;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (id: string) => void;
}

type SortField = "date" | "title" | "tag";
type SortDir = "asc" | "desc";
type SortKey = { field: SortField; dir: SortDir };

function parseDay(dateStr: string) {
  const d = parseYmd(dateStr);
  return {
    month: d.getMonth() + 1,
    day: d.getDate(),
    weekday: format(d, "EEE", { locale: ko }),
    dow: d.getDay(),
  };
}

// 정렬 비교 함수 — 컴포넌트 외부로 끌어올려 useMemo 종속성에서 안정 보장.
function cmpByField(a: CalendarEvent, b: CalendarEvent, field: SortField): number {
  if (field === "date") return a.start_date.localeCompare(b.start_date);
  if (field === "title") return a.title.localeCompare(b.title);
  return (a.tag || "").localeCompare(b.tag || "");
}

export default function DatabaseView({
  events,
  weatherMap,
  tags: tagList,
  loading = false,
  onEdit,
  onDelete,
}: DatabaseViewProps) {
  // tagList 가 안 바뀌면 같은 reference 유지 — 매 렌더 reduce 회피.
  const tagColorMap = useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const t of tagList) m[t.name] = t.color;
    return m;
  }, [tagList]);

  // 검색 입력은 즉시 반영(input 반응성), filter 는 300ms debounce 로 200+ 이벤트
  // 시 매 keystroke filter/sort 회피.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const [sortKeys, setSortKeys] = useState<SortKey[]>([]);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [tagFilterOpen, setTagFilterOpen] = useState(false);

  // 초기에는 빈 배열 → CSS auto/1%로 컨텐츠 너비 자동 맞춤
  // 첫 드래그 시 실제 px 너비 측정 → fixed 모드로 전환
  const [colWidths, setColWidths] = useState<number[]>([]);
  const [isResizing, setIsResizing] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);
  const resizingCol = useRef<number | null>(null);
  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);


  // 이벤트 수 200+ 시 매 렌더마다 O(n) 처리 — events 변경 시에만 재계산.
  const allTags = useMemo<string[]>(
    () => [
      ...new Set(
        events
          .map((e) => e.tag)
          .filter(Boolean)
          .flatMap((t) => t!.split(",")),
      ),
    ],
    [events],
  );

  // 3단계 사이클 + 다중 정렬
  // 미선택 → 오름차순 추가 → 내림차순 → 정렬 해제(리스트에서 제거)
  // 여러 컬럼을 순서대로 누르면 우선순위에 맞춰 다중정렬
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

  // 정렬 활성 시 화살표는 ArrowUp 한 종류만 쓰고 desc 일 때 180° rotate transition.
  // (ArrowDown 으로 교체하면 enter/exit 가 뚝 끊김.) 기준 색은 primary 로 일관.
  const SortIcon = ({ field }: { field: SortField }) => {
    const idx = sortKeys.findIndex((k) => k.field === field);
    if (idx === -1) return null;
    const k = sortKeys[idx];
    return (
      <span className="inline-flex items-center ml-0.5 text-primary">
        <ArrowUp
          className={`h-3 w-3 transition-transform duration-200 ${
            k.dir === "desc" ? "rotate-180" : "rotate-0"
          }`}
        />
        {sortKeys.length > 1 && (
          <span className="ml-0.5 text-[10px] tabular-nums font-semibold text-primary">{idx + 1}</span>
        )}
      </span>
    );
  };

  // 헤더 active 판정 — 정렬 적용된 컬럼만 굵기·색 강조.
  const isSortActive = useCallback(
    (field: SortField | null) => !!field && sortKeys.some((k) => k.field === field),
    [sortKeys],
  );

  const onResizeStart = useCallback((colIdx: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    let currentWidths = colWidths;

    // 최초 리사이즈: 현재 렌더링된 실제 너비 측정 → 상태 저장
    if (currentWidths.length === 0 && tableRef.current) {
      const ths = Array.from(tableRef.current.querySelectorAll("thead th"));
      currentWidths = ths.map((th) => th.getBoundingClientRect().width);
      setColWidths(currentWidths);
    }

    resizingCol.current = colIdx;
    resizeStartX.current = e.clientX;
    resizeStartW.current = currentWidths[colIdx];
    setIsResizing(true);

    const onMove = (ev: MouseEvent) => {
      if (resizingCol.current === null) return;
      const diff = ev.clientX - resizeStartX.current;
      setColWidths((prev) => {
        const next = [...prev];
        next[resizingCol.current!] = Math.max(60, resizeStartW.current + diff);
        return next;
      });
    };
    const onUp = () => {
      resizingCol.current = null;
      setIsResizing(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [colWidths]);


  // events·필터·정렬 입력이 안 바뀌면 결과 재사용 — 컬럼 폭 드래그 등 다른
  // state 변경 시 불필요한 filter/sort 회피 (200+ 이벤트 시 체감 차이).
  const filtered = useMemo(
    () =>
      events
        .filter((ev) => {
          if (filterTags.length > 0) {
            if (!ev.tag) return false;
            const evTags = ev.tag.split(",");
            if (!filterTags.every((ft) => evTags.includes(ft))) return false;
          }
          if (!search.trim()) return true;
          const q = search.trim().toLowerCase();
          return (
            ev.title.toLowerCase().includes(q) ||
            (ev.description || "").toLowerCase().includes(q) ||
            (ev.tag || "").toLowerCase().includes(q)
          );
        })
        .sort((a, b) => {
          for (const k of sortKeys) {
            const cmp = cmpByField(a, b, k.field) * (k.dir === "asc" ? 1 : -1);
            if (cmp !== 0) return cmp;
          }
          return sortKeys.length === 0 ? a.start_date.localeCompare(b.start_date) : 0;
        }),
    [events, filterTags, search, sortKeys],
  );

  const columns = [
    { label: "날짜", field: "date" as SortField },
    { label: "날씨", field: null },
    { label: "제목", field: "title" as SortField },
    { label: "태그", field: "tag" as SortField },
  ];

  return (
    // 모바일·데스크톱 모두 부모(calendar-md-height) 가 height 정의 — 자체 내부 스크롤.
    // 이전엔 모바일 자연 스크롤 의도였으나 부모 컨테이너의 overflow-hidden 으로
    // 잘림 발생 → 양쪽 모두 h-full + flex-1 + overflow-auto 통일.
    <div className="flex flex-col gap-3 w-full h-full min-h-0 md:max-w-5xl md:mx-auto">
      {/* 검색 + 태그 필터 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <SearchInput value={searchInput} onChange={setSearchInput} size="md" />
          {allTags.length > 0 && (
            <div
              className={`flex items-center shrink-0 rounded-md border h-9 text-xs transition-colors ${
                filterTags.length > 0 ? "border-primary text-primary bg-primary/10" : "text-muted-foreground"
              }`}
            >
              <button
                type="button"
                data-filter-btn
                onClick={() => setTagFilterOpen((o) => !o)}
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
                  className="flex h-full w-7 items-center justify-center border-l border-primary/30 hover:bg-foreground/10 rounded-r-md"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>
        {/* 태그 필터 패널 — 바깥 클릭 시 자동 닫힘 */}
        <FilterPanel
          open={tagFilterOpen && allTags.length > 0}
          items={allTags}
          selected={filterTags}
          colorOf={(t) => tagColorMap[t] || "#6B7280"}
          onToggle={(t) =>
            setFilterTags((prev) =>
              prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
            )
          }
          onClear={() => setFilterTags([])}
          onClose={() => setTagFilterOpen(false)}
        />
      </div>

      {loading ? (
        <div className="py-20" aria-hidden />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <p className="text-sm text-muted-foreground">
            {search || filterTags.length > 0
              ? "검색 결과가 없습니다"
              : "이 달의 일정이 없습니다"}
          </p>
          {(search || filterTags.length > 0) ? (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                setSearch("");
                setFilterTags([]);
              }}
              className="text-xs text-info hover:underline"
            >
              필터 해제하기
            </button>
          ) : (
            <p className="text-xs text-muted-foreground/70 break-keep">
              달력 뷰에서 날짜를 눌러 일정을 추가해보세요
            </p>
          )}
        </div>
      ) : (
        <div className={`flex-1 min-h-0 overflow-auto ${isResizing ? "select-none cursor-col-resize" : ""}`}>
          <div className="rounded-lg border">
          <table
            ref={tableRef}
            className="w-full border-collapse"
            style={{ tableLayout: colWidths.length > 0 ? "fixed" : "auto" }}
          >
            <colgroup>
              {[0, 1, 2, 3].map((idx) => {
                const isFlexible = idx === 2; // 제목
                const widthStyle = colWidths.length > 0
                  ? (isFlexible ? "auto" : `${colWidths[idx]}px`)
                  : (isFlexible ? "auto" : "1%");
                return <col key={idx} style={{ width: widthStyle }} />;
              })}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm text-[11px] text-muted-foreground shadow-[0_1px_0_var(--border)]">
              <tr>
                {columns.map((col, idx) => {
                  const active = isSortActive(col.field);
                  return (
                  <th
                    key={col.label}
                    className={`relative text-left px-2 py-1.5 border-b border-r last:border-r-0 select-none whitespace-nowrap transition-colors ${
                      col.field ? "cursor-pointer hover:bg-accent/40" : ""
                    } ${active ? "text-primary font-semibold bg-primary/5" : "font-medium"}`}
                    onClick={col.field ? () => cycleSort(col.field!) : undefined}
                  >
                    {col.field ? (
                      <div className="flex items-center pr-3">
                        {col.label} <SortIcon field={col.field} />
                      </div>
                    ) : (
                      <span>{col.label}</span>
                    )}
                    <div
                      className="absolute right-0 top-0 bottom-0 w-[6px] -mr-[3px] z-20 cursor-col-resize hover:bg-primary/40 active:bg-primary/60 touch-none"
                      onMouseDown={(e) => { e.stopPropagation(); onResizeStart(idx, e); }}
                    />
                  </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
              {filtered.map((ev) => (
                <motion.tr
                  key={ev.id}
                  layout="position"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 16 }}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  className="cursor-pointer hover:bg-accent/50 transition-colors border-b last:border-b-0"
                  onClick={() => onEdit(ev)}
                >
                  {/* 날짜 — 4/15(수) ~ 4/17(금). 일=빨강, 토=파랑 (한국 달력 관례). */}
                  <td className="px-2 py-1.5 border-r whitespace-nowrap overflow-hidden">
                    {(() => {
                      const s = parseDay(ev.start_date);
                      const e = ev.end_date && ev.end_date !== ev.start_date ? parseDay(ev.end_date) : null;
                      const dowColor = (dow: number) =>
                        dow === 0
                          ? "text-red-500 dark:text-red-400"
                          : dow === 6
                            ? "text-blue-500 dark:text-blue-400"
                            : "text-foreground";
                      return (
                        <span className="text-[10px] tabular-nums">
                          <span className={dowColor(s.dow)}>
                            {s.month}/{s.day}({s.weekday})
                          </span>
                          {e && (
                            <>
                              <span className="text-foreground"> ~ </span>
                              <span className={dowColor(e.dow)}>
                                {e.month}/{e.day}({e.weekday})
                              </span>
                            </>
                          )}
                        </span>
                      );
                    })()}
                  </td>
                  {/* 날씨 — 아이콘 위 / 온도 아래 스택 */}
                  <td className="px-1 py-1.5 border-r overflow-hidden min-w-0">
                    {weatherMap[ev.start_date] ? (
                      <WeatherIcon weather={weatherMap[ev.start_date]} compact />
                    ) : (
                      <span className="text-[11px] text-muted-foreground/40">-</span>
                    )}
                  </td>
                  {/* 제목 */}
                  <td className="px-2 py-1.5 border-r overflow-hidden min-w-0">
                    <div className="text-[11px] font-medium truncate">{ev.title}</div>
                  </td>
                  {/* 태그 */}
                  <td className="px-2 py-1.5 overflow-hidden min-w-0">
                    <div className="flex gap-1 overflow-hidden whitespace-nowrap">
                      {ev.tag ? ev.tag.split(",").map((t) => (
                        <Badge key={t} className="text-[10px] h-4 font-normal px-1.5 py-0 shrink-0" style={{ backgroundColor: (tagColorMap[t] || "#6B7280") + "20", color: tagColorMap[t] || "#6B7280", borderColor: (tagColorMap[t] || "#6B7280") + "40" }}>
                          {t}
                        </Badge>
                      )) : <span className="text-[11px] text-muted-foreground/40">-</span>}
                    </div>
                  </td>
                </motion.tr>
              ))}
              </AnimatePresence>
            </tbody>
          </table>
          </div>
        </div>
      )}

    </div>
  );
}
