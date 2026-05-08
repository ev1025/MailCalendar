import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase Auth 토큰 자동 갱신 프록시 (@supabase/ssr 표준 + Next.js 16 proxy 컨벤션).
 * - 모든 요청에 대해 sb-* 쿠키를 읽어 만료 직전이면 refresh 호출.
 * - 갱신된 쿠키를 NextResponse에 다시 set해서 클라이언트로 전달.
 * - getUser()를 호출하는 게 핵심(이게 토큰 검증 + 갱신 트리거).
 *
 * Next.js 16에서 `middleware` 컨벤션이 `proxy` 로 rename됨 (Node.js 런타임만 지원).
 *
 * matcher에서 정적 자산은 제외. 페이지·API 라우트만 통과.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // 환경변수 없으면 통과 (빌드 시점/플레이스홀더 보호).
  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // 핵심: getUser() — 만료 시 자동 refresh + 쿠키 set.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * 정적 자산·이미지·매니페스트·아이콘 제외.
     * - _next/static, _next/image: Next.js 빌드 산출물
     * - favicon, icons/*, *.png/jpg/svg/webp/ico: PWA 리소스
     * - manifest.webmanifest: PWA 매니페스트
     */
    "/((?!_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
};
