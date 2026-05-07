"use client";

import { Suspense, useState, useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FolderPlus, FilePlus } from "lucide-react";
import { useKnowledgeFolders } from "@/hooks/use-knowledge-folders";
import {
  useKnowledgeItems,
  searchKnowledge,
} from "@/hooks/use-knowledge-items";
import { useKnowledgeRouter } from "@/hooks/use-knowledge-router";
import { useKnowledgeDrafts, type KnowledgeDraft } from "@/hooks/use-knowledge-drafts";
import KnowledgeDashboard from "@/components/knowledge/knowledge-dashboard";
import FolderNoteList from "@/components/knowledge/folder-note-list";
import NoteEditorView from "@/components/knowledge/note-editor-view";
import NoteReaderView from "@/components/knowledge/note-reader-view";
import KnowledgeExplorer from "@/components/knowledge/knowledge-explorer";
import KnowledgeSidebarTree from "@/components/knowledge/knowledge-sidebar-tree";
import type { KnowledgeItem } from "@/types";
import { toast } from "sonner";
import { sanitizeRichHTML, stripHtml } from "@/lib/sanitize";
import PageHeader from "@/components/layout/page-header";
import PromptDialog from "@/components/ui/prompt-dialog";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import SearchInput from "@/components/ui/search-input";
import KnowledgeBreadcrumb from "@/components/knowledge/breadcrumb";

export default function KnowledgePage() {
  return (
    <Suspense fallback={null}>
      <KnowledgePageInner />
    </Suspense>
  );
}

function KnowledgePageInner() {
  const { folders, loading: foldersLoading, addFolder, updateFolder, deleteFolder } = useKnowledgeFolders();
  const { items, loading: itemsLoading, addItem, updateItem, deleteItem, refetch } =
    useKnowledgeItems(null);
  const knowledgeLoading = foldersLoading || itemsLoading;

  const {
    selectedItemId,
    viewFolderId,
    setSelectedItemId,
    setViewFolderId,
    _setSelectedItemIdDirect,
  } = useKnowledgeRouter();

  const {
    drafts,
    autoSavedAt,
    saveDraft,
    deleteDraft,
    armAutoSave,
  } = useKnowledgeDrafts();

  // ── 편집 상태 ────────────────────────────────────────
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dashSelectMode, setDashSelectMode] = useState(false);
  const [folderSelectMode, setFolderSelectMode] = useState(false);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [folderPromptOpen, setFolderPromptOpen] = useState(false);
  const [folderPromptParentId, setFolderPromptParentId] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<KnowledgeDraft | null>(null);
  // Lazy-create: "새 노트" 를 눌러도 DB 에 행을 만들지 않고 메모리에서만 드래프트 유지.
  // 저장 버튼 누를 때 비로소 addItem. 내용 없이 이탈·탭닫기·새로고침 해도 유령 행 없음.
  const [pendingNew, setPendingNew] = useState<{ folderId: string | null } | null>(null);
  // 방금 생성된 폴더 id → 대시보드에서 즉시 인라인 이름편집 진입용 신호.
  const [pendingRenameFolderId, setPendingRenameFolderId] = useState<string | null>(null);

  // ── 검색 ────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<KnowledgeItem[]>([]);

  useEffect(() => {
    if (!search.trim()) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearchResults(await searchKnowledge(search));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const selectedItem = useMemo(
    () =>
      items.find((i) => i.id === selectedItemId) ||
      searchResults.find((i) => i.id === selectedItemId) ||
      null,
    [items, searchResults, selectedItemId]
  );

  // ── 자동 임시저장 (60초 idle) — pendingNew 일 땐 folder_id 를 pendingNew 에서 가져옴 ───
  useEffect(() => {
    if (!dirty) return;
    return armAutoSave({
      title: editTitle,
      content: editContent,
      source_id: selectedItem?.id ?? null,
      folder_id: selectedItem?.folder_id ?? pendingNew?.folderId ?? null,
      enabled: true,
    });
  }, [editTitle, editContent, dirty, selectedItem?.id, selectedItem?.folder_id, pendingNew?.folderId, armAutoSave]);

  // 선택된 노트 변경 시 편집 state 초기화
  useEffect(() => {
    if (selectedItem) {
      setEditTitle(selectedItem.title);
      setEditContent(selectedItem.content || "");
      setDirty(false);
      setEditing(!selectedItem.content && !selectedItem.title);
    } else {
      setEditTitle("");
      setEditContent("");
      setEditing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItem?.id]);

  // ── 액션 핸들러 ─────────────────────────────────────
  // 새 폴더는 PromptDialog 로 이름 먼저 입력받아 생성 — 모바일에서 인라인 rename
  // 진입이 어려워 통일된 흐름이 더 자연스러움.
  const handleAddFolder = (parentId: string | null) => {
    setFolderPromptParentId(parentId);
    setFolderPromptOpen(true);
  };

  const handleAddItem = async (folderId: string | null) => {
    // DB 에 행 만들지 않고 메모리에서만 pendingNew 상태로 에디터 오픈.
    // 저장 시 비로소 addItem. 내용 없이 닫히면 DB 변경 없음.
    setSelectedItemId(null);
    setPendingNew({ folderId });
    setEditTitle("");
    setEditContent("");
    setDirty(false);
    setEditing(true);
  };

  // 편집 → 읽기 모드 전환. pendingNew 면 아무것도 DB 에 없으니 그냥 상태만 리셋.
  const handleExitEditor = async () => {
    if (pendingNew) {
      setPendingNew(null);
      setSelectedItemId(null);
      setViewFolderId(null);
      setEditing(false);
      return;
    }
    setEditing(false);
  };

  // 취소 처리:
  //  - pendingNew(새 노트): DB 행 없으니 선택 해제하고 메인으로.
  //  - 기존 노트 편집: 선택은 유지하고 editing=false → 읽기 모드 복귀.
  const handleCancel = () => {
    if (pendingNew) {
      setPendingNew(null);
      setSelectedItemId(null);
      setEditing(false);
      setDirty(false);
      return;
    }
    // 기존 노트 — 읽기 모드로만 복귀. 입력값 리셋은 selectedItem.id useEffect 가 처리.
    if (selectedItem) {
      setEditTitle(selectedItem.title);
      setEditContent(selectedItem.content || "");
    }
    setEditing(false);
    setDirty(false);
  };

  // 읽기 모드에서 홈(뒤로) 이동. pendingNew 상태는 편집 모드에서만 가능하니 여기선 고려 불필요.
  const handleExitReader = async () => {
    setSelectedItemId(null);
    setViewFolderId(null);
  };

  const handleSave = async () => {
    // pendingNew 모드 — 내용 있으면 addItem, 없으면 그냥 상태 리셋(no-op).
    if (pendingNew) {
      const trimmedTitle = editTitle.trim();
      const textOnly = stripHtml(editContent);
      if (!trimmedTitle && !textOnly) {
        setPendingNew(null);
        setEditing(false);
        return;
      }
      const { data, error } = await addItem({
        folder_id: pendingNew.folderId,
        title: editTitle,
        content: sanitizeRichHTML(editContent),
        excerpt: null,
        tags: null,
        pinned: false,
        type: "note",
        url: null,
      });
      if (error) {
        toast.error("저장 실패");
        return;
      }
      if (data) {
        setPendingNew(null);
        setSelectedItemId(data.id);
        setDirty(false);
        setEditing(false);
        toast.success("저장됐어요");
      }
      return;
    }

    if (!selectedItem) return;
    const { error } = await updateItem(selectedItem.id, {
      title: editTitle,
      content: sanitizeRichHTML(editContent),
    });
    if (error) {
      toast.error("저장 실패");
      return;
    }
    setDirty(false);
    setEditing(false);
    toast.success("저장됐어요");
  };

  const handleSaveDraft = () => {
    if (!editTitle.trim() && !editContent.trim()) {
      toast.error("내용이 비어있습니다");
      return;
    }
    saveDraft({
      source_id: selectedItem?.id ?? null,
      folder_id: selectedItem?.folder_id ?? pendingNew?.folderId ?? null,
      title: editTitle || "(제목 없음)",
      content: editContent,
    });
  };

  const handleLoadDraft = (d: KnowledgeDraft) => {
    if (dirty) {
      setPendingDraft(d);
      return;
    }
    performLoadDraft(d);
  };

  const performLoadDraft = (d: KnowledgeDraft) => {
    if (d.source_id) {
      setSelectedItemId(d.source_id);
      setTimeout(() => {
        setEditTitle(d.title);
        setEditContent(d.content);
        setDirty(true);
      }, 50);
    } else {
      addItem({
        folder_id: d.folder_id,
        title: d.title,
        content: d.content,
        excerpt: null,
        tags: null,
        pinned: false,
        type: "note",
        url: null,
      }).then(({ data }) => {
        if (data) {
          _setSelectedItemIdDirect(data.id);
          setEditTitle(d.title);
          setEditContent(d.content);
        }
      });
    }
    setDraftsOpen(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await deleteItem(id);
    if (error) {
      toast.error("삭제 실패");
      return;
    }
    if (selectedItemId === id) setSelectedItemId(null);
    toast.success("삭제됐어요");
  };

  // pendingNew(드래프트 에디터) 상태도 "노트 뷰" 로 취급 — PageHeader 숨김·전체화면 적용.
  const noteOpen = !!selectedItem || !!pendingNew;

  const listActions = (
    <>
      <button
        type="button"
        onClick={() => handleAddFolder(viewFolderId)}
        aria-label="폴더 추가"
        title="폴더 추가"
        className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
      >
        <FolderPlus className="h-[20px] w-[20px]" strokeWidth={1.6} />
      </button>
      <button
        type="button"
        onClick={() => handleAddItem(viewFolderId)}
        aria-label="새 노트"
        title="새 노트"
        className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
      >
        <FilePlus className="h-[20px] w-[20px]" strokeWidth={1.6} />
      </button>
    </>
  );

  // PageHeader 는 선택 모드에서도 계속 노출 — 이전엔 선택 진입 시 PageHeader 를
  // 언마운트해서 h-14 가 사라져 아래 요소가 위로 밀리며 "손가락 아래 항목이 바뀌는"
  // 레이아웃 이동이 발생했음. 지금은 제목 유지, 선택 모드일 때 actions(폴더/파일
  // 추가) 만 숨기고, 실제 선택 툴바는 대시보드 내부 검색창 자리에 인라인으로 렌더.
  const hideHeaderOnMobile = noteOpen;
  const inSelectMode = dashSelectMode || folderSelectMode;

  return (
    <>
      <div className={hideHeaderOnMobile ? "hidden md:block" : ""}>
        <PageHeader title="지식창고" actions={inSelectMode ? null : listActions} />
      </div>
      <div
        className={`flex min-h-0 ${
          dashSelectMode || folderSelectMode
            ? "h-full md:h-[calc(100vh-3.5rem)]"
            : hideHeaderOnMobile
            ? "h-full md:h-[calc(100vh-3.5rem)]"
            : "h-[calc(100%-3.5rem)] md:h-[calc(100vh-3.5rem)]"
        }`}
      >
        {/* 데스크톱 좌측 탐색기 — 항상 노출. 맨 위 검색박스는 폴더 진입 시에도 유지.
            그 아래에 대시보드 or FolderNoteList(breadcrumb+목록) 렌더. */}
        <aside className="hidden md:flex md:w-72 shrink-0 flex-col overflow-hidden border-r bg-muted/10">
          {/* 선택 모드에선 툴바가 위로 오도록 검색창 숨김 (브레드크럼은 explorer 안쪽 slot 으로 이동). */}
          {!dashSelectMode && !folderSelectMode && (
            <div className="p-3 flex flex-col gap-2">
              <SearchInput value={search} onChange={setSearch} placeholder="노트 검색..." size="md" />
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            {/* 데스크톱: Windows 스타일 통합 탐색기. 단일 클릭·Ctrl·Shift·더블클릭·우클릭·DnD.
                Breadcrumb 을 DndContext 내부 headerSlot 에 넣어야 경로로 드래그 드롭 가능. */}
            <KnowledgeExplorer
              folders={folders}
              items={items}
              rootFolderId={
                viewFolderId && viewFolderId !== "__unfiled__" ? viewFolderId : null
              }
              headerSlot={
                !dashSelectMode && !folderSelectMode ? (
                  <div className="px-3 pt-3 pb-1">
                    <KnowledgeBreadcrumb
                      folder={
                        viewFolderId && viewFolderId !== "__unfiled__"
                          ? folders.find((f) => f.id === viewFolderId) || null
                          : null
                      }
                      folders={folders}
                      onNavigate={(fid) => setViewFolderId(fid)}
                      droppable
                    />
                  </div>
                ) : null
              }
              onOpenItem={(id) => setSelectedItemId(id)}
              onNavigateFolder={(fid) => setViewFolderId(fid)}
              onDelete={async (refs) => {
                for (const r of refs) {
                  if (r.kind === "item") await handleDelete(r.id);
                  else deleteFolder(r.id);
                }
                refetch();
              }}
              onMove={async (refs, targetFolderId) => {
                for (const r of refs) {
                  if (r.kind === "item") await updateItem(r.id, { folder_id: targetFolderId });
                  else await updateFolder(r.id, { parent_id: targetFolderId });
                }
              }}
              onRenameFolder={async (id, name) => {
                await updateFolder(id, { name });
              }}
              onRenameItem={async (id, title) => {
                await updateItem(id, { title });
              }}
              onTogglePinItem={async (id, pinned) => {
                await updateItem(id, { pinned: !pinned });
              }}
              pendingRenameFolderId={pendingRenameFolderId}
              onConsumeRename={() => setPendingRenameFolderId(null)}
              onReorder={async (refs, target) => {
                // 재정렬: 드래그 대상 item 들을 target.parentId 폴더의 beforeId 앞에 삽입.
                // 동일 폴더의 나머지 item 들 sort_order 를 1부터 재번호.
                const movedIds = new Set(refs.filter((r) => r.kind === "item").map((r) => r.id));
                if (movedIds.size === 0) return;
                // 해당 폴더의 기존 item 들 (정렬 순서대로)
                const siblings = items
                  .filter((i) => (i.folder_id ?? null) === target.parentId && !movedIds.has(i.id))
                  .sort((a, b) => {
                    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
                    const sa = a.sort_order ?? 0;
                    const sb = b.sort_order ?? 0;
                    if (sa !== sb) return sa - sb;
                    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
                  });
                const movedItems = Array.from(movedIds)
                  .map((id) => items.find((i) => i.id === id))
                  .filter(Boolean) as typeof items;
                // 삽입: beforeId 앞 위치 찾기
                let insertAt = siblings.length;
                if (target.beforeId) {
                  const idx = siblings.findIndex((i) => i.id === target.beforeId);
                  if (idx >= 0) insertAt = idx;
                }
                const next = [...siblings.slice(0, insertAt), ...movedItems, ...siblings.slice(insertAt)];
                // 모든 형제의 sort_order + folder_id 업데이트 (1부터 증가)
                for (let i = 0; i < next.length; i++) {
                  const it = next[i];
                  const patch: Record<string, unknown> = { sort_order: i + 1 };
                  if ((it.folder_id ?? null) !== target.parentId) patch.folder_id = target.parentId;
                  await updateItem(it.id, patch);
                }
              }}
            />
          </div>
        </aside>

        <main className="flex flex-1 flex-col overflow-hidden">
          {/* editor ↔ reader 전환 cross-fade (140ms). 같은 view 내 콘텐츠 변경은
              key 가 같아 애니메이션 발화 안 함. AnimatePresence mode="wait" 로
              레이아웃 점프 방지. 빈 상태 분기는 외부 — 모바일 대시보드 분기 보호. */}
          {pendingNew && editing ? (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key="editor-pending"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14 }}
                className="flex flex-1 flex-col overflow-hidden"
              >
                <NoteEditorView
                  item={{
                    id: "__pending__",
                    folder_id: pendingNew.folderId,
                    title: "",
                    content: "",
                    excerpt: null,
                    tags: null,
                    pinned: false,
                    type: "note",
                    url: null,
                    created_at: "",
                    updated_at: "",
                  }}
                  title={editTitle}
                  onTitleChange={(v) => {
                    setEditTitle(v);
                    setDirty(true);
                  }}
                  onContentChange={(html) => {
                    setEditContent(html);
                    setDirty(true);
                  }}
                  onSave={handleSave}
                  onSaveDraft={handleSaveDraft}
                  onExit={handleExitEditor}
                  onCancel={handleCancel}
                  dirty={dirty}
                  autoSavedAt={autoSavedAt}
                  drafts={drafts}
                  onLoadDraft={handleLoadDraft}
                  onDeleteDraft={deleteDraft}
                  draftsOpen={draftsOpen}
                  onDraftsOpenChange={setDraftsOpen}
                />
              </motion.div>
            </AnimatePresence>
          ) : selectedItem ? (
            <AnimatePresence mode="wait" initial={false}>
              {editing ? (
                <motion.div
                  key={`editor-${selectedItem.id}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.14 }}
                  className="flex flex-1 flex-col overflow-hidden"
                >
                  <NoteEditorView
                    item={selectedItem}
                    title={editTitle}
                    onTitleChange={(v) => {
                      setEditTitle(v);
                      setDirty(true);
                    }}
                    onContentChange={(html) => {
                      setEditContent(html);
                      setDirty(true);
                    }}
                    onSave={handleSave}
                    onSaveDraft={handleSaveDraft}
                    onExit={handleExitEditor}
                    onCancel={handleCancel}
                    dirty={dirty}
                    autoSavedAt={autoSavedAt}
                    drafts={drafts}
                    onLoadDraft={handleLoadDraft}
                    onDeleteDraft={deleteDraft}
                    draftsOpen={draftsOpen}
                    onDraftsOpenChange={setDraftsOpen}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key={`reader-${selectedItem.id}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.14 }}
                  className="flex flex-1 flex-col overflow-hidden"
                >
                  <NoteReaderView
                    item={selectedItem}
                    onEdit={() => setEditing(true)}
                    onExit={handleExitReader}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          ) : (
            <>
              {/* 데스크톱: 노트 미선택 시 빈 상태 */}
              <div className="hidden md:flex flex-1 items-center justify-center text-sm text-muted-foreground">
                글을 선택해주세요
              </div>
              {/* 모바일: 기존 전체화면 대시보드/폴더 목록 플로우 유지 */}
              <div className="md:hidden flex flex-1 flex-col overflow-hidden">
                {viewFolderId ? (
                  <FolderNoteList
                    folder={
                      viewFolderId === "__unfiled__"
                        ? null
                        : folders.find((f) => f.id === viewFolderId) || null
                    }
                    folders={folders}
                    items={items}
                    loading={knowledgeLoading}
                    onSelectItem={(id) => setSelectedItemId(id)}
                    onSelectFolder={(fid) => setViewFolderId(fid)}
                    onNavigateToFolder={(fid) => setViewFolderId(fid)}
                    onDeleteItems={async (ids) => {
                      for (const id of ids) await handleDelete(id);
                    }}
                    onDeleteFolders={async (ids) => {
                      for (const id of ids) deleteFolder(id);
                      refetch();
                    }}
                    onRenameFolder={async (id, name) => {
                      await updateFolder(id, { name });
                    }}
                    onRenameItem={async (id, title) => {
                      await updateItem(id, { title });
                    }}
                    onMoveItems={async (ids, targetFolderId) => {
                      for (const id of ids) await updateItem(id, { folder_id: targetFolderId });
                    }}
                    onMoveFolders={async (ids, targetFolderId) => {
                      for (const id of ids) await updateFolder(id, { parent_id: targetFolderId });
                    }}
                    onSelectModeChange={setFolderSelectMode}
                    onTogglePinItem={async (id, pinned) => {
                      await updateItem(id, { pinned: !pinned });
                    }}
                    searchQuery={search}
                    onSearch={setSearch}
                  />
                ) : (
                  <KnowledgeDashboard
                    folders={folders}
                    items={items}
                    loading={knowledgeLoading}
                    onSelectItem={(id) => setSelectedItemId(id)}
                    onSelectFolder={(fid) => setViewFolderId(fid)}
                    onSearch={setSearch}
                    searchQuery={search}
                    searchResults={searchResults}
                    onDeleteItems={async (ids) => {
                      for (const id of ids) await handleDelete(id);
                    }}
                    onDeleteFolders={async (ids) => {
                      for (const id of ids) deleteFolder(id);
                      refetch();
                    }}
                    onRenameFolder={async (id, name) => {
                      await updateFolder(id, { name });
                    }}
                    onRenameItem={async (id, title) => {
                      await updateItem(id, { title });
                    }}
                    onSelectModeChange={setDashSelectMode}
                    onMoveItems={async (ids, targetFolderId) => {
                      for (const id of ids) await updateItem(id, { folder_id: targetFolderId });
                    }}
                    onMoveFolders={async (ids, targetFolderId) => {
                      for (const id of ids) await updateFolder(id, { parent_id: targetFolderId });
                    }}
                    onTogglePinItem={async (id, pinned) => {
                      await updateItem(id, { pinned: !pinned });
                    }}
                  />
                )}
              </div>
            </>
          )}
        </main>

        <PromptDialog
          open={folderPromptOpen}
          onOpenChange={setFolderPromptOpen}
          title="새 폴더 만들기"
          placeholder="폴더 이름"
          confirmLabel="만들기"
          onConfirm={async (name) => {
            await addFolder(name, undefined, folderPromptParentId);
          }}
        />

        <ConfirmDialog
          open={!!pendingDraft}
          onOpenChange={(o) => {
            if (!o) setPendingDraft(null);
          }}
          title="작성 중인 내용"
          description="작성 중인 내용이 사라집니다. 계속할까요?"
          confirmLabel="불러오기"
          destructive
          onConfirm={async () => {
            if (pendingDraft) performLoadDraft(pendingDraft);
            setPendingDraft(null);
          }}
        />
      </div>
    </>
  );
}
