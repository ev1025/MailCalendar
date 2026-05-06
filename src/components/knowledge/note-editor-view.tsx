"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import RichEditor from "@/components/knowledge/rich-editor";
import DraftsPopover from "@/components/knowledge/drafts-popover";
import type { KnowledgeItem } from "@/types";
import type { KnowledgeDraft } from "@/hooks/use-knowledge-drafts";

interface Props {
  item: KnowledgeItem;
  title: string;
  onTitleChange: (v: string) => void;
  onContentChange: (html: string) => void;
  onSave: () => void;
  onSaveDraft: () => void;
  onExit: () => void | Promise<void>;
  /** 취소 — 저장 없이 메인으로 이탈. onExit 는 모바일 뒤로(읽기 모드)와 다름. */
  onCancel?: () => void | Promise<void>;
  dirty: boolean;
  autoSavedAt: string | null;
  drafts: KnowledgeDraft[];
  onLoadDraft: (d: KnowledgeDraft) => void;
  onDeleteDraft: (id: string) => void;
  draftsOpen: boolean;
  onDraftsOpenChange: (open: boolean) => void;
}

export default function NoteEditorView({
  item,
  title,
  onTitleChange,
  onContentChange,
  onSave,
  onSaveDraft,
  onExit,
  onCancel,
  dirty,
  autoSavedAt,
  drafts,
  onLoadDraft,
  onDeleteDraft,
  draftsOpen,
  onDraftsOpenChange,
}: Props) {
  // 저장 안 된 변경(dirty) 인 채로 이탈 시 ConfirmDialog 로 한 번 확인.
  // 임시저장 한 번 안 거치면 5초 자동저장 전에 닫혔을 때 변경 손실되는 케이스가 있음.
  const [pending, setPending] = useState<"exit" | "cancel" | null>(null);
  const guardedExit = () => {
    if (dirty) setPending("exit");
    else onExit();
  };
  const guardedCancel = () => {
    if (dirty) setPending("cancel");
    else (onCancel ?? onExit)();
  };
  const proceed = async () => {
    const action = pending;
    setPending(null);
    if (action === "exit") await onExit();
    else if (action === "cancel") await (onCancel ?? onExit)();
  };

  return (
    <>
      {/* 모바일 전용 헤더 — 2줄 구조:
          1줄: [뒤로] [spacer] [드래프트][임시저장][저장]
          2줄: [제목 입력]                                */}
      <div className="md:hidden border-b flex flex-col shrink-0">
        <div className="flex items-center gap-2 px-3 h-14">
          <button
            type="button"
            onClick={guardedExit}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground -ml-1"
            title="보기로 돌아가기"
            aria-label="뒤로"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-1 shrink-0">
            <DraftsPopover
              open={draftsOpen}
              onOpenChange={onDraftsOpenChange}
              drafts={drafts}
              onLoad={onLoadDraft}
              onDelete={onDeleteDraft}
            />
            <Button size="sm" variant="outline" onClick={onSaveDraft} className="h-8 text-xs px-2.5">
              임시저장
            </Button>
            <Button size="sm" onClick={onSave} disabled={!dirty} className="h-8 text-xs px-2.5">
              저장
            </Button>
          </div>
        </div>
        <div className="px-3 pb-2">
          <Input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            onKeyDown={(e) => {
              // Enter → 키보드 dismiss. 본문은 별도 에디터라 줄바꿈 의미 없음.
              if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
            }}
            className="w-full h-10 text-base font-semibold border-none bg-transparent focus-visible:ring-0 px-1 min-w-0 placeholder:text-muted-foreground/70 placeholder:font-normal"
            placeholder="새 노트 제목..."
          />
        </div>
      </div>

      {/* 데스크톱 전용 헤더 — 1줄: [제목 flex-1][자동저장][드래프트][임시저장][취소][저장] */}
      <div className="hidden md:flex border-b items-center gap-2 px-3 h-14 shrink-0">
        <Input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
          }}
          className="flex-1 h-10 text-base font-semibold border-none bg-transparent focus-visible:ring-0 px-1 min-w-0 placeholder:text-muted-foreground/70 placeholder:font-normal"
          placeholder="새 노트 제목..."
        />
        {autoSavedAt && (
          <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
            자동저장 {new Date(autoSavedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
        <div className="flex items-center gap-1 shrink-0">
          <DraftsPopover
            open={draftsOpen}
            onOpenChange={onDraftsOpenChange}
            drafts={drafts}
            onLoad={onLoadDraft}
            onDelete={onDeleteDraft}
          />
          <Button size="sm" variant="outline" onClick={onSaveDraft} className="h-8 text-xs px-2.5">
            임시저장
          </Button>
          <Button size="sm" variant="ghost" onClick={guardedCancel} className="h-8 text-xs px-2.5">
            취소
          </Button>
          <Button size="sm" onClick={onSave} disabled={!dirty} className="h-8 text-xs px-2.5">
            저장
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <RichEditor
          key={item.id}
          content={item.content || ""}
          onChange={onContentChange}
        />
      </div>

      {/* 모바일 전용 하단 고정 저장 — 큰 폰에서 상단 헤더의 저장 버튼이 엄지로
          닿지 않는 문제 해결. dirty 일 때만 노출, 키보드 위에 떠 있게 fixed bottom.
          safe-area 인셋 + bottom-nav(56px) 위쪽 여백 확보. */}
      {dirty && (
        <button
          type="button"
          onClick={onSave}
          className="md:hidden fixed right-4 z-40 flex h-12 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg active:scale-95 transition-transform"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 4.5rem)" }}
          aria-label="저장"
        >
          저장
        </button>
      )}

      {/* 저장 안 된 변경 경고 — 본문/제목 수정 후 임시저장·저장 없이 이탈 시. */}
      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => { if (!o) setPending(null); }}
        title="저장하지 않은 변경이 있어요"
        description="이 노트의 변경 사항을 저장하지 않고 나가면 잃게 됩니다."
        confirmLabel="나가기"
        cancelLabel="계속 편집"
        destructive
        onConfirm={proceed}
      />
    </>
  );
}
