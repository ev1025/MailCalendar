"use client";

import {
  QueryClient,
  QueryClientProvider,
  isServer,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { MotionConfig } from "motion/react";
import { useState } from "react";

/**
 * 앱 전역 TanStack Query Provider.
 *
 * 두 모드:
 *  1. 서버 (RSC dehydrate 컨텍스트): QueryClientProvider 만 — persist 불필요.
 *  2. 클라이언트 (브라우저): PersistQueryClientProvider — localStorage 에 캐시 영속화.
 *
 * persist 동작:
 *  - 모든 useQuery 결과가 localStorage 에 자동 저장 (변경 시 thro+ttle).
 *  - 앱 재시작 시 첫 paint 부터 캐시값 즉시 hydrate → 네트워크 fetch 전에 이전 화면 복원.
 *  - maxAge 24h 지난 캐시는 자동 삭제.
 *  - buster: 키 충돌 방지 — 앱 코드/스키마 변경 시 이 문자열 bump 해서 구 캐시 무효화.
 *
 * defaultOptions:
 *  - staleTime 60s · gcTime 24h · refetchOnWindowFocus false · retry 1.
 */

const PERSIST_BUSTER = "v2"; // bump: app-users 빈 배열 영속화 race 픽스
const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000; // 24h

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
  if (isServer) return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

// persister는 client 에서만 의미가 있다. localStorage 접근 가능.
let persister:
  | ReturnType<typeof createSyncStoragePersister>
  | undefined;
if (typeof window !== "undefined") {
  try {
    persister = createSyncStoragePersister({
      storage: window.localStorage,
      key: "MC_QUERY_CACHE",
      throttleTime: 1000,
    });
  } catch {
    // localStorage 비활성(privacy mode 등) — persist 없이 진행.
    persister = undefined;
  }
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => getQueryClient());

  const devtools = process.env.NODE_ENV === "development" && (
    <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
  );

  // 서버 / persist 불가 환경 → 일반 Provider.
  const tree =
    isServer || !persister ? (
      <QueryClientProvider client={queryClient}>
        {children}
        {devtools}
      </QueryClientProvider>
    ) : (
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: PERSIST_MAX_AGE,
          buster: PERSIST_BUSTER,
          dehydrateOptions: {
            // 공유 상태(calendar-shares)는 상대 액션(수락/거절)으로 자주 바뀌므로
            // 영속 캐시에서 제외 → 매 mount 마다 fresh fetch 로 stale "응답 대기 중"
            // 표시 방지. 다른 도메인 (events/transactions/...) 은 persist 유지.
            shouldDehydrateQuery: (q) => {
              const k0 = q.queryKey[0];
              // 에러로 끝난 쿼리는 영속 제외 — 빈 결과/네트워크 실패 등이 다음
              // mount 에 cache hit 으로 표시되는 race 방지.
              if (q.state.status !== "success") return false;
              // app-users 가 빈 배열이면 영속 제외 — 인증 전 RLS 미통과 결과를
              // localStorage 에 남기지 않도록.
              if (k0 === "app-users") {
                const data = q.state.data as unknown[] | undefined;
                if (!data || data.length === 0) return false;
              }
              // calendar-shares 는 영속 포함 — 이전엔 stale "응답 대기 중" 우려로
              // 제외했으나, 그러면 첫 paint 에 viewableUserIds = [본인] 만 으로
              // 시작하여 calendar 의 사용자 chip 행이 미노출 → fetch 후 등장하며
              // layout shift 발생. refetchOnMount: "always" + staleTime 30s 가
              // 즉시 background 로 fresh 데이터 가져오므로 stale 표시는 거의 없음.
              return true;
            },
          },
        }}
      >
        {children}
        {devtools}
      </PersistQueryClientProvider>
    );

  // reducedMotion="user" — OS 의 "동작 줄이기" 설정 시 motion/react 의 모든
  // 애니메이션이 transform/layout 을 건너뜀(opacity 만 유지). CSS keyframe 은
  // 별도 @media (prefers-reduced-motion) 블록이 처리.
  return <MotionConfig reducedMotion="user">{tree}</MotionConfig>;
}
