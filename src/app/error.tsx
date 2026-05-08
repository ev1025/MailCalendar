"use client";

/**
 * Next.js App Router Global Error Boundary.
 *
 * 적용 범위: 이 파일과 같은 디렉토리(=app/)의 모든 route segment 에서 발생한
 * runtime error 를 잡아 fallback UI 렌더. RSC prefetch 실패, mutation throw,
 * 네트워크 단절 등으로 React tree 가 throw 하면 흰 화면 대신 이 화면 노출.
 *
 * `reset()` 호출 시 React 가 해당 segment 를 다시 렌더 시도 — 일시 오류면
 * 사용자 액션 한 번으로 복구.
 *
 * 더 좁은 범위(특정 페이지)만 잡고 싶으면 해당 디렉토리에 별도 error.tsx 추가.
 */

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 프로덕션 telemetry 로 보내고 싶으면 여기 hook (Sentry 등). 지금은 console only.
    console.error("[GlobalError]", error);
  }, [error]);

  const message = error.message || "알 수 없는 오류가 발생했습니다";

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <div className="text-4xl">😵</div>
      <h1 className="text-lg font-semibold">문제가 발생했습니다</h1>
      <p className="max-w-md text-sm text-muted-foreground break-words">
        {message}
      </p>
      {error.digest && (
        <p className="text-xs text-muted-foreground/60">코드: {error.digest}</p>
      )}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          다시 시도
        </button>
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") window.location.href = "/";
          }}
          className="rounded-full border px-4 py-2 text-sm hover:bg-accent"
        >
          홈으로
        </button>
      </div>
    </div>
  );
}
