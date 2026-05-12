"use client";

import { motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

// 리스트/표가 비었거나 검색 결과가 없을 때 공용으로 쓰는 빈 상태 컴포넌트.
// 이전엔 finance/products/calendar 등이 각자 `flex flex-col items-center py-N` 를
// 살짝씩 다른 패딩으로 손수 그렸음 — 아이콘·여백·타이포 통일 + 진입 fade.

interface Action {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
}

interface Props {
  /** 가운데 위쪽 아이콘 배지 — 빈 화면을 덜 휑하게. */
  icon?: LucideIcon;
  title: string;
  /** 한 줄 설명 (선택). */
  description?: string;
  /** 주 행동 버튼 (선택). */
  action?: Action;
  /** 보조 행동 (텍스트 링크 형태, 선택) — "필터 해제하기" 등. */
  secondaryAction?: { label: string; onClick: () => void };
  className?: string;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={`flex flex-col items-center justify-center gap-3 py-14 text-center ${className ?? ""}`}
    >
      {Icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
          <Icon className="h-6 w-6" strokeWidth={1.6} />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && (
          <p className="max-w-[18rem] text-xs text-muted-foreground break-keep">
            {description}
          </p>
        )}
      </div>
      {action && (
        <Button size="sm" onClick={action.onClick} className="mt-1 h-9">
          {action.icon && <action.icon className="mr-1.5 h-3.5 w-3.5" />}
          {action.label}
        </Button>
      )}
      {secondaryAction && (
        <button
          type="button"
          onClick={secondaryAction.onClick}
          className="text-xs text-primary hover:underline"
        >
          {secondaryAction.label}
        </button>
      )}
    </motion.div>
  );
}
