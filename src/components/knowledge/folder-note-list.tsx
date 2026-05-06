"use client";

import { useState, useRef, useCallback } from "react";
import { FileText, CheckSquare, Square, Folder, Star, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import SearchInput from "@/components/ui/search-input";
import PromptDialog from "@/components/ui/prompt-dialog";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import SelectionToolbar from "@/components/ui/selection-toolbar";
import { useSelectionMode } from "@/hooks/use-selection-mode";
import { hapticSelect } from "@/lib/haptics";
import type { KnowledgeFolder, KnowledgeItem } from "@/types";
import MoveTargetTree from "@/components/knowledge/move-target-tree";
import KnowledgeBreadcrumb from "@/components/knowledge/breadcrumb";
import KnowledgeEmptyState from "@/components/knowledge/empty-state";

interface Props {
  folder: KnowledgeFolder | null;
  folders: KnowledgeFolder[];
  items: KnowledgeItem[];
  /** 첫 fetch 중이면 true — empty-state 플래시 방지 */
  loading?: boolean;
  onSelectItem: (id: string) => void;
  onSelectFolder: (folderId: string) => void;
  onNavigateToFolder: (folderId: string | null) => void;
  onDeleteItems?: (ids: string[]) => void;
  onDeleteFolders?: (ids: string[]) => void;
  onRenameFolder?: (id: string, name: string) => void;
  onRenameItem?: (id: string, title: string) => void;
  onMoveItems?: (ids: string[], targetFolderId: string | null) => void;
  onMoveFolders?: (ids: string[], targetFolderId: string | null) => void;
  onSelectModeChange?: (active: boolean) => void;
  onTogglePinItem?: (id: string, pinned: boolean) => Promise<void>;
  /** 선택 프롭 — 주면 폴더 breadcrumb 위에 검색박스 표시. */
  searchQuery?: string;
  onSearch?: (q: string) => void;
  /** true 면 내부 Breadcrumb 렌더 생략 — 부모가 상위에서 별도 breadcrumb 을 이미 표시하는 경우. */
  hideBreadcrumb?: boolean;
}

export default function FolderNoteList({
  folder, folders, items, loading = false, onSelectItem, onSelectFolder, onNavigateToFolder,
  onDeleteItems, onDeleteFolders, onRenameFolder, onRenameItem, onMoveItems, onMoveFolders,
  onSelectModeChange, onTogglePinItem, searchQuery, onSearch, hideBreadcrumb,
}: Props) {
  const folderId = folder?.id ?? null;
  const subFolders = folders.filter((f) => f.parent_id === folderId);
  const folderItems = items
    .filter((i) => (folderId ? i.folder_id === folderId : !i.folder_id))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

  // 선택 모드 — useSelectionMode 훅으로 통합.
  const sel = useSelectionMode({ onChange: onSelectModeChange });
  const selectMode = sel.active;
  const selFolders = sel.folders;
  const selItems = sel.items;
  const totalSel = sel.total;
  const handleLongPress = sel.handleLongPress;
  const addToSelection = sel.addToSelection;
  const toggleSel = sel.toggleSelection;
  const dragRef = sel.dragRef;

  const [moveMode, setMoveMode] = useState(false);
  const [renamePrompt, setRenamePrompt] = useState<{ id: string; type: "folder" | "item"; current: string } | null>(null);
  // 일괄 삭제 확인 — SelectionToolbar 의 휴지통 클릭 시 즉시 삭제 대신 확인 단계.
  const [confirmDelete, setConfirmDelete] = useState(false);

  const exitSelect = () => { sel.exit(); setMoveMode(false); };

  // 드래그 선택 (선택 모드 안에서 손가락 끌기로 항목 누적 선택)
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragRef.current) return;
    const t = e.touches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const target = el?.closest("[data-sel-id]") as HTMLElement | null;
    if (target) addToSelection(target.dataset.selId!, target.dataset.selType as "folder" | "item");
  }, [addToSelection, dragRef]);
  const handleTouchEnd = useCallback(() => { dragRef.current = false; }, [dragRef]);

  // 휴지통 클릭 → 확인 다이얼로그 열기. 실제 삭제는 사용자 확인 후.
  const handleDelete = () => setConfirmDelete(true);
  const performDelete = async () => {
    if (selItems.size > 0 && onDeleteItems) await onDeleteItems(Array.from(selItems));
    if (selFolders.size > 0 && onDeleteFolders) await onDeleteFolders(Array.from(selFolders));
    setConfirmDelete(false);
    exitSelect();
  };

  // 이름 변경 — PromptDialog 통일.
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

  // 폴더 이동
  const doMove = (targetId: string | null) => {
    if (selItems.size > 0 && onMoveItems) onMoveItems(Array.from(selItems), targetId);
    if (selFolders.size > 0 && onMoveFolders) onMoveFolders(Array.from(selFolders), targetId);
    exitSelect();
  };

  return (
    <div className="flex flex-col h-full" onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      {/* 상단 영역 — 검색 / 선택 툴바 + 브레드크럼 */}
      {(onSearch || !hideBreadcrumb) && (
        <div className="flex flex-col gap-2 shrink-0 border-b bg-background px-3 py-3">
          {selectMode ? (() => {
            const singleItemId = totalSel === 1 && selItems.size === 1 ? Array.from(selItems)[0] : null;
            const singleItem = singleItemId ? items.find((x) => x.id === singleItemId) : null;
            return (
              <SelectionToolbar
                totalSelected={totalSel}
                onExit={exitSelect}
                onRename={startRename}
                onMove={() => setMoveMode(true)}
                onDelete={handleDelete}
                onToggleFavorite={singleItem && onTogglePinItem
                  ? async () => { await onTogglePinItem(singleItem.id, singleItem.pinned); exitSelect(); }
                  : undefined
                }
                favoritePinned={singleItem?.pinned}
              />
            );
          })() : onSearch ? (
            <SearchInput
              value={searchQuery ?? ""}
              onChange={onSearch}
              placeholder="노트 검색..."
              size="md"
            />
          ) : null}
          {!hideBreadcrumb && (
            <KnowledgeBreadcrumb
              folder={folder}
              folders={folders}
              onNavigate={onNavigateToFolder}
            />
          )}
        </div>
      )}

      {/* 폴더 이동 — 바텀시트. modal=false 로 외부 요소 터치·포커스 가능 +
          외부 터치 시 자동 닫힘 (Base UI dismissible 기본 true). */}
      <Sheet open={moveMode} onOpenChange={setMoveMode} modal={false}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-[max(env(safe-area-inset-bottom),1rem)] max-h-[60dvh] z-[65]" showBackButton={false} showCloseButton={false} initialFocus={false} hideOverlay>
          <div className="flex flex-col h-full">
            <div className="flex flex-col items-center pt-3 pb-2 shrink-0">
              <div className="h-1.5 w-14 rounded-full bg-muted-foreground/40 mb-3" />
              <SheetHeader className="p-0">
                <SheetTitle className="text-base text-center">이동할 폴더 선택</SheetTitle>
              </SheetHeader>
            </div>
            <div className="flex flex-col gap-0.5 px-4 pb-2 overflow-y-auto flex-1">
              <button type="button" onClick={() => doMove(null)} className="flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-accent font-medium">
                <Folder className="h-4 w-4" /> 루트 (최상위)
              </button>
              <MoveTargetTree folders={folders} excludeIds={selFolders} parentId={null} onSelect={doMove} />
            </div>
            <div className="px-4 pt-2 shrink-0">
              <Button size="sm" variant="outline" className="w-full h-9" onClick={() => setMoveMode(false)}>취소</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* 콘텐츠 — DnD 제거, 단순 리스트. */}
      <div className="flex-1 overflow-y-auto p-3">
        {subFolders.length === 0 && folderItems.length === 0 && !loading ? (
          <KnowledgeEmptyState variant="no-notes-in-folder" />
        ) : subFolders.length === 0 && folderItems.length === 0 && loading ? (
          <div className="py-20" aria-hidden />
        ) : (
          <div className="flex flex-col gap-0.5">
            {subFolders.map((sf) => (
              <FolderRow
                key={sf.id}
                sf={sf}
                selectMode={selectMode}
                selected={selFolders.has(sf.id)}
                onClick={() => selectMode ? toggleSel(sf.id, "folder") : onSelectFolder(sf.id)}
                onLongPress={() => handleLongPress(sf.id, "folder")}
              />
            ))}
            {folderItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                selectMode={selectMode}
                selected={selItems.has(item.id)}
                onClick={() => selectMode ? toggleSel(item.id, "item") : onSelectItem(item.id)}
                onLongPress={() => handleLongPress(item.id, "item")}
                onTogglePin={onTogglePinItem}
              />
            ))}
          </div>
        )}
      </div>

      {/* 이름 변경 PromptDialog */}
      <PromptDialog
        open={!!renamePrompt}
        onOpenChange={(o) => { if (!o) setRenamePrompt(null); }}
        title={renamePrompt?.type === "folder" ? "폴더 이름 변경" : "노트 이름 변경"}
        defaultValue={renamePrompt?.current || ""}
        placeholder={renamePrompt?.type === "folder" ? "폴더 이름" : "노트 제목"}
        confirmLabel="변경"
        onConfirm={submitRename}
      />

      {/* 일괄 삭제 확인 — 폴더 삭제는 하위 노트도 함께 사라지므로 footnote 강조. */}
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

/* ── 폴더 행 ── */
function FolderRow({ sf, selectMode, selected, onClick, onLongPress }: {
  sf: KnowledgeFolder; selectMode: boolean; selected: boolean;
  onClick: () => void; onLongPress: () => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <div
      data-sel-id={sf.id} data-sel-type="folder" role="button" tabIndex={0}
      onClick={onClick}
      onTouchStart={() => { timerRef.current = setTimeout(() => { hapticSelect(); onLongPress(); }, 250); }}
      onTouchEnd={() => { if (timerRef.current) clearTimeout(timerRef.current); }}
      onTouchMove={() => { if (timerRef.current) clearTimeout(timerRef.current); }}
      onContextMenu={(e) => { e.preventDefault(); onLongPress(); }}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 hover:bg-accent/50 transition-colors select-none ${selected ? "bg-primary/10" : ""}`}
    >
      {selectMode && (selected ? <CheckSquare className="h-4 w-4 text-primary shrink-0" /> : <Square className="h-4 w-4 text-muted-foreground shrink-0" />)}
      <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="flex-1 text-sm font-medium text-left truncate">{sf.name}</span>
      {!selectMode && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
    </div>
  );
}

/* ── 노트 행 ── */
function ItemRow({ item, selectMode, selected, onClick, onLongPress, onTogglePin }: {
  item: KnowledgeItem; selectMode: boolean; selected: boolean;
  onClick: () => void; onLongPress: () => void;
  onTogglePin?: (id: string, pinned: boolean) => Promise<void>;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <div
      data-sel-id={item.id} data-sel-type="item" role="button" tabIndex={0}
      onClick={onClick}
      onTouchStart={() => { timerRef.current = setTimeout(() => { hapticSelect(); onLongPress(); }, 250); }}
      onTouchEnd={() => { if (timerRef.current) clearTimeout(timerRef.current); }}
      onTouchMove={() => { if (timerRef.current) clearTimeout(timerRef.current); }}
      onContextMenu={(e) => { e.preventDefault(); onLongPress(); }}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 hover:bg-accent/50 transition-colors select-none ${selected ? "bg-primary/10" : ""}`}
    >
      {selectMode && (selected ? <CheckSquare className="h-4 w-4 text-primary shrink-0" /> : <Square className="h-4 w-4 text-muted-foreground shrink-0" />)}
      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="flex-1 text-sm text-left truncate">{item.title || "(제목 없음)"}</span>
      {/* 즐겨찾기 별 — pinned 일 때만 표시 (실수 토글 방지). 토글은 선택모드의 Star 버튼에서. */}
      {!selectMode && onTogglePin && item.pinned && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onTogglePin(item.id, item.pinned); }}
          className="shrink-0 p-1 rounded hover:bg-accent"
          aria-label="즐겨찾기 해제"
        >
          <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
        </button>
      )}
      {!selectMode && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
    </div>
  );
}
