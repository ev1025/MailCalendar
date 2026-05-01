import { cn } from "@/lib/utils";

/**
 * 로딩 중 자리 차지용 스켈레톤. Tailwind animate-pulse 기본.
 * 사용 예: <Skeleton className="h-4 w-24" />
 *
 * 너비/높이는 호출부에서 className 으로 지정. 색상은 muted/50 → 어둡고 밝은
 * 모드 모두 자연스러움.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted/60", className)}
      {...props}
    />
  );
}
