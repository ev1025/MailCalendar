"use client";

import * as React from "react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  /** 부가 설명 — 없으면 제목만으로 충분한 경우 생략. 짧게 한 줄 권장. */
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  /** popup className override — FormPage(z-[70]) 내부에서 띄울 때 z-[80] 으로 올려야
   *  backdrop 위에 보임. 기본값은 그대로 z-50. */
  contentClassName?: string;
}

/**
 * 네이티브 `window.confirm()` 대체. iOS Alert 패턴:
 * - 중앙 정렬 제목 + (선택) 짧은 설명
 * - 좌우 1:1 풀너비 버튼 (취소 / 확인) — 한 손 조작 친화
 * - 데스크탑 max-w-xs (작은 카드, 권한 강조)
 * - 뒤로가기 ← 버튼 비표시 (alert 는 "어디로 돌아가는" 화면이 아님)
 * - 초기 포커스 = 취소 버튼 (실수 방지)
 *
 * description 가독성: 12.5px 보다 13px 가 한국어 짧은 문장에 더 자연스럽다.
 */
export default function ConfirmDialog({
  open,
  onOpenChange,
  title = "확인",
  description,
  confirmLabel = "확인",
  cancelLabel = "취소",
  destructive = false,
  onConfirm,
  contentClassName,
}: Props) {
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showBackButton={false}
        className={cn(
          "sm:max-w-xs p-0 gap-0 overflow-hidden",
          contentClassName,
        )}
      >
        {/* 본문 — 중앙 정렬 alert 스타일 */}
        <div className="px-5 pt-5 pb-4 flex flex-col items-center text-center gap-1.5">
          <DialogHeader className="contents">
            <DialogTitle className="text-base font-semibold leading-snug break-keep">
              {title}
            </DialogTitle>
          </DialogHeader>
          {description && (
            <div className="text-[13px] text-muted-foreground leading-relaxed break-keep whitespace-pre-wrap">
              {description}
            </div>
          )}
        </div>

        {/* 버튼 — 1:1 풀너비, 가운데 구분선. iOS Alert 의 시그니처 패턴.
            focus-visible 링 제거 — 하드웨어 back 버튼으로 다이얼로그가 열리면 :focus-visible
            이 활성화되어 취소 버튼에 링이 남아 있는 문제 해결. tap 영역이 충분히 크고
            텍스트로 "취소·종료"가 명확해서 별도 포커스 링 없어도 의도 전달에 문제 없음. */}
        <div className="grid grid-cols-2 border-t divide-x">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="h-11 rounded-none font-medium focus-visible:ring-0 focus-visible:border-transparent"
          >
            {cancelLabel}
          </Button>
          <Button
            variant="ghost"
            onClick={submit}
            disabled={busy}
            className={cn(
              "h-11 rounded-none font-semibold focus-visible:ring-0 focus-visible:border-transparent",
              destructive ? "text-destructive hover:bg-destructive/10" : "text-primary",
            )}
          >
            {busy ? "처리 중…" : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
