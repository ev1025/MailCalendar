"use client";

import {
  QueryClient,
  QueryClientProvider,
  isServer,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
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

const PERSIST_BUSTER = "v1"; // 캐시 호환성 깨질 때 (스키마 변경 등) bump.
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

  // 서버 / persist 불가 환경 → 일반 Provider.
  if (isServer || !persister) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
        {process.env.NODE_ENV === "development" && (
          <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
        )}
      </QueryClientProvider>
    );
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: PERSIST_MAX_AGE,
        buster: PERSIST_BUSTER,
        // 일부 키만 persist 하고 싶으면 dehydrateOptions.shouldDehydrateQuery 추가.
        // 현재는 기본값(모든 query) — 우리 데이터는 모두 동일 사용자 본인 것이라 안전.
      }}
    >
      {children}
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      )}
    </PersistQueryClientProvider>
  );
}
