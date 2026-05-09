"use client";

/**
 * Next.js App Router Global Error Boundary.
 *
 * 적용 범위: app/ 의 모든 route segment runtime error 를 잡아 fallback UI.
 * RSC prefetch 실패, mutation throw, 네트워크 단절 등으로 React tree 가
 * throw 하면 흰 화면 대신 이 화면.
 */

import { useEffect } from "react";

function classifyError(err: Error): { title: string; hint: string } {
  const msg = err.message || "";
  // 네트워크 단절·offline 추정.
  if (
    /failed to fetch|networkerror|load failed|network request failed/i.test(msg)
  ) {
    return {
      title: "인터넷 연결 문제",
      hint: "네트워크 상태를 확인하고 다시 시도해 주세요.",
    };
  }
  // Supabase JWT/auth 만료 추정.
  if (/jwt|expired|unauthorized|401|403/i.test(msg)) {
    return {
      title: "로그인 세션이 만료됐어요",
      hint: "홈으로 돌아가 다시 로그인해 주세요.",
    };
  }
  return {
    title: "문제가 발생했어요",
    hint: "잠시 후 다시 시도해 주세요. 계속 발생하면 새로고침 해주세요.",
  };
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  const { title, hint } = classifyError(error);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="text-5xl">😵</div>
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      <p className="max-w-md text-sm text-muted-foreground break-keep">
        {hint}
      </p>
      {error.message && (
        <details className="mt-1 max-w-md text-left">
          <summary className="cursor-pointer text-xs text-muted-foreground/70">
            상세 오류
          </summary>
          <p className="mt-1 break-words rounded-md bg-muted px-3 py-2 text-[11px] text-muted-foreground/80">
            {error.message}
          </p>
        </details>
      )}
      {error.digest && (
        <p className="text-[10px] text-muted-foreground/60">
          코드 {error.digest}
        </p>
      )}
      <div className="mt-3 flex gap-2">
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
