"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Star, ChevronRight, FileText, Folder, CheckSquare, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import SearchInput from "@/components/ui/search-input";
import type { KnowledgeFolder, KnowledgeItem } from "@/types";
import { useKnowledgeFavorites } from "@/lib/knowledge-favorites";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PromptDialog from "@/components/ui/prompt-dialog";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import SelectionToolbar from "@/components/ui/selection-toolbar";
import { useSelectionMode } from "@/hooks/use-selection-mode";
import { hapticSelect } from "@/lib/haptics";
import MoveTargetTree from "@/components/knowledge/move-target-tree";
import KnowledgeEmptyState from "@/components/knowledge/empty-state";

interface DashboardProps {
  folders: KnowledgeFolder[];
  items: KnowledgeItem[];
  /** 첫 fetch 중이면 true — empty-state 플래시 방지 */
  loading?: boolean;
  onSelectItem: (id: string) => void;
  onSelectFolder: (folderId: string) => void;
  onSearch: (q: string) => void;
  searchQuery: string;
  searchResults: KnowledgeItem[];
  onDeleteItems?: (ids: string[]) => void;
  onDeleteFolders?: (ids: string[]) => void;
  onRenameFolder?: (id: string, name: string) => void;
  onRenameItem?: (id: string, title: string) => void;
  onSelectModeChange?: (active: boolean) => void;
  onMoveItems?: (ids: string[], targetFolderId: string | null) => void;
  onMoveFolders?: (ids: string[], targetFolderId: string | null) => void;
  onTogglePinItem?: (id: string, pinned: boolean) => Promise<void>;
  /** true 면 내부 SearchInput 렌더 생략 — 부모가 상위에서 별도 검색박스를 제공하는 경우. */
  hideSearch?: boolean;
  /** 검색 인플라이트(디바운스 + 네트워크) — SearchInput 우측 스피너 표시. */
  searchLoading?: boolean;
}

/* ── 노트 트리 행 ──
   탭: 열기 (또는 selectMode 일 땐 토글).
   길게 누름 400ms: selectMode 진입. (DnD 제거 — 모바일 표준 단일 의미.) */
export function NoteTreeRow({ item, depth, selectMode, selected, onToggle, onClick, onLongPress, isFavorite, onToggleFavorite }: {
  item: KnowledgeItem; depth: number; selectMode: boolean; selected: boolean;
  onToggle: () => void; onClick: () => void; onLongPress: () => void;
  isFavorite: boolean; onToggleFavorite?: () => void;
}) {
  void isFavorite;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // long-press 가 발동한 직후 발생하는 synthetic click 1회 차단용.
  // (touchend → 브라우저가 click 이벤트로 변환 → selectMode true 면 toggle → 방금 선택한 항목 해제 버그)
  const longPressFiredRef = useRef(false);
  return (
    <div
      data-sel-id={item.id} data-sel-type="item" role="button" tabIndex={0}
      onClick={() => {
        if (longPressFiredRef.current) {
          longPressFiredRef.current = false;
          return;
        }
        if (selectMode) onToggle();
        else onClick();
      }}
      onTouchStart={() => {
        longPressFiredRef.current = false;
        timerRef.current = setTimeout(() => {
          longPressFiredRef.current = true;
          hapticSelect();
          onLongPress();
        }, 250);
      }}
      onTouchEnd={() => { if (timerRef.current) clearTimeout(timerRef.current); }}
      onTouchMove={() => { if (timerRef.current) clearTimeout(timerRef.current); }}
      onContextMenu={(e) => { e.preventDefault(); onLongPress(); }}
      className={`flex items-center gap-1.5 rounded-lg py-2 pr-2 transition-colors select-none ${selected ? "bg-primary/10 shadow-[inset_3px_0_0_var(--primary)]" : "hover:bg-accent/50"}`}
      style={{ paddingLeft: depth * 16 }}
    >
      {/* 폴더 토글 화살표와 같은 크기(h-5 w-5) placeholder — 파일·폴더 아이콘 수직 정렬. */}
      <span className="h-5 w-5 shrink-0" />
      {selectMode && (selected ? <CheckSquare className="h-4 w-4 text-primary shrink-0" /> : <Square className="h-4 w-4 text-muted-foreground shrink-0" />)}
      <FileText className={`h-4 w-4 shrink-0 ${selected ? "text-primary" : "text-muted-foreground"}`} />
      <span className="flex-1 text-sm text-left truncate">{item.title || "(제목 없음)"}</span>
      {!selectMode && onToggleFavorite && item.pinned && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          className="shrink-0 -m-1 p-2 rounded-md hover:bg-accent"
          aria-label="즐겨찾기 해제"
        >
          <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
        </button>
      )}
    </div>
  );
}

/* ── 재귀 폴더 트리 행 ── */
export function FolderTreeRow({
  folder,
  allFolders,
  allItems,
  depth,
  expanded,
  onToggle,
  selectMode,
  selFolders,
  selItems,
  onToggleFolder,
  onToggleItem,
  onClickFolder,
  onClickItem,
  onLongPress,
  isFolderFavorite,
  onToggleFolderFavorite,
  onTogglePinItem,
}: {
  folder: KnowledgeFolder;
  allFolders: KnowledgeFolder[];
  allItems: KnowledgeItem[];
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  selectMode: boolean;
  selFolders: Set<string>;
  selItems: Set<string>;
  onToggleFolder: (id: string) => void;
  onToggleItem: (id: string) => void;
  onClickFolder: (id: string) => void;
  onClickItem: (id: string) => void;
  onLongPress: (id: string, type: "folder" | "item") => void;
  isFolderFavorite: (id: string) => boolean;
  onToggleFolderFavorite: (id: string) => void;
  onTogglePinItem?: (id: string, pinned: boolean) => Promise<void>;
}) {
  void isFolderFavorite;
  void onToggleFolderFavorite;
  void allItems;
  const subFolders = allFolders.filter((f) => f.parent_id === folder.id);
  // 토글 내부엔 하위 폴더만 노출. 파일은 해당 폴더 진입 시 보이는 방식으로.
  const hasChildren = subFolders.length > 0;
  const isOpen = expanded.has(folder.id);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // long-press 발동 직후 synthetic click 1회 차단용.
  const longPressFiredRef = useRef(false);

  return (
    <div>
      {/* 폴더 행 */}
      <div
        data-sel-id={folder.id} data-sel-type="folder"
        role="button" tabIndex={0}
        onClick={() => {
          if (longPressFiredRef.current) {
            longPressFiredRef.current = false;
            return;
          }
          if (selectMode) onToggleFolder(folder.id);
          else onClickFolder(folder.id);
        }}
        onTouchStart={() => {
          longPressFiredRef.current = false;
          timerRef.current = setTimeout(() => {
            longPressFiredRef.current = true;
            hapticSelect();
            onLongPress(folder.id, "folder");
          }, 250);
        }}
        onTouchEnd={() => { if (timerRef.current) clearTimeout(timerRef.current); }}
        onTouchMove={() => { if (timerRef.current) clearTimeout(timerRef.current); }}
        onContextMenu={(e) => { e.preventDefault(); onLongPress(folder.id, "folder"); }}
        className={`flex items-center gap-1.5 rounded-lg py-2 pr-2 transition-colors select-none ${
          selFolders.has(folder.id) ? "bg-primary/10" : "hover:bg-accent/50"
        }`}
        style={{ paddingLeft: depth * 16 }}
      >
        {/* 토글 화살표 — 하위 있을 때만 실제 렌더. 없으면 같은 크기 placeholder 로 아이콘 정렬 유지. */}
        {hasChildren && !selectMode ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggle(folder.id); }}
            className="flex h-5 w-5 items-center justify-center shrink-0 text-muted-foreground"
          >
            <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`} />
          </button>
        ) : (
          <span className="h-5 w-5 shrink-0" />
        )}
        {selectMode && (selFolders.has(folder.id)
          ? <CheckSquare className="h-4 w-4 text-primary shrink-0" />
          : <Square className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="flex-1 text-sm font-medium text-left truncate">{folder.name}</span>
      </div>

      {/* 하위 콘텐츠 (토글 열림 시) — 하위 폴더만 재귀 렌더. 파일은 폴더 진입 시 노출. */}
      {isOpen && hasChildren && (
        <div>
          {subFolders.map((sf) => (
            <FolderTreeRow
              key={sf.id}
              folder={sf}
              allFolders={allFolders}
              allItems={allItems}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              selectMode={selectMode}
              selFolders={selFolders}
              selItems={selItems}
              onToggleFolder={onToggleFolder}
              onToggleItem={onToggleItem}
              onClickFolder={onClickFolder}
              onClickItem={onClickItem}
              onLongPress={onLongPress}
              isFolderFavorite={isFolderFavorite}
              onToggleFolderFavorite={onToggleFolderFavorite}
              onTogglePinItem={onTogglePinItem}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 메인 대시보드 ── */
export default function KnowledgeDashboard({
  folders, items, loading = false, onSelectItem, onSelectFolder, onSearch, searchQuery, searchResults, onDeleteItems, onDeleteFolders, onRenameFolder, onRenameItem, onSelectModeChange, onMoveItems, onMoveFolders, onTogglePinItem, hideSearch, searchLoading = false,
}: DashboardProps) {
  const { toggleFolder: toggleFolderFav, isFolderFav } = useKnowledgeFavorites();
  // 즐겨찾기 = DB pinned (items) — 폴더는 글 전용 정책으로 즐겨찾기 대상 아님.
  // useMemo: items/folders 가 안 바뀌면 재계산 회피. 50+ 노트에서 매 렌더 O(n) 정렬·필터 부담 제거.
  const favoriteItems = useMemo(() => items.filter((i) => i.pinned), [items]);
  const rootFolders = useMemo(() => folders.filter((f) => !f.parent_id), [folders]);
  const rootItems = useMemo(
    () => items
      .filter((i) => !i.folder_id)
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }),
    [items],
  );

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => setExpanded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // 선택 모드 — useSelectionMode 훅으로 통합 (folders/items/total/handlers).
  const sel = useSelectionMode({ onChange: onSelectModeChange });
  const selectMode = sel.active;
  const selFolders = sel.folders;
  const selItems = sel.items;
  const totalSel = sel.total;
  const handleLongPress = sel.handleLongPress;
  const addToSelection = sel.addToSelection;
  const toggleSelection = sel.toggleSelection;
  const dragRef = sel.dragRef;
  const lastSelRef = sel.lastSelRef;

  const [moveMode, setMoveMode] = useState(false);
  // 이름 변경 — PromptDialog 한 가지 진입 (인라인 rename 제거).
  const [renamePrompt, setRenamePrompt] = useState<{ id: string; type: "folder" | "item"; current: string } | null>(null);
  // 일괄 삭제 확인 — SelectionToolbar 휴지통 즉시 삭제 대신 확인 단계.
  const [confirmDelete, setConfirmDelete] = useState(false);

  const exitSelect = () => {
    sel.exit();
    setMoveMode(false);
  };

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragRef.current) return;
    const t = e.touches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const target = el?.closest("[data-sel-id]") as HTMLElement | null;
    if (target) addToSelection(target.dataset.selId!, target.dataset.selType as "folder" | "item");
  }, [addToSelection, dragRef]);
  const handleTouchEnd = useCallback(() => { dragRef.current = false; }, [dragRef]);

  // 마우스 드래그 다중선택 (데스크톱) — 좌클릭 누른 채 움직이면 지나간 항목 누적 선택.
  // 이동 거리 5px 넘어야 발동 → 단일 클릭(열기) 과 충돌 방지.
  const mouseDragRef = useRef<{ startX: number; startY: number; active: boolean } | null>(null);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const s = mouseDragRef.current;
      if (!s) return;
      if (!s.active) {
        const dx = e.clientX - s.startX;
        const dy = e.clientY - s.startY;
        if (dx * dx + dy * dy < 25) return; // 5px 임계값
        s.active = true;
        if (!selectMode) sel.enterMode();
      }
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const target = el?.closest("[data-sel-id]") as HTMLElement | null;
      // 즐겨찾기 섹션(data-sel-exclude) 하위 항목은 드래그 선택 대상 제외.
      if (!target || target.closest("[data-sel-exclude]")) return;
      addToSelection(target.dataset.selId!, target.dataset.selType as "folder" | "item");
    };
    const onUp = () => { mouseDragRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [addToSelection, selectMode, onSelectModeChange]);

  // 좌클릭(button 0)만 드래그 시작. 대시보드 컨테이너 onMouseDown 핸들러.
  const handleContainerMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, input, textarea, [contenteditable='true']")) return;
    mouseDragRef.current = { startX: e.clientX, startY: e.clientY, active: false };
    e.preventDefault();
  }, []);

  // 빈 영역 클릭 시 선택모드 해제 — 드래그 종료 직후 항목 외 클릭이면 selectMode 종료.
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (!selectMode) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-sel-id], button, input, textarea, [contenteditable='true']")) return;
    exitSelect();
  }, [selectMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Shift+클릭 범위 선택 — selectMode 이고 shift 누른 채 항목 클릭 시
  // lastSelRef 부터 현재 클릭 항목까지 DOM 순서대로 한 번에 선택.
  const handleContainerClickCapture = useCallback(
    (e: React.MouseEvent) => {
      if (!selectMode || !e.shiftKey) return;
      const el = (e.target as HTMLElement).closest("[data-sel-id]") as HTMLElement | null;
      if (!el) return;
      const clickedId = el.dataset.selId!;
      if (!lastSelRef.current) {
        addToSelection(clickedId, el.dataset.selType as "folder" | "item");
        lastSelRef.current = clickedId;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (lastSelRef.current === clickedId) return;
      const containerEl = el.closest("[data-sel-container]");
      const pool: HTMLElement[] = containerEl
        ? (Array.from(containerEl.querySelectorAll("[data-sel-id]")) as HTMLElement[])
        : (Array.from(document.querySelectorAll("[data-sel-id]")) as HTMLElement[]);
      const fromIdx = pool.findIndex((x) => x.dataset.selId === lastSelRef.current);
      const toIdx = pool.findIndex((x) => x.dataset.selId === clickedId);
      if (fromIdx === -1 || toIdx === -1) return;
      e.preventDefault();
      e.stopPropagation();
      const [lo, hi] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
      for (let i = lo; i <= hi; i++) {
        const x = pool[i];
        addToSelection(x.dataset.selId!, x.dataset.selType as "folder" | "item");
      }
      lastSelRef.current = clickedId;
    },
    [selectMode, addToSelection]
  );

  void toggleFolderFav;
  void isFolderFav;

  // 휴지통 클릭 → 확인 다이얼로그. 실제 삭제는 사용자 확인 후 performDelete 에서.
  const handleDeleteBulk = () => setConfirmDelete(true);
  const performDelete = async () => {
    if (selItems.size > 0 && onDeleteItems) await onDeleteItems(Array.from(selItems));
    if (selFolders.size > 0 && onDeleteFolders) await onDeleteFolders(Array.from(selFolders));
    setConfirmDelete(false);
    exitSelect();
  };

  // ✏️ 버튼: 1개 선택 → PromptDialog 로 이름 변경.
  const startRename = () => {
    const fid = Array.from(selFolders)[0];
    const iid = Array.from(selItems)[0];
    if (fid) {
      const f = folders.find((x) => x.id === fid);
      if (f) setRenamePrompt({ id: fid, type: "folder", current: f.name });
    } else if (iid) {
      const it = items.find((x) => x.id === iid);
      if (it) setRenamePrompt({ id: iid, type: "item", current: it.title });
    }
  };
  const submitRename = (newName: string) => {
    if (!renamePrompt) return;
    const trimmed = newName.trim();
    if (!trimmed) { setRenamePrompt(null); return; }
    if (renamePrompt.type === "folder" && onRenameFolder) onRenameFolder(renamePrompt.id, trimmed);
    else if (renamePrompt.type === "item" && onRenameItem) onRenameItem(renamePrompt.id, trimmed);
    setRenamePrompt(null);
    exitSelect();
  };

  const doMove = (targetId: string | null) => {
    if (selItems.size > 0 && onMoveItems) onMoveItems(Array.from(selItems), targetId);
    if (selFolders.size > 0 && onMoveFolders) onMoveFolders(Array.from(selFolders), targetId);
    exitSelect();
  };

  return (
    <div className="flex flex-col h-full" onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>

      {/* 폴더 이동 — 모바일은 바텀시트, 데스크톱(md+)은 중앙 다이얼로그.
          modal=false 로 외부 요소 터치·포커스 가능 + 외부 터치 시 자동 닫힘. */}
      <Sheet open={moveMode} onOpenChange={setMoveMode} modal={false}>
        <SheetContent side="bottom" className="md:hidden rounded-t-2xl pb-[max(env(safe-area-inset-bottom),1rem)] max-h-[60dvh] z-[65]" showBackButton={false} showCloseButton={false} initialFocus={false} hideOverlay>
          <div className="flex flex-col h-full">
            <div className="flex flex-col items-center pt-3 pb-2 shrink-0">
              <div className="h-1.5 w-14 rounded-full bg-muted-foreground/40 mb-3" />
              <SheetHeader className="p-0">
                <SheetTitle className="text-base text-center">이동할 폴더 선택</SheetTitle>
              </SheetHeader>
            </div>
            <div className="flex flex-col gap-0.5 px-4 pb-2 overflow-y-auto flex-1">
              <button type="button" onClick={() => { doMove(null); }}
                className="flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-accent font-medium"><Folder className="h-4 w-4" /> 루트 (최상위)</button>
              <MoveTargetTree folders={folders} excludeIds={selFolders} parentId={null} onSelect={(id) => doMove(id)} />
            </div>
            <div className="px-4 pt-2 shrink-0">
              <Button size="sm" variant="outline" className="w-full h-9" onClick={() => setMoveMode(false)}>취소</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={moveMode} onOpenChange={setMoveMode}>
        <DialogContent className="hidden md:flex md:flex-col max-w-md max-h-[70vh]">
          <DialogHeader>
            <DialogTitle>이동할 폴더 선택</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-0.5 overflow-y-auto flex-1 -mx-4 px-4">
            <button type="button" onClick={() => doMove(null)}
              className="flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-accent font-medium"><Folder className="h-4 w-4" /> 루트 (최상위)</button>
            <MoveTargetTree folders={folders} excludeIds={selFolders} parentId={null} onSelect={(id) => doMove(id)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={() => setMoveMode(false)}>취소</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div
        // 폴더 진입 화면(folder-note-list)과 검색바·콘텐츠 여백을 통일 — 진입 시
        // 헤더가 들썩이지 않도록 px-3 py-3 + gap-2 로 맞춤. md+ 는 기존 max-w-xl 유지.
        className="flex flex-col gap-2 px-3 py-3 md:p-4 md:gap-3 overflow-y-auto flex-1 w-full md:max-w-xl"
        data-sel-container
        onMouseDown={handleContainerMouseDown}
        onClickCapture={handleContainerClickCapture}
        onClick={handleContainerClick}
        onDragStart={(e) => e.preventDefault()}
      >
        {/* 검색창 자리: 선택모드 시 동일 높이의 선택 툴바로 치환 → 레이아웃 이동 없음. */}
        {selectMode ? (() => {
          // ⭐ 토글 — 1개 선택 + item(노트) 1개일 때만.
          const singleItemId = totalSel === 1 && selItems.size === 1 ? Array.from(selItems)[0] : null;
          const singleItem = singleItemId ? items.find((x) => x.id === singleItemId) : null;
          return (
            <SelectionToolbar
              totalSelected={totalSel}
              onExit={exitSelect}
              onRename={startRename}
              onMove={() => setMoveMode(true)}
              onDelete={handleDeleteBulk}
              onToggleFavorite={singleItem && onTogglePinItem
                ? async () => { await onTogglePinItem(singleItem.id, singleItem.pinned); exitSelect(); }
                : undefined
              }
              favoritePinned={singleItem?.pinned}
            />
          );
        })() : !hideSearch ? (
          <SearchInput value={searchQuery} onChange={onSearch} placeholder="노트 검색..." size="md" loading={searchLoading} />
        ) : null}

        {searchQuery.trim() && !selectMode ? (
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">{searchResults.length}개 결과</p>
            {searchResults.length === 0 ? (
              <KnowledgeEmptyState variant="no-search-results" query={searchQuery.trim()} />
            ) : searchResults.map((item) => (
              <button key={item.id} type="button" onClick={() => onSelectItem(item.id)}
                className="flex items-center gap-2 rounded-lg border p-2.5 text-left hover:bg-accent/50 transition-colors w-full">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium line-clamp-1">{item.title || "(제목 없음)"}</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            {/* 즐겨찾기 — 폴더 + 파일 모두. data-sel-exclude 로 드래그 선택 대상에서 제외.
                즐겨찾기는 글(파일) 전용 — 웹과 통일. */}
            {favoriteItems.length > 0 && (
              <section data-sel-exclude className="flex flex-col gap-1">
                <h3 className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-0.5">
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" /> 즐겨찾기
                </h3>
                {favoriteItems.map((item) => (
                  <div
                    key={item.id} role="button" tabIndex={0}
                    onClick={() => onSelectItem(item.id)}
                    className="flex items-center gap-2 rounded-lg border p-2.5 text-left transition-colors select-none hover:bg-accent/50"
                  >
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium line-clamp-1 flex-1">{item.title || "(제목 없음)"}</span>
                    {!selectMode && onTogglePinItem && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onTogglePinItem(item.id, item.pinned); }}
                        className="shrink-0 -m-1 p-2 rounded-md hover:bg-accent"
                        aria-label="즐겨찾기 해제"
                      >
                        <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                      </button>
                    )}
                  </div>
                ))}
              </section>
            )}

            {/* 폴더 트리 + 최상위 노트 — DnD 제거, 단순 리스트. */}
            {(rootFolders.length > 0 || rootItems.length > 0) && (
              <section className="flex flex-col">
                {rootFolders.map((f) => (
                  <FolderTreeRow
                    key={f.id}
                    folder={f}
                    allFolders={folders}
                    allItems={items}
                    depth={0}
                    expanded={expanded}
                    onToggle={toggleExpand}
                    selectMode={selectMode}
                    selFolders={selFolders}
                    selItems={selItems}
                    onToggleFolder={(id) => toggleSelection(id, "folder")}
                    onToggleItem={(id) => toggleSelection(id, "item")}
                    onClickFolder={onSelectFolder}
                    onClickItem={onSelectItem}
                    onLongPress={handleLongPress}
                    isFolderFavorite={isFolderFav}
                    onToggleFolderFavorite={toggleFolderFav}
                    onTogglePinItem={onTogglePinItem}
                  />
                ))}
                {rootItems.map((it) => (
                  <NoteTreeRow
                    key={it.id}
                    item={it}
                    depth={0}
                    selectMode={selectMode}
                    selected={selItems.has(it.id)}
                    onToggle={() => toggleSelection(it.id, "item")}
                    onClick={() => (selectMode ? toggleSelection(it.id, "item") : onSelectItem(it.id))}
                    onLongPress={() => handleLongPress(it.id, "item")}
                    isFavorite={it.pinned}
                    onToggleFavorite={
                      onTogglePinItem ? () => onTogglePinItem(it.id, it.pinned) : undefined
                    }
                  />
                ))}
              </section>
            )}

            {favoriteItems.length === 0 && rootFolders.length === 0 && rootItems.length === 0 && !selectMode && !loading && (
              <KnowledgeEmptyState variant="no-folders" />
            )}
          </>
        )}
      </div>

      {/* 이름 변경 — PromptDialog 통일 진입. */}
      <PromptDialog
        open={!!renamePrompt}
        onOpenChange={(o) => { if (!o) setRenamePrompt(null); }}
        title={renamePrompt?.type === "folder" ? "폴더 이름 변경" : "노트 이름 변경"}
        defaultValue={renamePrompt?.current || ""}
        placeholder={renamePrompt?.type === "folder" ? "폴더 이름" : "노트 제목"}
        confirmLabel="변경"
        onConfirm={submitRename}
      />

      {/* 일괄 삭제 확인 — folder-note-list 와 동일 패턴. */}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={
          selFolders.size > 0 && selItems.size > 0
            ? `폴더 ${selFolders.size}개 · 노트 ${selItems.size}개 삭제`
            : selFolders.size > 0
              ? `폴더 ${selFolders.size}개 삭제`
              : `노트 ${selItems.size}개 삭제`
        }
        description={
          selFolders.size > 0
            ? "폴더 안의 모든 하위 노트와 폴더가 함께 삭제돼요."
            : "삭제하면 되돌릴 수 없어요."
        }
        confirmLabel="삭제"
        destructive
        onConfirm={performDelete}
      />
    </div>
  );
}
