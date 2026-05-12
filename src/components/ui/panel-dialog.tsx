"use client";

import { ArrowLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** 헤더 우측 액션 슬롯 — 예: NotificationsPanel 의 "모두 읽음", ShareManager 의 + 등. */
  headerAction?: React.ReactNode;
  /** Dialog content className 추가 — max-w 등 override 용. */
  className?: string;
  children: React.ReactNode;
}

/**
 * 알림·공유 같은 "리스트형 패널" 다이얼로그 공통 컴포넌트.
 * - 헤더: 좌측 ← 뒤로(닫기), 가운데 17px 제목, 우측 액션 슬롯
 * - 본문: 자체 스크롤 (max-h-[80dvh])
 * - 모바일 양옆 24px 여백 (다이얼로그 표준), 데스크톱은 max-w-md
 *
 * Dialog 기본 padding/gap 을 무력화(p-0 gap-0) 하고 헤더·본문 영역에서 직접 padding.
 */
export default function PanelDialog({
  open,
  onOpenChange,
  title,
  headerAction,
  className,
  children,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showBackButton={false}
        className={`max-w-[calc(100%-3rem)] sm:max-w-md p-0 gap-0 max-h-[80dvh] overflow-hidden grid-rows-[auto_1fr] ${className ?? ""}`}
      >
        {/* 헤더 — 좌측 ← 닫기, 제목, 우측 액션 */}
        <div className="flex items-center gap-2 border-b px-3 py-2.5">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="뒤로"
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <DialogTitle className="flex-1 min-w-0 truncate">{title}</DialogTitle>
          {headerAction && <div className="shrink-0">{headerAction}</div>}
        </div>

        {/* 본문 — 자체 스크롤 */}
        <div className="overflow-y-auto">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
