"use client";

import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * TipTap Image 노드의 편집용 NodeView.
 * 기본 Image 확장은 <img> 만 렌더해서 삭제하려면 커서를 옆에 두고 백스페이스를
 * 눌러야 했음 → 이미지 위 우상단에 ✕ 버튼을 띄워 클릭 한 번으로 삭제.
 * (호버 시 / 선택 시 노출 — 모바일은 탭하면 선택돼서 보임.)
 */
export default function ImageNodeView({ node, selected, deleteNode }: NodeViewProps) {
  const src = (node.attrs.src as string) || "";
  const alt = (node.attrs.alt as string) || "";
  return (
    <NodeViewWrapper className="group/img relative my-2 w-fit max-w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        className={cn(
          "max-w-full rounded-md transition-shadow",
          selected && "ring-2 ring-primary ring-offset-1",
        )}
      />
      <button
        type="button"
        contentEditable={false}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => deleteNode()}
        aria-label="이미지 삭제"
        className={cn(
          "absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white shadow-sm transition-opacity hover:bg-black/75",
          "opacity-0 group-hover/img:opacity-100 focus-visible:opacity-100",
          selected && "opacity-100",
        )}
      >
        <X className="h-4 w-4" />
      </button>
    </NodeViewWrapper>
  );
}
