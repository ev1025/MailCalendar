"use client";

import {
  QueryClient,
  QueryClientProvider,
  isServer,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";

/**
 * 앱 전역 TanStack Query Provider.
 *
 * RSC-safe 패턴(Tanstack 공식 권장):
 *  - 서버: 매 요청마다 새 QueryClient (요청 간 캐시 격리, RSC prefetch용)
 *  - 브라우저: 싱글턴 (탭 내 페이지 이동 간 캐시 유지 — Suspense 더블 호출 방지)
 *
 * defaultOptions:
 *  - staleTime 60s: 1분 동안 fresh, 그 후 background revalidate.
 *  - gcTime 24h: 가비지 컬렉션 전까지 캐시 보존(탭 이동 후 돌아와도 즉시 표시).
 *  - refetchOnWindowFocus false: 모바일 PWA 백그라운드 → 포그라운드 복귀 시
 *    네트워크 폭증 방지. 필요한 도메인은 useAutoRefetch나 Realtime으로 명시 갱신.
 *  - retry 1: 일시 네트워크 오류는 한 번 재시도.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        gcTime: 24 * 60 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient(): QueryClient {
  if (isServer) {
    // 서버: 요청마다 새로 만든다. RSC prefetch 컨텍스트 격리.
    return makeQueryClient();
  }
  // 브라우저: 한 번만 생성하고 재사용.
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // useState 초기화로 mount 동안 동일 인스턴스 유지.
  const [queryClient] = useState(() => getQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      )}
    </QueryClientProvider>
  );
}
