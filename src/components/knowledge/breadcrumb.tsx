"use client";

import { Home, ChevronRight } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import type { KnowledgeFolder } from "@/types";

// 현재 폴더를 기준으로 루트까지의 경로를 생성.
// ex) [지식창고] › [개발] › [Python]
// 각 경로 항목 클릭 시 해당 폴더로 이동 (onNavigate(null) 이면 홈).

interface Props {
  folder: KnowledgeFolder | null;
  folders: KnowledgeFolder[];
  onNavigate: (folderId: string | null) => void;
  // 노트 상세 화면에서 쓰일 때는 마지막에 노트 제목을 보조로 노출
  trailingLabel?: string;
  /** true 면 각 경로 항목이 dnd-kit useDroppable 로 활성 — 파일/폴더 드롭 시 해당 경로로 이동.
   *  상위에 동일 DndContext 가 있어야 함. 현재는 KnowledgeExplorer 내부에서 true 로 사용. */
  droppable?: boolean;
}

// 각 경로 버튼용 wrapper — droppable=true 일 때만 useDroppable 로 감쌈.
function CrumbDroppable({
  id,
  enabled,
  children,
}: {
  id: string;
  enabled: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !enabled });
  return (
    <span
      ref={setNodeRef}
      className={`inline-flex items-center rounded ${
        isOver ? "ring-2 ring-primary bg-primary/10" : ""
      }`}
    >
      {children}
    </span>
  );
}

function buildPath(folders: KnowledgeFolder[], leaf: KnowledgeFolder): KnowledgeFolder[] {
  const path: KnowledgeFolder[] = [];
  let current: KnowledgeFolder | undefined = leaf;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = folders.find((f) => f.id === current!.parent_id);
  }
  return path;
}

// 표시할 경로의 최대 개수. 이를 초과하면 중간을 "..." 으로 축약.
// 표준 관례: 끝 2개(현재 + 부모)만 그대로 보이고 나머지는 접음.
const MAX_VISIBLE_TAIL = 2;

export default function KnowledgeBreadcrumb({
  folder,
  folders,
  onNavigate,
  trailingLabel,
  droppable = false,
}: Props) {
  const path = folder ? buildPath(folders, folder) : [];

  // path 길이가 MAX_VISIBLE_TAIL 초과면 맨 앞쪽 부모들을 "..." 버튼 하나로 축약.
  // "..." 클릭 시 축약된 가장 바깥 부모 폴더로 이동 (= 한 단계씩 위로 drill up 가능).
  const collapse = path.length > MAX_VISIBLE_TAIL;
  const visibleTail = collapse ? path.slice(-MAX_VISIBLE_TAIL) : path;
  const hiddenSegment = collapse ? path.slice(0, -MAX_VISIBLE_TAIL) : [];
  // "..." 클릭 시 이동할 대상 = 숨겨진 세그먼트의 가장 마지막(=보이는 첫 항목의 직전 부모)
  const collapsedJumpTarget = hiddenSegment[hiddenSegment.length - 1];
  // 접근성 aria-label 용 — 숨겨진 폴더 이름을 쉼표로
  const hiddenNames = hiddenSegment.map((f) => f.name).join(" / ");

  return (
    <nav
      className="flex items-center gap-1 text-xs text-muted-foreground min-w-0 overflow-hidden"
      aria-label="경로"
    >
      <CrumbDroppable id="breadcrumb:home" enabled={droppable}>
        <button
          type="button"
          onClick={() => onNavigate(null)}
          className="flex items-center gap-1 px-2 py-1.5 md:py-0.5 md:px-1.5 rounded hover:bg-accent hover:text-foreground transition-colors shrink-0"
        >
          <Home className="h-3 w-3" />
          <span>지식창고</span>
        </button>
      </CrumbDroppable>
      {collapse && collapsedJumpTarget && (
        <span className="flex items-center gap-1 shrink-0">
          <ChevronRight className="h-3 w-3" />
          <CrumbDroppable id={`breadcrumb:${collapsedJumpTarget.id}`} enabled={droppable}>
            <button
              type="button"
              onClick={() => onNavigate(collapsedJumpTarget.id)}
              title={hiddenNames}
              aria-label={`생략된 상위 폴더 (${hiddenNames})로 이동`}
              className="px-2 py-1.5 md:py-0.5 md:px-1.5 rounded hover:bg-accent hover:text-foreground transition-colors"
            >
              …
            </button>
          </CrumbDroppable>
        </span>
      )}
      {visibleTail.map((f, idx) => {
        const isLast = idx === visibleTail.length - 1 && !trailingLabel;
        return (
          <span key={f.id} className="flex items-center gap-1 min-w-0">
            <ChevronRight className="h-3.5 w-3.5 md:h-3 md:w-3 shrink-0 text-muted-foreground/60" />
            {isLast ? (
              <CrumbDroppable id={`breadcrumb:${f.id}`} enabled={droppable}>
                <span className="px-2 py-1.5 md:py-0.5 md:px-1.5 font-medium text-foreground truncate">
                  {f.name}
                </span>
              </CrumbDroppable>
            ) : (
              <CrumbDroppable id={`breadcrumb:${f.id}`} enabled={droppable}>
                <button
                  type="button"
                  onClick={() => onNavigate(f.id)}
                  className="px-2 py-1.5 md:py-0.5 md:px-1.5 rounded hover:bg-accent hover:text-foreground transition-colors truncate max-w-[120px] shrink-0"
                >
                  {f.name}
                </button>
              </CrumbDroppable>
            )}
          </span>
        );
      })}
      {trailingLabel && (
        <span className="flex items-center gap-1 min-w-0">
          <ChevronRight className="h-3.5 w-3.5 md:h-3 md:w-3 shrink-0 text-muted-foreground/60" />
          <span className="px-2 py-1.5 md:py-0.5 md:px-1.5 font-medium text-foreground truncate">
            {trailingLabel}
          </span>
        </span>
      )}
    </nav>
  );
}
