"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import ColorPickerPanel from "@/components/ui/color-picker";
import { useMediaQuery } from "@/lib/use-media-query";
import { useExclusiveBottomSheet } from "@/lib/dialog-stack";
import { Plus, X, Search, MoreHorizontal, ArrowLeft, Trash2 } from "lucide-react";
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

interface TagDef {
  id: string;
  name: string;
  color: string;
}

interface TagInputProps {
  selectedTags: string[];
  allTags: TagDef[];
  onChange: (tags: string[]) => void;
  onAddTag?: (name: string, color: string) => Promise<{ error: unknown }>;
  onDeleteTag?: (id: string) => Promise<{ error: unknown }>;
  onUpdateTagColor?: (id: string, color: string) => Promise<{ error: unknown }>;
  onRenameTag?: (id: string, name: string) => Promise<{ error: unknown }>;
  /** 삭제·이름변경 불가 기본 태그 id 목록 (편집 패널에서 해당 버튼 숨김) */
  builtinIds?: string[];
  /** 순서 저장 localStorage 키 (예: "tag-order:event-tags"). 지정 시 꾹눌러서 드래그로 재정렬 가능 */
  orderKey?: string;
  placeholder?: string;
}

function SortableTagRow({
  tag,
  isInputFocused,
  onSelect,
  onEdit,
}: {
  tag: TagDef;
  isInputFocused: () => boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: tag.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="flex items-center justify-between px-2 py-2 hover:bg-accent rounded cursor-grab active:cursor-grabbing"
      // 모바일 키보드 열린 상태 — mousedown 에서 즉시 onSelect 실행 + preventDefault 로
      // input blur 차단. click 까지 대기하면 viewport resize 로 다른 요소가 받음.
      // dnd-kit listeners 의 pointerdown 은 별개라 드래그 동작 영향 없음.
      onMouseDown={(e) => {
        if (isInputFocused()) e.preventDefault();
        onSelect();
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <Badge
        className="text-xs px-1.5 py-0"
        style={{ backgroundColor: tag.color + "20", color: tag.color, borderColor: tag.color + "40" }}
      >
        {tag.name}
      </Badge>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        onPointerDown={(e) => e.stopPropagation()}
        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50"
        aria-label={`${tag.name} 편집`}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </div>
  );
}

function loadTagOrder(key?: string): string[] {
  if (!key || typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn(`[tag-input] parse failed for "${key}":`, e);
    return [];
  }
}

function saveTagOrder(key: string, ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch (e) {
    console.warn(`[tag-input] write failed for "${key}":`, e);
  }
}

const TAG_COLORS = [
  "#EF4444", "#F97316", "#F59E0B", "#EAB308",
  "#84CC16", "#22C55E", "#10B981", "#14B8A6",
  "#06B6D4", "#0EA5E9", "#3B82F6", "#6366F1",
  "#8B5CF6", "#A855F7", "#D946EF", "#EC4899",
  "#F43F5E",
];

// 편집 뷰 프리셋 컬러 (기본 추천 동그라미)
const PRESET_COLORS = [
  "#6B7280", "#EF4444", "#F97316", "#F59E0B",
  "#EAB308", "#84CC16", "#22C55E", "#14B8A6",
  "#06B6D4", "#3B82F6", "#8B5CF6", "#EC4899",
];

function randomTagColor(): string {
  return TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
}

export default function TagInput({
  selectedTags,
  allTags,
  onChange,
  onAddTag,
  onDeleteTag,
  onUpdateTagColor,
  onRenameTag,
  builtinIds,
  orderKey,
  placeholder = "검색·추가",
}: TagInputProps) {
  const isBuiltin = (id: string) => !!builtinIds?.includes(id);

  // ── 꾹누르고 드래그해서 태그 순서 변경 ─────────────────────
  const [orderVersion, setOrderVersion] = useState(0);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 400, tolerance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 400, tolerance: 5 } })
  );
  // 저장된 순서 + 새로 추가된 태그(순서에 없는 것)를 뒤에 붙여 표시
  const sortedTags = useMemo(() => {
    if (!orderKey) return allTags;
    const savedIds = loadTagOrder(orderKey);
    if (savedIds.length === 0) return allTags;
    const byId = new Map(allTags.map((t) => [t.id, t]));
    const sorted: TagDef[] = [];
    for (const id of savedIds) {
      const t = byId.get(id);
      if (t) { sorted.push(t); byId.delete(id); }
    }
    sorted.push(...Array.from(byId.values()));
    return sorted;
    // orderVersion으로 순서 변경 시 재계산 유도
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTags, orderKey, orderVersion]);

  const handleDragEnd = (e: DragEndEvent) => {
    if (!orderKey || !e.over || e.active.id === e.over.id) return;
    const oldIdx = sortedTags.findIndex((t) => t.id === e.active.id);
    const newIdx = sortedTags.findIndex((t) => t.id === e.over!.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(sortedTags, oldIdx, newIdx);
    saveTagOrder(orderKey, reordered.map((t) => t.id));
    setOrderVersion((v) => v + 1);
  };
  const [open, setOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // 모바일 이중 발화 방지 — touchstart 직후 합성 mousedown/click 이 React passive
  // listener 라 preventDefault 가 안 먹혀 같은 핸들러가 2번 호출됨. lastTap 기록
  // 후 350ms 이내 호출은 무시해 단일 발화 보장.
  const lastTapRef = useRef(0);
  // 시트 내부 탭 직후 viewport resize 로 인한 false outside-click detect 차단용.
  // 내부 액션 발화 후 500ms 내 onOpenChange(false) 가 들어오면 무시 → 시트 유지.
  const justTappedInsideRef = useRef(0);
  // 키보드 가드 — 키보드 올라온 상태에서 비-allow-list 영역을 탭했을 때
  // 키보드 dismiss 후 합성 click 이 그 자리의 다른 element 를 활성화하던 문제.
  // 가드 발화 시 Date.now()+500 기록 → document-level click capture 가
  // 윈도우 내 click 을 cancelable 하면 모두 차단.
  const blockClickUntilRef = useRef(0);
  // 시트 본문 wrapper 의 DOM ref — native non-passive touchstart 리스너 부착용.
  // React 의 onTouchStartCapture 는 passive=true 라 preventDefault 가 no-op.
  // SheetContent 자체는 ref forward 안 되어 wrapper div 를 둠.
  const sheetBodyRef = useRef<HTMLDivElement>(null);
  const tap = (fn: () => void) => {
    const now = performance.now();
    if (now - lastTapRef.current < 350) return;
    lastTapRef.current = now;
    justTappedInsideRef.current = now;
    fn();
    // 액션 후 input 포커스 유지 — 키보드가 잠시 내려갔다 올라오는 깜빡임 회피.
    if (inputRef.current && document.activeElement !== inputRef.current) {
      // setTimeout 0 으로 다음 tick 에 포커스 (현재 tick 의 blur 처리 후).
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };
  // 데스크탑(md 이상)에서는 바텀시트 대신 트리거 아래 Popover 로 렌더
  const isDesktop = useMediaQuery("(min-width: 768px)");

  // ── 키보드 가드 (모바일 바텀시트 한정) ──
  // 키보드 올라온 상태에서 input/textarea/X 칩/+ 추가 외 영역을 탭하면
  // 키보드만 내리고 클릭은 차단. native non-passive 리스너 + document click capture
  // 두 단계로 보강 — preventDefault 가 효과 있는 환경에선 합성 click 이 발생 안 함.
  useEffect(() => {
    if (!open || isDesktop) return;
    const el = sheetBodyRef.current;
    if (!el) return;

    const isAllowedTarget = (target: HTMLElement | null) =>
      !!target?.closest(
        'input, textarea, [data-tag-action="x-chip"], [data-tag-action="add-new"]',
      );

    // 1) Native non-passive touchstart — preventDefault 로 합성 click 차단 시도.
    const onTouchStart = (e: TouchEvent) => {
      if (document.activeElement !== inputRef.current) return;
      if (isAllowedTarget(e.target as HTMLElement | null)) return;
      e.preventDefault();
      inputRef.current?.blur();
      blockClickUntilRef.current = Date.now() + 500;
    };
    el.addEventListener("touchstart", onTouchStart, { passive: false, capture: true });

    // 2) Document-level click capture — preventDefault 가 안 먹힌 환경 폴백.
    //    키보드 dismiss 후 layout shift 로 새 element 가 받게 되는 click 도 잡음.
    const onClickCapture = (e: MouseEvent) => {
      if (Date.now() >= blockClickUntilRef.current) return;
      if (isAllowedTarget(e.target as HTMLElement | null)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };
    document.addEventListener("click", onClickCapture, true);

    return () => {
      el.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [open, isDesktop]);

  // 모바일 바텀시트 single-instance — 분류/태그 동시에 두 개 열리지 않도록
  // (새로 열리는 시트가 이전 활성 시트를 자동으로 닫음)
  useExclusiveBottomSheet(!isDesktop && open, () => setOpen(false));

  // half (50%) ↔ full (90%) 스냅 포인트. resizes-content 환경에서 dvh 를
  // 쓰면 키보드 열릴 때 시트가 쪼그라드므로 열리는 시점의 innerHeight 를
  // px 로 캡처해 고정. currentVh 는 visualViewport 추적 — full snap + 키보드 시 상한 적용.
  const [snap, setSnap] = useState<"half" | "full">("half");
  const [baseHeight, setBaseHeight] = useState<number | null>(null);
  const [currentVh, setCurrentVh] = useState<number | null>(null);
  // 스냅 변경 시 250ms 동안만 transition-[height] 활성화
  const [snapAnimating, setSnapAnimating] = useState(false);
  const isFirstSnap = useRef(true);
  useEffect(() => {
    if (isFirstSnap.current) {
      isFirstSnap.current = false;
      return;
    }
    setSnapAnimating(true);
    const t = setTimeout(() => setSnapAnimating(false), 260);
    return () => clearTimeout(t);
  }, [snap]);

  // 뷰 전환: 목록 ↔ 개별 태그 편집
  const [view, setView] = useState<"list" | "edit">("list");
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const editingTag = editingTagId ? allTags.find((t) => t.id === editingTagId) : null;

  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [showColorPicker, setShowColorPicker] = useState(false);

  useEffect(() => {
    if (open) {
      setSnap("half");
      setView("list");
      setShowColorPicker(false);
      isFirstSnap.current = true; // 열 때마다 초기 스냅은 애니메이션 없이
      if (typeof window === "undefined") return;
      // 시트 높이 추적 — baseHeight 는 관찰된 최대, currentVh 는 실시간.
      const capture = () => {
        const vv = window.visualViewport?.height;
        const ih = window.innerHeight;
        setCurrentVh(vv ?? ih);
        const h = Math.max(ih, vv ?? 0);
        setBaseHeight((prev) => (prev == null ? h : Math.max(prev, h)));
      };
      capture();
      window.visualViewport?.addEventListener("resize", capture);
      window.addEventListener("orientationchange", capture);
      return () => {
        window.visualViewport?.removeEventListener("resize", capture);
        window.removeEventListener("orientationchange", capture);
      };
    } else {
      setBaseHeight(null);
      setCurrentVh(null);
      setNewTagName("");
      setEditingTagId(null);
    }
  }, [open]);

  const enterEdit = (t: TagDef) => {
    setEditingTagId(t.id);
    setEditName(t.name);
    setEditColor(t.color);
    setShowColorPicker(false);
    setView("edit");
  };

  const exitEdit = () => {
    setView("list");
    setEditingTagId(null);
    setShowColorPicker(false);
  };

  const saveEdit = async () => {
    if (!editingTag) { exitEdit(); return; }
    // 색상 변경
    if (editColor && editColor !== editingTag.color && onUpdateTagColor) {
      await onUpdateTagColor(editingTag.id, editColor);
    }
    // 이름 변경 (공백/동일명은 스킵)
    const trimmedName = editName.trim();
    if (
      trimmedName &&
      trimmedName !== editingTag.name &&
      onRenameTag
    ) {
      const { error } = await onRenameTag(editingTag.id, trimmedName);
      if (!error) {
        // 선택된 태그 목록에 구 이름이 있으면 새 이름으로 치환
        if (selectedTags.includes(editingTag.name)) {
          onChange(
            selectedTags.map((n) => (n === editingTag.name ? trimmedName : n))
          );
        }
      }
    }
    exitEdit();
  };

  const deleteCurrentTag = async () => {
    if (!editingTag || !onDeleteTag) return;
    await onDeleteTag(editingTag.id);
    onChange(selectedTags.filter((n) => n !== editingTag.name));
    exitEdit();
  };

  const toggleTag = (name: string) => {
    if (selectedTags.includes(name)) {
      onChange(selectedTags.filter((t) => t !== name));
    } else {
      onChange([...selectedTags, name]);
    }
  };

  const handleAdd = async () => {
    if (!newTagName.trim() || !onAddTag) return;
    const { error } = await onAddTag(newTagName.trim(), randomTagColor());
    if (!error) {
      onChange([...selectedTags, newTagName.trim()]);
      setNewTagName("");
    }
  };

  const handleEnter = () => {
    if (!newTagName.trim()) return;
    const existing = allTags.find((t) => t.name === newTagName.trim());
    if (existing) {
      if (!selectedTags.includes(existing.name)) toggleTag(existing.name);
      setNewTagName("");
    } else {
      handleAdd();
    }
  };

  const filtered = sortedTags.filter(
    (t) => !newTagName.trim() || t.name.toLowerCase().includes(newTagName.trim().toLowerCase())
  );
  // 검색 중일 때는 드래그 순서 변경 비활성화 (의미가 없고 혼란 방지)
  const dragEnabled = !!orderKey && !newTagName.trim();

  // ── 드래그: half ↔ full, 아래로 크게 끌면 close ──────────────
  //    이제는 시트 아무데서나 위/아래로 밀면 동작.
  //    단, 스크롤 영역 안에서 스크롤이 맨 위가 아닌데 아래로 밀면 → 스크롤 우선
  //    입력창(input/textarea) 위에서는 드래그 비활성화
  const dragStartY = useRef<number | null>(null);
  const dragStartSnap = useRef<"half" | "full">("half");
  const dragScrollEl = useRef<HTMLElement | null>(null);
  const dragCanceled = useRef(false);

  const onDragStart = (e: React.TouchEvent | React.PointerEvent) => {
    const target = (e.target as HTMLElement) || null;
    // 텍스트 입력 요소/버튼에선 드래그 시작 안 함
    if (target?.closest("input, textarea, button")) {
      dragStartY.current = null;
      return;
    }
    // 드래그 시작 시 키보드 내림 — viewport 리사이즈로 인한 좌표계 교란 방지
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const y = "touches" in e ? e.touches[0].clientY : e.clientY;
    dragStartY.current = y;
    dragStartSnap.current = snap;
    dragCanceled.current = false;
    dragScrollEl.current = target?.closest("[data-sheet-scroll]") as HTMLElement | null;
  };

  const onDragMove = (e: React.TouchEvent | React.PointerEvent) => {
    if (dragStartY.current === null || dragCanceled.current) return;
    const y = "touches" in e ? e.touches[0].clientY : e.clientY;
    const dy = y - dragStartY.current;
    // 스크롤 영역에서 아래로 끌고 있는데 스크롤이 위가 아니면 → 스크롤 우선 (드래그 취소)
    if (dragScrollEl.current && dy > 0 && dragScrollEl.current.scrollTop > 0) {
      dragCanceled.current = true;
      return;
    }
    // full 상태에서 위로는 더 이상 올라갈 공간 없음 → 스크롤 허용을 위해 취소
    if (dragStartSnap.current === "full" && dy < 0 && dragScrollEl.current) {
      dragCanceled.current = true;
      return;
    }
  };

  const onDragEnd = (e: React.TouchEvent | React.PointerEvent) => {
    const canceled = dragCanceled.current;
    dragCanceled.current = false;
    dragScrollEl.current = null;
    if (dragStartY.current === null || canceled) {
      dragStartY.current = null;
      return;
    }
    const y =
      "changedTouches" in e
        ? e.changedTouches[0].clientY
        : e.clientY;
    const dy = y - dragStartY.current;
    dragStartY.current = null;
    const T = 60;
    if (dragStartSnap.current === "half") {
      if (dy < -T) setSnap("full");
      else if (dy > T) setOpen(false);
    } else {
      // full
      if (dy > T * 3) setOpen(false);
      else if (dy > T) setSnap("half");
    }
  };

  // 시트 바깥에서 탭/스와이프로도 닫을 수 있게 — onOpenChange가 이를 처리함

  // 트리거 내부에 들어갈 컨텐츠 (모바일 button / 데스크탑 PopoverTrigger 공통)
  const triggerContent =
    selectedTags.length === 0 ? (
      <span className="flex items-center gap-1.5 text-muted-foreground px-1 whitespace-nowrap">
        <Search className="h-3 w-3 shrink-0" />
        {placeholder}
      </span>
    ) : (
      <>
        {selectedTags.map((name) => {
          const t = allTags.find((x) => x.name === name);
          const color = t?.color || "#6B7280";
          return (
            <Badge
              key={name}
              className="text-xs px-1.5 py-0"
              style={{ backgroundColor: color + "20", color, borderColor: color + "40" }}
            >
              {name}
            </Badge>
          );
        })}
      </>
    );

  // Input 컴포넌트와 동일 룩으로 통일 — 같은 폼 안에서 Input/Select/TagInput 모두
  // 같은 높이·라운드·테두리 톤으로 보이도록.
  // 트리거 폰트는 text-xs (12px) — 내부 chip Badge 이 text-xs 라 일관성 유지 +
  // 좁은 컬럼(예: 3-col 그리드의 1fr)에서 placeholder "검색·추가" 줄바꿈 방지.
  const triggerClass =
    "flex items-center flex-wrap gap-1 min-h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-xs text-left transition-colors hover:bg-accent/30 dark:bg-input/30";

  return (
    <div className="flex flex-col gap-1.5">
      {isDesktop ? (
        /* ── 데스크탑: 트리거 자체가 실제 input (콤보박스) — 드롭다운 내부는 리스트만 ── */
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            // 트리거가 input + badges 를 포함해야 해서 native button 으로 감쌀 수
            // 없음 (button 안에 input 불가). nativeButton=false 로 비버튼 요소 허용.
            nativeButton={false}
            render={<div role="combobox" aria-haspopup="listbox" aria-expanded={open} tabIndex={0} />}
            className={`${triggerClass} cursor-text`}
            onClick={() => {
              setOpen(true);
              inputRef.current?.focus();
            }}
          >
            {selectedTags.length === 0 && (
              <Search className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
            {selectedTags.map((name) => {
              const t = allTags.find((x) => x.name === name);
              const color = t?.color || "#6B7280";
              return (
                <Badge
                  key={name}
                  className="text-xs pl-1.5 pr-1 py-0 gap-0"
                  style={{ backgroundColor: color + "20", color, borderColor: color + "40" }}
                >
                  {name}
                  <span
                    role="button"
                    tabIndex={-1}
                    // tap() ref-debounce — 350ms 안에 단일 발화만 처리.
                    onTouchStart={(e) => {
                      e.stopPropagation();
                      tap(() => toggleTag(name));
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      tap(() => toggleTag(name));
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    className="ml-0.5 opacity-60 hover:opacity-100 cursor-pointer"
                    aria-label={`${name} 제거`}
                  >
                    <X className="h-3 w-3" />
                  </span>
                </Badge>
              );
            })}
            <input
              ref={inputRef}
              value={newTagName}
              onChange={(e) => { setNewTagName(e.target.value); if (!open) setOpen(true); }}
              onFocus={() => setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleEnter();
                }
                if (e.key === "Backspace" && !newTagName && selectedTags.length > 0) {
                  e.preventDefault();
                  onChange(selectedTags.slice(0, -1));
                }
                if (e.key === "Escape") setOpen(false);
              }}
              placeholder={selectedTags.length === 0 ? placeholder : ""}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              name="tag-search"
              className="flex-1 min-w-[60px] bg-transparent outline-none text-xs h-5"
              onClick={(e) => e.stopPropagation()}
            />
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="bottom"
            sideOffset={2}
            // collisionAvoidance 기본값(flip / shift) 사용 — 화면 아래 공간이
            // 부족하면 위로 flip 하거나 안쪽으로 shift 해서 잘리지 않게.
            // 트리거(input) 폭과 동일하게 — Base UI Popover 가 positioner 에
            // --anchor-width 변수를 세팅하므로 이를 그대로 사용
            className="w-[var(--anchor-width)] min-w-[240px] p-0 max-h-[60dvh] overflow-hidden flex flex-col"
          >
            {renderBody()}
          </PopoverContent>
        </Popover>
      ) : (
        /* ── 모바일: 바텀시트 ── */
        <>
          <button
            type="button"
            onClick={() => {
              // 외부 input/textarea 가 포커스 중이면 먼저 blur — 키보드가 정리된
              // 후 시트가 열리도록. 시트 열릴 때 baseHeight 가 keyboard-shrunk
              // viewport 로 잘못 캡처되어 layout shift / 탭 좌표 어긋남을 유발.
              if (typeof document !== "undefined") {
                const a = document.activeElement;
                if (a instanceof HTMLElement && (a.tagName === "INPUT" || a.tagName === "TEXTAREA")) {
                  a.blur();
                  // iOS 키보드 dismiss 애니메이션 (~250ms) 후 열어 viewport 안정.
                  setTimeout(() => setOpen(true), 250);
                  return;
                }
              }
              setOpen(true);
            }}
            className={triggerClass}
          >
            {triggerContent}
          </button>
          {/* modal=false + hideOverlay → 외부 input/textarea 터치 시 시트 자동 닫힘 +
              터치한 요소 즉시 포커스. overlay 가 있으면 첫 터치는 overlay 가 먹어
              두 번 탭해야 하던 문제 해결. */}
          <Sheet
            open={open}
            onOpenChange={(o) => {
              // 내부 X / 검색결과 탭 직후 500ms 안에 들어오는 close 요청은 무시 —
              // 키보드 dismiss 로 인한 viewport resize 가 outside-click 으로
              // 잘못 detect 되어 시트가 닫히는 false-positive 차단.
              if (!o && performance.now() - justTappedInsideRef.current < 500) {
                return;
              }
              setOpen(o);
            }}
            modal={false}
          >
            <SheetContent
              side="bottom"
              hideOverlay
              className={`rounded-t-2xl pb-[max(env(safe-area-inset-bottom),1rem)] overflow-hidden z-[70] shadow-2xl border-t ${
                snapAnimating ? "transition-[height] duration-[250ms] ease-out" : ""
              }`}
              style={{
                height: (() => {
                  if (baseHeight == null) return snap === "full" ? "90dvh" : "50dvh";
                  const ratio = snap === "full" ? 0.9 : 0.5;
                  const plannedPx = Math.round(ratio * baseHeight);
                  // full snap 에서 키보드가 올라와 visualViewport 가 축소되면 그에 맞춰 축소
                  // → 입력창이 뷰포트 밖으로 올라가 가려지던 현상 방지.
                  if (snap === "full" && currentVh != null && currentVh < plannedPx) {
                    return `${Math.round(currentVh)}px`;
                  }
                  return `${plannedPx}px`;
                })(),
              }}
              showBackButton={false}
              showCloseButton={false}
              initialFocus={false}
              finalFocus={false}
            >
              <div ref={sheetBodyRef} className="flex flex-col h-full min-h-0">
                {renderBody()}
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </div>
  );

  // 태그 목록 / 편집 UI — Sheet·Popover 공통 본문.
  // 드래그 핸들·큰 제목은 모바일 바텀시트에서만 의미 있으므로 데스크탑에서는 생략.
  function renderBody() {
    return (
      <>
          {view === "list" ? (
            <div
              // 모바일: h-full 로 바텀시트 전체를 채움. 데스크탑: flex-1 로 PopoverContent 채움
              // (PopoverContent 가 flex column 이라 자식이 flex-1 로 max-h-60dvh 안에서 스크롤 가능).
              className={`flex flex-col min-h-0 ${isDesktop ? "flex-1" : "h-full"}`}
              onTouchStart={isDesktop ? undefined : onDragStart}
              onTouchMove={isDesktop ? undefined : onDragMove}
              onTouchEnd={isDesktop ? undefined : onDragEnd}
            >
              {/* 드래그 영역 — 모바일 바텀시트 전용(데스크탑 Popover 에선 생략) */}
              {!isDesktop && (
                <div className="flex flex-col items-center pt-3 pb-2 touch-none shrink-0">
                  <div className="h-1.5 w-14 rounded-full bg-muted-foreground/40 mb-3" />
                  <div className="text-base font-semibold text-center">
                    {placeholder.replace(/\s*\*\s*$/, "")}
                  </div>
                </div>
              )}

              <div className={`flex flex-col gap-2 px-3 pb-3 flex-1 min-h-0 ${isDesktop ? "pt-3" : ""}`}>
                {/* 입력창 — 모바일 전용. 데스크탑은 트리거가 input 이므로 여기선 생략 */}
                {!isDesktop && (
                  <div
                    className="rounded-md border px-2 py-1.5 flex flex-wrap items-center gap-1 min-h-[40px]"
                  >
                    {selectedTags.map((name) => {
                      const t = allTags.find((x) => x.name === name);
                      const color = t?.color || "#6B7280";
                      return (
                        <Badge
                          key={name}
                          className="text-xs pl-1.5 pr-1 py-0 gap-0"
                          style={{ backgroundColor: color + "20", color, borderColor: color + "40" }}
                        >
                          {name}
                          <span
                            role="button"
                            tabIndex={-1}
                            data-tag-action="x-chip"
                            // touchstart + mousedown 둘 다 fire 가능하나 tap() ref-debounce 로
                            // 350ms 안에 단일 발화만 처리. preventDefault 는 효과 있을 때만 작동.
                            onTouchStart={(e) => {
                              e.stopPropagation();
                              tap(() => toggleTag(name));
                            }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              tap(() => toggleTag(name));
                            }}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            className="ml-0.5 opacity-60 hover:opacity-100 cursor-pointer"
                            aria-label={`${name} 제거`}
                          >
                            <X className="h-3 w-3" />
                          </span>
                        </Badge>
                      );
                    })}
                    <input
                      ref={inputRef}
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      placeholder={selectedTags.length === 0 ? placeholder : ""}
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      name="tag-search"
                      className="flex-1 min-w-[60px] bg-transparent outline-none text-sm h-6"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          handleEnter();
                        }
                        if (e.key === "Backspace" && !newTagName && selectedTags.length > 0) {
                          e.preventDefault();
                          onChange(selectedTags.slice(0, -1));
                        }
                      }}
                    />
                  </div>
                )}

                {!isDesktop && (
                  <div className="text-xs text-muted-foreground">옵션 선택 또는 생성</div>
                )}

                {/* 리스트 — 꾹누르고 드래그로 순서 변경 (400ms delay).
                    onMouseDown preventDefault로 input 포커스 유지 → 키보드 깜박임 방지.
                    모바일 half 상태에서는 overflow-hidden 으로 내부 스크롤 차단 →
                    스와이프가 항상 시트 드래그로만 해석됨. full(90%) 상태에서만
                    overflow-auto 로 내부 스크롤 허용. */}
                <div
                  className={`flex flex-col flex-1 -mx-1 px-1 ${
                    !isDesktop && snap === "half"
                      ? "overflow-hidden"
                      : "overflow-y-auto overscroll-contain"
                  }`}
                  data-sheet-scroll
                >
                  {dragEnabled ? (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext items={filtered.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                        {filtered.map((t) => (
                          <SortableTagRow
                            key={t.id}
                            tag={t}
                            isInputFocused={() => document.activeElement === inputRef.current}
                            onSelect={() => { toggleTag(t.name); setNewTagName(""); }}
                            onEdit={() => enterEdit(t)}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  ) : (
                    filtered.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between px-2 py-2 hover:bg-accent rounded cursor-pointer"
                        // tap() ref-debounce — touchstart + mousedown 이중 발화 방지.
                        onTouchStart={() => {
                          tap(() => {
                            toggleTag(t.name);
                            setNewTagName("");
                          });
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          tap(() => {
                            toggleTag(t.name);
                            setNewTagName("");
                          });
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      >
                        <Badge
                          className="text-xs px-1.5 py-0"
                          style={{ backgroundColor: t.color + "20", color: t.color, borderColor: t.color + "40" }}
                        >
                          {t.name}
                        </Badge>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            // 부모 row mousedown 보다 먼저 실행되도록 stopPropagation.
                            e.stopPropagation();
                            e.preventDefault();
                            enterEdit(t);
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50"
                          aria-label={`${t.name} 편집`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </div>
                    ))
                  )}
                  {newTagName.trim() && !allTags.some((t) => t.name === newTagName.trim()) && onAddTag && (
                    <button
                      type="button"
                      data-tag-action="add-new"
                      // onPointerDown preventDefault — 모바일/데스크탑 모두에서 input 포커스
                      // 유지 → 키보드 hide 로 인한 시트 레이아웃 shift 깜빡임 방지.
                      // (이전 onMouseDown 만으로는 모바일 터치 합성 click 시 timing 어긋나서
                      // 버튼 좌표가 키보드 사라진 만큼 위로 밀리며 outside-tap 감지로 시트가
                      // 닫혀버림 → "+추가" 가 작동 안 한 것처럼 보였음.)
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAdd();
                      }}
                      className="flex w-full items-center gap-2 px-2 py-2 hover:bg-accent rounded cursor-pointer text-sm text-muted-foreground text-left"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>&quot;{newTagName.trim()}&quot; 추가</span>
                    </button>
                  )}
                  {filtered.length === 0 && !newTagName.trim() && allTags.length === 0 && (
                    <div className="px-2.5 py-6 text-xs text-muted-foreground text-center">
                      태그를 입력해서 추가하세요
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* ───────── 편집 뷰 (같은 시트에서 내용만 교체) ───────── */
            <div
              className="flex flex-col h-full min-h-0"
              onTouchStart={isDesktop ? undefined : onDragStart}
              onTouchMove={isDesktop ? undefined : onDragMove}
              onTouchEnd={isDesktop ? undefined : onDragEnd}
            >
              {/* 드래그 바 — 모바일 바텀시트 전용 */}
              {!isDesktop && (
                <div className="flex flex-col items-center pt-2 shrink-0">
                  <div className="h-1 w-10 rounded-full bg-muted-foreground/30 mb-2" />
                </div>
              )}
              <div className="flex items-center justify-between px-3 pb-2 shrink-0">
                <button
                  type="button"
                  onClick={exitEdit}
                  className="flex items-center gap-1 h-8 px-2 rounded text-sm text-muted-foreground hover:text-foreground hover:bg-accent"
                  aria-label="목록으로"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                {editingTag && (
                  <Badge
                    className="text-xs px-2 py-0.5"
                    style={{ backgroundColor: editColor + "20", color: editColor, borderColor: editColor + "40" }}
                  >
                    {editName || editingTag.name}
                  </Badge>
                )}
                <button
                  type="button"
                  onClick={saveEdit}
                  className="h-8 px-2 rounded text-sm text-primary hover:bg-accent"
                >
                  완료
                </button>
              </div>

              <div
                className={`flex flex-col gap-3 px-4 pb-3 flex-1 min-h-0 ${
                  !isDesktop && snap === "half"
                    ? "overflow-hidden"
                    : "overflow-y-auto overscroll-contain"
                }`}
                data-sheet-scroll
              >
                {/* 이름 변경 — 현재 API 한계로 UI만 노출하되 저장은 색상만.
                    후에 onRenameTag 콜백 추가 시 자연스럽게 확장 */}
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="태그 이름"
                  className="rounded-md border px-3 h-9 text-sm outline-none focus:border-primary"
                />

                {/* 삭제 — 기본(builtin) 태그는 삭제 불가이므로 버튼 자체 숨김 */}
                {editingTag && !isBuiltin(editingTag.id) && (
                  <button
                    type="button"
                    onClick={deleteCurrentTag}
                    className="flex items-center gap-2 rounded-md border px-3 h-9 text-sm text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>삭제</span>
                  </button>
                )}

                {/* 색상 — 프리셋 동그라미 + 커스텀 컬러피커 */}
                <div className="flex flex-col gap-2">
                  <div className="text-xs text-muted-foreground">색</div>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setEditColor(c)}
                        className={`h-7 w-7 rounded-full transition-all ${
                          editColor.toLowerCase() === c.toLowerCase()
                            ? "ring-2 ring-offset-2 ring-primary scale-110"
                            : "hover:scale-110"
                        }`}
                        style={{ backgroundColor: c }}
                        aria-label={c}
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => setShowColorPicker((s) => !s)}
                      className={`h-7 w-7 rounded-full transition-all ${
                        showColorPicker || !PRESET_COLORS.includes(editColor)
                          ? "ring-2 ring-offset-2 ring-primary scale-110"
                          : "hover:scale-110"
                      }`}
                      // 컬러피커 버튼 — 현재 색이 무엇이든 항상 무지개(conic gradient)로
                      // 표시하여 "색상 선택" 역할을 명확히 드러냄.
                      // 커스텀 색이 선택되어 있으면 ring-2로 활성 상태만 표시.
                      style={{
                        background:
                          "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)",
                      }}
                      aria-label="커스텀 색상"
                      title="컬러피커"
                    />
                  </div>
                  {showColorPicker && (
                    <div className="rounded-md border p-3 mt-1">
                      <ColorPickerPanel
                        color={editColor}
                        onPreview={setEditColor}
                        onConfirm={(c) => { setEditColor(c); setShowColorPicker(false); }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="px-4 pt-2 shrink-0">
                <Button type="button" onClick={saveEdit} className="w-full h-9">
                  저장
                </Button>
              </div>
            </div>
          )}
      </>
    );
  }
}
