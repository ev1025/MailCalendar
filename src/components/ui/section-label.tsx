import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * 섹션 구분 라벨 — 작은 대문자 + 넓은 자간. 폼/설정 화면의 그룹 제목용.
 * (이전엔 profile 등에 같은 클래스의 로컬 컴포넌트가 흩어져 있었음.)
 */
export default function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "mb-1.5 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}
