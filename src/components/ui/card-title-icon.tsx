import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * 카드 헤더 제목 + 아이콘 칩 — 설정/프로필 등의 카드에서 반복되던 패턴을 한 곳에.
 * 칩 색은 액센트 토큰(bg-accent-color-soft / text-accent-color)으로, 다이얼로그
 * 헤더의 DialogIcon 과 같은 시각 언어.
 */
export default function CardTitleIcon({
  icon: Icon,
  children,
  className,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <CardTitle className={cn("flex items-center gap-2 text-sm font-bold", className)}>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-color-soft text-accent-color ring-1 ring-accent-color/20">
        <Icon className="h-3.5 w-3.5" />
      </span>
      {children}
    </CardTitle>
  );
}
