// 클라이언트 컴포넌트 호환 entrypoint — 기존 `import { supabase } from "@/lib/supabase"`
// 호출자를 모두 유지하되, 내부 구현을 @supabase/ssr의 createBrowserClient로 단일화.
//
// 서버 컴포넌트(RSC)는 이 파일이 아니라 `@/lib/supabase/server`의
// createSupabaseServerClient()를 사용해야 한다.

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type SupabaseBrowserClient = ReturnType<typeof getSupabaseBrowserClient>;

// Lazy 싱글턴 — 모듈 import 시점에는 createBrowserClient 호출하지 않고,
// 첫 메서드 접근 시점에 클라이언트 측에서만 인스턴스 생성.
// (모듈 top-level 직접 호출은 SSR 빌드/렌더 시점과 클라이언트 hydration 시점의
// 인스턴스·쿠키 참조가 꼬일 수 있어 권장되지 않음.)
let _instance: SupabaseBrowserClient | null = null;
function lazyGet(): SupabaseBrowserClient {
  if (!_instance) _instance = getSupabaseBrowserClient();
  return _instance;
}

export const supabase = new Proxy({} as SupabaseBrowserClient, {
  get(_, prop) {
    const client = lazyGet();
    const value = (client as unknown as Record<PropertyKey, unknown>)[
      prop as PropertyKey
    ];
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(client);
    }
    return value;
  },
}) as SupabaseBrowserClient;

// 레거시 호환 — 이전 hybridStorage 시절의 setRememberMe / 자동로그인 토글.
// @supabase/ssr은 표준 sb-* 쿠키(1년 만료)로 영속을 보장하므로 더 이상 필요 없음.
// 호출자(UserSwitcher 등) 깨지지 않게 기록만 보존하고 실 동작은 no-op.
const REMEMBER_KEY = "auth_remember_me";

export function setRememberMe(remember: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REMEMBER_KEY, remember ? "true" : "false");
  } catch {
    // quota / private mode 등 무시.
  }
}
