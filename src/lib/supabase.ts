// 클라이언트 컴포넌트 호환 entrypoint — 기존 `import { supabase } from "@/lib/supabase"`
// 호출자를 모두 유지하되, 내부 구현을 @supabase/ssr의 createBrowserClient로 단일화.
//
// 서버 컴포넌트(RSC)는 이 파일이 아니라 `@/lib/supabase/server`의
// createSupabaseServerClient()를 사용해야 한다.

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

// 모듈 최초 import 시 한 번만 createBrowserClient 호출.
// createBrowserClient 자체는 document.cookie를 즉시 만지지 않으므로
// SSR 빌드(next build) 시 모듈이 로드되어도 안전.
export const supabase = getSupabaseBrowserClient();

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
