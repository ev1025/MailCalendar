"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface NumberWheelProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  className?: string;
  allowInfinity?: boolean;
  /** 숫자를 사용자 표시용 라벨로 변환. 미지정 시 그대로 숫자 표시 (-1 은 "계속"). */
  formatLabel?: (n: number) => string;
}

const ITEM_HEIGHT = 32;
const VISIBLE_ITEMS = 3;

export default function NumberWheel({
  value,
  onChange,
  min = 1,
  max = 99,
  className,
  allowInfinity = false,
  formatLabel,
}: NumberWheelProps) {
  const renderLabel = (n: number): string => {
    if (formatLabel) return formatLabel(n);
    return n === -1 ? "계속" : String(n);
  };
  const [open, setOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const numbers = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const items = allowInfinity ? [-1, ...numbers] : numbers;

  const displayValue = renderLabel(value);

  // 팝오버 열릴 때 현재 값으로 스크롤
  useEffect(() => {
    if (open && scrollRef.current) {
      const idx = items.indexOf(value);
      if (idx >= 0) {
        scrollRef.current.scrollTop = idx * ITEM_HEIGHT;
      }
    }
  }, [open, value, items]);

  // 스크롤 스냅 + 값 업데이트
  const handleScroll = useCallback(() => {
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      if (!scrollRef.current) return;
      const idx = Math.round(scrollRef.current.scrollTop / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(idx, items.length - 1));
      scrollRef.current.scrollTo({ top: clamped * ITEM_HEIGHT, behavior: "smooth" });
      onChange(items[clamped]);
    }, 80);
  }, [items, onChange]);

  // 트리거 위 휠로 직접 조절
  const handleTriggerWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1 : -1;
    const currentIdx = items.indexOf(value);
    const nextIdx = Math.max(0, Math.min(items.length - 1, currentIdx + delta));
    onChange(items[nextIdx]);
  };

  const handleInputBlur = () => {
    if (allowInfinity && (inputVal === "계속" || inputVal.toLowerCase() === "infinity")) {
      onChange(-1);
    } else {
      const parsed = parseInt(inputVal);
      if (!isNaN(parsed)) {
        onChange(Math.max(min, Math.min(max, parsed)));
      }
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <input
        type="text"
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onBlur={handleInputBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleInputBlur();
          if (e.key === "Escape") setIsEditing(false);
        }}
        autoFocus
        className={cn("h-8 w-14 text-center text-sm rounded-md border bg-background", className)}
      />
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        onDoubleClick={(e) => { e.preventDefault(); setIsEditing(true); setInputVal(displayValue); }}
        onWheel={handleTriggerWheel}
        onKeyDown={(e) => {
          // 숫자 키 누르면 입력 모드로 전환
          if (/^[0-9]$/.test(e.key)) {
            e.preventDefault();
            setOpen(false);
            setIsEditing(true);
            setInputVal(e.key);
          }
        }}
        className={cn(
          "h-8 w-16 text-center text-sm rounded-md border bg-background hover:bg-accent transition-colors cursor-pointer",
          className
        )}
        title="클릭: 목록 / 숫자 입력: 직접 입력 / 휠: 조절"
      >
        {displayValue}
      </PopoverTrigger>
      <PopoverContent
        className="w-[70px] p-0"
        align="center"
        side="bottom"
        onKeyDown={(e: React.KeyboardEvent) => {
          if (/^[0-9]$/.test(e.key)) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
            setIsEditing(true);
            setInputVal(e.key);
          }
        }}
      >
        <div className="relative">
          {/* 선택 영역 하이라이트 */}
          <div
            className="absolute left-1 right-1 border-t border-b pointer-events-none z-10"
            style={{ top: ITEM_HEIGHT, height: ITEM_HEIGHT }}
          />
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="overflow-y-auto scrollbar-none"
            style={{ height: ITEM_HEIGHT * VISIBLE_ITEMS }}
          >
            <div style={{ height: ITEM_HEIGHT }} />
            {items.map((n) => {
              const isSelected = n === value;
              return (
                <div
                  key={n}
                  className={cn(
                    "flex items-center justify-center text-sm transition-all cursor-pointer select-none",
                    isSelected ? "text-foreground font-semibold" : "text-muted-foreground/50"
                  )}
                  style={{ height: ITEM_HEIGHT }}
                  onClick={() => {
                    onChange(n);
                    scrollRef.current?.scrollTo({ top: items.indexOf(n) * ITEM_HEIGHT, behavior: "smooth" });
                  }}
                >
                  {renderLabel(n)}
                </div>
              );
            })}
            <div style={{ height: ITEM_HEIGHT }} />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
