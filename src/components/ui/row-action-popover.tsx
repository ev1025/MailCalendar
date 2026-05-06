"use client";

import { useState } from "react";
import { GripVertical, MoreHorizontal, MoreVertical } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * 리스트/테이블 행의 컨텍스트 액션 팝오버.
 *
 * 이전에 5곳(travel-list / products/page / plan-task-row / plan-list / tag-input)
 * 이 거의 같은 구조(GripVertical or MoreHorizontal 트리거 + Popover + 액션 버튼들)
 * 를 인라인으로 반복하던 걸 한 곳으로.
 *
 * 모바일 패턴: 같은 손잡이(grip)로 "탭=메뉴 / 길게 누름=드래그" 둘 다 수행.
 * dragAttributes/dragListeners 를 전달하면 트리거가 드래그 핸들 역할도 함.
 */
export interface RowActionItem {
  /** 좌측 아이콘. */
  icon: React.ReactNode;
  /** 메뉴 텍스트. */
  label: string;
  onClick: () => void;
  /** 빨간 톤 — 삭제 같은 위험 액션. */
  destructive?: boolean;
  /** 아이콘만 색을 입히고 싶은 경우 (예: 가본 곳 ✓ 초록). */
  iconClassName?: string;
  /** 텍스트도 강조 색이 필요한 경우 (예: visited 토글 활성). */
  textClassName?: string;
}

interface Props {
  items: RowActionItem[];
  /** 트리거 아이콘 종류 — default "grip". */
  trigger?: "grip" | "more-h" | "more-v";
  /** 추가 트리거 클래스(절대 위치 등). */
  triggerClassName?: string;
  /** 접근성 라벨. default "행 메뉴" */
  triggerLabel?: string;
  /** 드래그 가능한 핸들로 쓰일 때 — useSortable 의 attributes/listeners 그대로 전달.
      dnd-kit 가 노출하는 정확한 타입 (DraggableAttributes / SyntheticListenerMap) 을
      직접 import 하면 ui 가 라이브러리에 묶이므로, 스프레드 가능한 모든 객체를 허용. */
  dragAttributes?: React.HTMLAttributes<HTMLElement>;
  dragListeners?: React.HTMLAttributes<HTMLElement>;
  /** Popover 위치 props. */
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  /** PopoverContent 의 width 등 추가 클래스. */
  contentClassName?: string;
  /** 외부 제어용 — open 상태를 부모에서 관리하고 싶을 때. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const TRIGGER_ICONS = {
  grip: GripVertical,
  "more-h": MoreHorizontal,
  "more-v": MoreVertical,
};

export default function RowActionPopover({
  items,
  trigger = "grip",
  triggerClassName,
  triggerLabel = "행 메뉴",
  dragAttributes,
  dragListeners,
  side = "right",
  align = "start",
  contentClassName,
  open,
  onOpenChange,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setOpen = isControlled ? (onOpenChange ?? (() => {})) : setInternalOpen;

  const Icon = TRIGGER_ICONS[trigger];
  const isDraggable = !!dragListeners;

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger
        {...(dragAttributes || {})}
        {...(dragListeners || {})}
        // 데스크탑은 드래그 시작에 mouse 가 충분, 모바일은 터치. cursor-grab 으로 시각 신호.
        // touch-none — 시트의 스와이프 닫힘과 충돌 방지.
        className={cn(
          "rounded p-1.5 text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent transition-colors",
          isDraggable && "cursor-grab active:cursor-grabbing touch-none",
          triggerClassName
        )}
        title={isDraggable ? "드래그로 이동 / 탭하면 메뉴" : undefined}
        aria-label={triggerLabel}
        // 상위 row 의 onClick (열기) 으로 이벤트 버블 방지. click 만으로 충분.
        // pointerdown 은 dnd-kit 의 dragListeners 가 사용 — 여기서 stopPropagation 하면
        // 객체 스프레드 + 나중 prop 우선 규칙에 의해 dragListeners.onPointerDown 이
        // 덮여 드래그 시작 자체가 안 됨. 그래서 onPointerDown 핸들러는 두지 않는다.
        onClick={(e) => e.stopPropagation()}
      >
        <Icon className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        className={cn("w-auto min-w-[8rem] max-w-[14rem] p-1", contentClassName)}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((item, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => {
              setOpen(false);
              item.onClick();
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent transition-colors",
              item.destructive && "text-destructive hover:bg-destructive/10",
              item.textClassName
            )}
          >
            <span className={cn("shrink-0", item.iconClassName)}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
