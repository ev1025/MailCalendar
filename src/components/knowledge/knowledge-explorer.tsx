"use client";

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FileText,
  Pencil,
  Trash2,
  FolderInput,
  Star,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  type DragMoveEvent,
} from "@dnd-kit/core";
import type { KnowledgeFolder, KnowledgeItem } from "@/types";
import ConfirmDialog from "@/components/ui/confirm-dialog";

// Windows 탐색기 스타일 파일·폴더 UI.
// - 클릭: 단일 선택 / Ctrl+클릭: 토글 / Shift+클릭: 범위
// - 빈 영역 클릭: 선택 해제
// - 더블클릭: 폴더 진입 / 노트 열기
// - 우클릭: 컨텍스트 메뉴(이름 변경·삭제·이동)
// - 드래그 & 드롭: 선택 항목을 폴더 위에 드롭하면 이동

type ItemKind = "folder" | "item";
type SelectedRef = { id: string; kind: ItemKind };

interface FlatRow {
  id: string;
  kind: ItemKind;
  depth: number;
  folder?: KnowledgeFolder;
  item?: KnowledgeItem;
}

interface Props {
  folders: KnowledgeFolder[];
  items: KnowledgeItem[];
  onOpenItem: (id: string) => void;
  onNavigateFolder: (id: string) => void;
  onDelete: (selected: SelectedRef[]) => void | Promise<void>;
  onMove: (selected: SelectedRef[], targetFolderId: string | null) => void | Promise<void>;
  onRenameFolder: (id: string, name: string) => void | Promise<void>;
  onRenameItem: (id: string, title: string) => void | Promise<void>;
  onTogglePinItem?: (id: string, pinned: boolean) => Promise<void>;
  /** 부모가 생성 직후 인라인 이름편집 진입시키려 할 때 id 전달. */
  pendingRenameFolderId?: string | null;
  onConsumeRename?: () => void;
  /** 현재 탐색 중인 폴더 id. null/undefined 면 루트 전체. 이 폴더의 자식만 렌더. */
  rootFolderId?: string | null;
  /** 드래그 항목을 이웃한 두 행 사이에 놓을 때 호출.
   *  parent_id 는 드롭 위치의 부모, beforeId 는 그 다음 형제(없으면 맨 끝). */
  onReorder?: (
    selected: SelectedRef[],
    target: { parentId: string | null; beforeId: string | null }
  ) => void | Promise<void>;
  /** DndContext 내부 맨 위에 렌더할 추가 영역 — 예: KnowledgeBreadcrumb 을
   *  droppable 로 넘겨 탐색기 DnD 와 같은 컨텍스트 안에서 경로 드롭을 받게 함. */
  headerSlot?: React.ReactNode;
}

export default function KnowledgeExplorer({
  folders,
  items,
  onOpenItem,
  onNavigateFolder,
  onDelete,
  onMove,
  onRenameFolder,
  onRenameItem,
  onTogglePinItem,
  pendingRenameFolderId,
  onConsumeRename,
  rootFolderId,
  onReorder,
  headerSlot,
}: Props) {
  // 즐겨찾기는 글(노트) 전용 — 폴더 즐겨찾기 기능 제거.
  const favoriteItems = useMemo(() => items.filter((i) => i.pinned), [items]);
  const hasFavorites = favoriteItems.length > 0;

  // 확장 폴더 집합
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = useCallback((id: string) => {
    setExpanded((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  // 선택 상태 — 폴더·노트 id 모두 통합 set 으로 관리. kind 는 lookup 으로.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // shift 범위 선택의 기준점
  const [anchorId, setAnchorId] = useState<string | null>(null);

  // 인라인 이름 편집
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  // 삭제 확인 대상 — refs 가 있으면 ConfirmDialog 노출. confirmDelete 호출 시 onDelete 실행.
  const [pendingDelete, setPendingDelete] = useState<SelectedRef[] | null>(null);

  // 컨텍스트 메뉴 — 마우스 좌표와 대상 id·kind
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    id: string;
    kind: ItemKind;
  } | null>(null);

  // 트리 → flat list: 루트 → 자식(expand 된 폴더만) → 루트 노트
  const flatRows = useMemo<FlatRow[]>(() => {
    const rows: FlatRow[] = [];
    const folderById = new Map(folders.map((f) => [f.id, f]));
    const childrenByParent = new Map<string | null, KnowledgeFolder[]>();
    for (const f of folders) {
      const key = f.parent_id;
      const arr = childrenByParent.get(key) ?? [];
      arr.push(f);
      childrenByParent.set(key, arr);
    }
    for (const [, arr] of childrenByParent) {
      arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }
    const itemsByFolder = new Map<string | null, KnowledgeItem[]>();
    for (const it of items) {
      const key = it.folder_id;
      const arr = itemsByFolder.get(key) ?? [];
      arr.push(it);
      itemsByFolder.set(key, arr);
    }
    // 정렬: pinned 먼저, 같은 범주에서는 sort_order(사용자 지정 순서), 그 다음 updated_at.
    for (const [, arr] of itemsByFolder) {
      arr.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        const sa = a.sort_order ?? 0;
        const sb = b.sort_order ?? 0;
        if (sa !== sb) return sa - sb;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
    }

    const walk = (parentId: string | null, depth: number) => {
      const subs = childrenByParent.get(parentId) ?? [];
      for (const f of subs) {
        rows.push({ id: f.id, kind: "folder", depth, folder: f });
        if (expanded.has(f.id)) {
          walk(f.id, depth + 1);
          const fItems = itemsByFolder.get(f.id) ?? [];
          for (const it of fItems) {
            rows.push({ id: it.id, kind: "item", depth: depth + 1, item: it });
          }
        }
      }
    };
    const baseId = rootFolderId ?? null;
    walk(baseId, 0);
    // 현재 뷰 폴더에 직접 속한 노트 목록 (루트면 folder_id=null, 폴더 뷰면 그 폴더의 item)
    const baseItems = itemsByFolder.get(baseId) ?? [];
    for (const it of baseItems) {
      rows.push({ id: it.id, kind: "item", depth: 0, item: it });
    }
    return rows;
    void folderById; // folderById reserved for future uses
  }, [folders, items, expanded, rootFolderId]);

  // id → 인덱스 맵 (range 선택용)
  const idToIdx = useMemo(() => {
    const m = new Map<string, number>();
    flatRows.forEach((r, i) => m.set(r.id, i));
    return m;
  }, [flatRows]);

  // 부모로부터 받은 "방금 만든 폴더" 신호 → 즉시 인라인 rename
  useEffect(() => {
    if (!pendingRenameFolderId) return;
    const f = folders.find((x) => x.id === pendingRenameFolderId);
    if (!f) return;
    setRenamingId(pendingRenameFolderId);
    setRenameValue(f.name);
    onConsumeRename?.();
  }, [pendingRenameFolderId, folders, onConsumeRename]);

  // 전역 Escape → 이름 편집 · 컨텍스트 메뉴 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCtxMenu(null);
        if (renamingId) {
          setRenamingId(null);
        }
      } else if (e.key === "Delete" && selected.size > 0 && !renamingId) {
        handleDelete();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renamingId, selected]);

  // 컨텍스트 메뉴 바깥 클릭으로 닫기
  useEffect(() => {
    if (!ctxMenu) return;
    const onDown = () => setCtxMenu(null);
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [ctxMenu]);

  // 선택 조작 헬퍼
  const selectOnly = (id: string) => {
    const n = new Set<string>();
    n.add(id);
    setSelected(n);
    setAnchorId(id);
  };
  const toggleOne = (id: string) => {
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setAnchorId(id);
  };
  const selectRange = (toId: string) => {
    if (!anchorId) {
      selectOnly(toId);
      return;
    }
    const a = idToIdx.get(anchorId);
    const b = idToIdx.get(toId);
    if (a === undefined || b === undefined) return;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const n = new Set<string>();
    for (let i = lo; i <= hi; i++) n.add(flatRows[i].id);
    setSelected(n);
  };
  const clearSelection = () => {
    setSelected(new Set());
    setAnchorId(null);
  };

  const kindOf = useCallback(
    (id: string): ItemKind | null => {
      const r = flatRows.find((x) => x.id === id);
      return r?.kind ?? null;
    },
    [flatRows]
  );
  const selectedRefs = (): SelectedRef[] => {
    const refs: SelectedRef[] = [];
    for (const id of selected) {
      const k = kindOf(id);
      if (k) refs.push({ id, kind: k });
    }
    return refs;
  };

  // 행 클릭 — modifier 키 기반 분기
  const handleRowClick = (e: React.MouseEvent, row: FlatRow) => {
    e.stopPropagation();
    if (renamingId) return;
    if (e.shiftKey) {
      selectRange(row.id);
    } else if (e.ctrlKey || e.metaKey) {
      toggleOne(row.id);
    } else {
      selectOnly(row.id);
    }
  };

  const handleRowDoubleClick = (row: FlatRow) => {
    if (renamingId) return;
    if (row.kind === "folder") {
      // 데스크톱 탐색기 관례: 더블클릭 = 확장 토글 + 탐색 이동
      toggleExpand(row.id);
      onNavigateFolder(row.id);
    } else {
      onOpenItem(row.id);
    }
  };

  const handleRowContextMenu = (e: React.MouseEvent, row: FlatRow) => {
    e.preventDefault();
    e.stopPropagation();
    // 현재 선택에 포함돼 있지 않으면 이 항목만 선택으로 바꿔 우클릭 대상 명확화
    if (!selected.has(row.id)) selectOnly(row.id);
    setCtxMenu({ x: e.clientX, y: e.clientY, id: row.id, kind: row.kind });
  };

  // 빈 영역 클릭 → 선택 해제
  const handleContainerClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-explorer-row]")) return;
    if (t.closest("[data-ctx-menu]")) return;
    clearSelection();
    setCtxMenu(null);
  };

  // 이름 편집 시작
  const startRename = (id: string, kind: ItemKind) => {
    if (kind === "folder") {
      const f = folders.find((x) => x.id === id);
      if (!f) return;
      setRenamingId(id);
      setRenameValue(f.name);
    } else {
      const it = items.find((x) => x.id === id);
      if (!it) return;
      setRenamingId(id);
      setRenameValue(it.title);
    }
  };

  const commitRename = async () => {
    if (!renamingId) return;
    const value = renameValue.trim();
    if (!value) {
      setRenamingId(null);
      return;
    }
    const k = kindOf(renamingId);
    if (k === "folder") await onRenameFolder(renamingId, value);
    else if (k === "item") await onRenameItem(renamingId, value);
    setRenamingId(null);
  };

  // 삭제 — folder-note-list 와 동일하게 ConfirmDialog 통과 후 실제 삭제. 즉시 삭제 X.
  const handleDelete = () => {
    const refs = selectedRefs();
    if (refs.length === 0) return;
    setPendingDelete(refs);
  };
  const performDelete = async () => {
    if (!pendingDelete) return;
    await onDelete(pendingDelete);
    setPendingDelete(null);
    clearSelection();
  };

  // DnD — 선택된 항목을 폴더로 드래그 이동
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // 모바일: 200ms 길게 눌러야 드래그 — 탭(폴더 진입)·세로 스크롤과 분리.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    // 드래그 대상이 현재 선택에 포함 안 되어 있으면 단일 선택으로 맞춤
    if (!selected.has(id)) selectOnly(id);
    setDragId(id);
  };
  const onDragEnd = async (e: DragEndEvent) => {
    setDragId(null);
    const over = e.over;
    if (!over) return;
    const targetId = String(over.id);
    const refs = selectedRefs();
    if (refs.length === 0) return;

    // 드롭 대상 id 포맷:
    //  - "folder:<id>"           : 폴더 안으로 이동
    //  - "explorer-base-drop"    : 현재 뷰 폴더에 남김
    //  - "gap:<parentId>:<beforeId>" : 두 행 사이 (같은 parent 기준, before 앞에 삽입)
    if (targetId.startsWith("gap:")) {
      // 재정렬 drop — 부모(parentId)의 item 목록에서 beforeId 앞에 삽입.
      const [, parentIdPart, beforeIdPart] = targetId.split(":");
      const parentId = parentIdPart === "" ? null : parentIdPart;
      const beforeId = beforeIdPart === "" ? null : beforeIdPart;
      if (onReorder) {
        await onReorder(refs, { parentId, beforeId });
      }
      clearSelection();
      return;
    }

    let targetFolderId: string | null;
    if (targetId === "explorer-base-drop") {
      targetFolderId = rootFolderId ?? null;
    } else if (targetId.startsWith("folder:")) {
      targetFolderId = targetId.slice("folder:".length);
    } else if (targetId === "breadcrumb:home") {
      targetFolderId = null;
    } else if (targetId.startsWith("breadcrumb:")) {
      targetFolderId = targetId.slice("breadcrumb:".length);
    } else return;
    // 자기 자신 / 선택된 폴더 내부로 이동 금지
    if (targetFolderId && refs.some((r) => r.kind === "folder" && r.id === targetFolderId)) return;
    // 이동 대상이 모두 이미 그 부모에 속해있다면 no-op (드래그 후 제자리 드롭).
    const noChangeNeeded = refs.every((r) => {
      if (r.kind === "item") {
        return (items.find((i) => i.id === r.id)?.folder_id ?? null) === targetFolderId;
      } else {
        return (folders.find((f) => f.id === r.id)?.parent_id ?? null) === targetFolderId;
      }
    });
    if (noChangeNeeded) {
      clearSelection();
      return;
    }
    await onMove(refs, targetFolderId);
    clearSelection();
  };

  const dragLabel = dragId
    ? selected.size > 1
      ? `${selected.size}개 항목`
      : kindOf(dragId) === "folder"
        ? folders.find((f) => f.id === dragId)?.name ?? ""
        : items.find((i) => i.id === dragId)?.title || "(제목 없음)"
    : "";

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      {headerSlot}
      <div
        className="flex flex-col h-full w-full overflow-hidden"
        onClick={handleContainerClick}
      >
        <RootDropZone>
          <div className="flex-1 overflow-y-auto">
            {/* 즐겨찾기 섹션 — 글(노트) 전용. 최상단 고정.
                section 자체엔 좌측 padding 을 주지 않고 버튼에 pl-2 적용 →
                아래 기본 탐색기 행(paddingLeft: 8 + w-4 placeholder + gap) 과 같은 x 기준. */}
            {hasFavorites && (
              <section data-fav-section className="flex flex-col gap-0.5 py-2 border-b">
                <h3 className="flex items-center gap-1.5 px-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground">
                  <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                  즐겨찾기
                </h3>
                {favoriteItems.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => onOpenItem(it.id)}
                    className="flex items-center gap-1.5 rounded-md pl-2 pr-2 py-1.5 text-[13px] text-left hover:bg-accent/60"
                  >
                    {/* 본문 트리 행의 chevron placeholder 와 같은 간격 → 아이콘 수직 정렬. */}
                    <span className="h-4 w-4 shrink-0" />
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{it.title || "(제목 없음)"}</span>
                  </button>
                ))}
              </section>
            )}
            {/* 메인 트리 — 구분선 위와 같은 상하 간격(py-2)으로 대칭 유지. */}
            <div className={hasFavorites ? "pt-2" : ""}>
            {flatRows.length === 0 && (
              <div className="py-10 text-center text-xs text-muted-foreground">
                항목 없음
              </div>
            )}
            {flatRows.map((row, idx) => {
              // 같은 parent 를 공유하는 바로 "위" 행이면 그 사이 gap 을 item 재정렬 대상으로 렌더.
              // parent_id 는 row 의 부모(folder → parent_id, item → folder_id).
              const parentOf = (r: FlatRow): string | null =>
                r.kind === "folder"
                  ? r.folder?.parent_id ?? null
                  : r.item?.folder_id ?? null;
              const prev = idx > 0 ? flatRows[idx - 1] : null;
              const sameParent = prev && parentOf(prev) === parentOf(row);
              return (
                <div key={row.id}>
                  {sameParent && row.kind === "item" && (
                    <DropGap parentId={parentOf(row)} beforeId={row.id} />
                  )}
                  <ExplorerRow
                    row={row}
                    selected={selected.has(row.id)}
                    expanded={row.kind === "folder" ? expanded.has(row.id) : false}
                    hasChildren={
                      row.kind === "folder" &&
                      (folders.some((f) => f.parent_id === row.id) ||
                        items.some((i) => i.folder_id === row.id))
                    }
                    renaming={renamingId === row.id}
                    renameValue={renameValue}
                    onRenameChange={setRenameValue}
                    onRenameCommit={commitRename}
                    onToggleExpand={() => toggleExpand(row.id)}
                    onClick={(e) => handleRowClick(e, row)}
                    onDoubleClick={() => handleRowDoubleClick(row)}
                    onContextMenu={(e) => handleRowContextMenu(e, row)}
                    isFolderFav={false}
                    onToggleFolderFav={undefined}
                    onTogglePinItem={
                      row.kind === "item" && onTogglePinItem && row.item
                        ? () => onTogglePinItem(row.item!.id, row.item!.pinned)
                        : undefined
                    }
                  />
                  {/* 마지막 item 뒤에는 "끝" gap 렌더 — beforeId=null (맨 아래에 삽입). */}
                  {row.kind === "item" &&
                    (idx === flatRows.length - 1 ||
                      parentOf(flatRows[idx + 1]) !== parentOf(row)) && (
                      <DropGap parentId={parentOf(row)} beforeId={null} />
                    )}
                </div>
              );
            })}
            </div>
          </div>
        </RootDropZone>
      </div>

      {/* 컨텍스트 메뉴 */}
      {ctxMenu && (
        <div
          data-ctx-menu
          className="fixed z-50 min-w-[160px] rounded-md border bg-popover p-1 shadow-md text-sm"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-accent"
            onClick={() => {
              if (selected.size === 1) startRename(ctxMenu.id, ctxMenu.kind);
              setCtxMenu(null);
            }}
            disabled={selected.size !== 1}
          >
            <Pencil className="h-3.5 w-3.5" />
            이름 변경
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-accent"
            onClick={() => {
              onMove(selectedRefs(), null);
              setCtxMenu(null);
              clearSelection();
            }}
          >
            <FolderInput className="h-3.5 w-3.5" />
            루트로 이동
          </button>
          <div className="h-px my-1 bg-border" />
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-destructive hover:bg-destructive/10"
            onClick={() => {
              handleDelete();
              setCtxMenu(null);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            삭제
          </button>
        </div>
      )}

      <DragOverlay>
        {dragId ? (
          (() => {
            const k = kindOf(dragId);
            const isMulti = selected.size > 1;
            if (isMulti) {
              return (
                <div className="rounded-md border bg-background/95 px-3 py-1.5 text-xs shadow-lg backdrop-blur font-medium">
                  {selected.size}개 항목
                </div>
              );
            }
            // 단일 드래그 — 실제 행 모양 그대로 복제.
            return (
              <div className="inline-flex items-center gap-1.5 rounded-md border bg-background/95 px-2 py-1.5 shadow-lg backdrop-blur">
                <span className="h-4 w-4 shrink-0" />
                {k === "folder" ? (
                  <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className={`text-sm truncate ${k === "folder" ? "font-medium" : ""}`}>
                  {dragLabel}
                </span>
              </div>
            );
          })()
        ) : null}
      </DragOverlay>

      {/* 삭제 확인 — folder-note-list 와 동일 메시지/패턴. */}
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        title={
          pendingDelete
            ? (() => {
                const folderCount = pendingDelete.filter((r) => r.kind === "folder").length;
                const itemCount = pendingDelete.filter((r) => r.kind === "item").length;
                if (folderCount > 0 && itemCount > 0)
                  return `폴더 ${folderCount}개 · 노트 ${itemCount}개 삭제`;
                if (folderCount > 0) return `폴더 ${folderCount}개 삭제`;
                return `노트 ${itemCount}개 삭제`;
              })()
            : "삭제"
        }
        description={
          pendingDelete?.some((r) => r.kind === "folder")
            ? "폴더 안의 모든 하위 노트와 폴더가 함께 삭제돼요."
            : "삭제하면 되돌릴 수 없어요."
        }
        confirmLabel="삭제"
        destructive
        onConfirm={performDelete}
      />
    </DndContext>
  );
}

// 배경 드롭존 — "현재 뷰 폴더에 유지/이동" 대상. rootFolderId 가 있으면 그 폴더, 없으면 전역 root.
function RootDropZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: "explorer-base-drop" });
  return (
    <div ref={setNodeRef} className="flex flex-col flex-1 min-h-0">
      {children}
    </div>
  );
}

/* ── 개별 행 ── */
interface RowProps {
  row: FlatRow;
  selected: boolean;
  expanded: boolean;
  hasChildren: boolean;
  renaming: boolean;
  renameValue: string;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onToggleExpand: () => void;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  isFolderFav: boolean;
  onToggleFolderFav?: () => void;
  onTogglePinItem?: () => void;
}

function ExplorerRow({
  row,
  selected,
  expanded,
  hasChildren,
  renaming,
  renameValue,
  onRenameChange,
  onRenameCommit,
  onToggleExpand,
  onClick,
  onDoubleClick,
  onContextMenu,
  isFolderFav,
  onToggleFolderFav,
  onTogglePinItem,
}: RowProps) {
  const isFolder = row.kind === "folder";
  const dropId = isFolder ? `folder:${row.id}` : `item:${row.id}`;
  // 폴더는 드롭 대상 + 드래그 소스, 노트는 드래그 소스만
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: dropId });
  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({
    id: row.id,
  });

  const setRef = (el: HTMLElement | null) => {
    setDragRef(el);
    if (isFolder) setDropRef(el);
  };

  return (
    <div
      ref={setRef}
      data-explorer-row
      data-sel-id={row.id}
      data-sel-type={row.kind}
      {...attributes}
      {...listeners}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className={`flex items-center gap-1.5 rounded-md py-1.5 pr-2 pl-2 transition-colors select-none cursor-default ${
        selected
          ? "bg-primary/10"
          : isOver && isFolder
            ? "bg-accent"
            : "hover:bg-accent/50"
      }`}
      style={{ paddingLeft: row.depth * 16 + 8 }}
    >
      {/* 폴더 토글 화살표. 자식 없거나 노트인 경우엔 placeholder 로 같은 너비 유지 →
          파일 아이콘·폴더 아이콘 왼쪽 정렬. */}
      {isFolder && hasChildren ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground"
        >
          <ChevronRight
            className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        </button>
      ) : (
        <span className="h-4 w-4 shrink-0" />
      )}
      {isFolder ? (
        expanded ? (
          <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
        )
      ) : (
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      {renaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onBlur={onRenameCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRenameCommit();
            if (e.key === "Escape") onRenameCommit();
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="flex-1 text-sm bg-transparent border-b border-primary outline-none px-0.5 min-w-0"
        />
      ) : (
        <span
          className={`flex-1 text-[13px] text-left truncate ${isFolder ? "font-medium" : ""}`}
        >
          {isFolder
            ? row.folder!.name
            : row.item!.title || "(제목 없음)"}
        </span>
      )}
      {/* 즐겨찾기 표시 — 항상 자리 차지. */}
      {isFolder && onToggleFolderFav ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFolderFav();
          }}
          className="shrink-0 p-1 rounded hover:bg-accent"
          aria-label={isFolderFav ? "즐겨찾기 해제" : "즐겨찾기"}
        >
          <Star
            className={`h-3.5 w-3.5 ${isFolderFav ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"}`}
          />
        </button>
      ) : !isFolder && onTogglePinItem ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePinItem();
          }}
          className="shrink-0 p-1 rounded hover:bg-accent"
          aria-label={row.item?.pinned ? "즐겨찾기 해제" : "즐겨찾기"}
        >
          <Star
            className={`h-3.5 w-3.5 ${row.item?.pinned ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"}`}
          />
        </button>
      ) : null}
    </div>
  );
}

/* ── 행 사이 드롭 갭 — 재정렬 인디케이터 ── */
function DropGap({
  parentId,
  beforeId,
}: {
  parentId: string | null;
  beforeId: string | null;
}) {
  const id = `gap:${parentId ?? ""}:${beforeId ?? ""}`;
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className="relative h-1.5"
      data-drop-gap
    >
      {isOver && (
        <div className="absolute left-2 right-2 top-1/2 h-px -translate-y-1/2 rounded bg-blue-600" />
      )}
    </div>
  );
}
