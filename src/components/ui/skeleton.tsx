import { cn } from "@/lib/utils";

/**
 * 로딩 중 자리 차지용 스켈레톤. shimmer 효과 (좌→우 빛 슬라이드).
 * 사용 예: <Skeleton className="h-4 w-24" />
 *
 * shimmer 키프레임은 globals.css 의 .skeleton-shimmer 클래스로 정의.
 * 정적 pulse 보다 "로딩 중" 의미가 명확하고, 실제 콘텐츠 흐름을 암시.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "skeleton-shimmer rounded-md bg-muted/60 overflow-hidden relative",
        className,
      )}
      {...props}
    />
  );
}
