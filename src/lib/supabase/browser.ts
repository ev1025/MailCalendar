import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";

// 싱글턴 — 같은 브라우저 컨텍스트에서 매번 createBrowserClient 호출하지 않도록.
// generic을 any로 명시 — Database 스키마 타입을 따로 정의하지 않은 현재 코드와
// 호환을 위해. (점진적으로 supabase gen types로 생성한 Database 타입으로 교체 권장)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let browserClient: ReturnType<typeof createBrowserClient<any>> | null = null;

export function getSupabaseBrowserClient() {
  if (!browserClient) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    browserClient = createBrowserClient<any>(supabaseUrl, supabaseAnonKey, {
      cookieOptions: {
        // 1년. iOS PWA의 ITP 단기 강등을 피하려면 Secure 환경 필요(프로덕션은 HTTPS).
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      },
    });
  }
  return browserClient;
}
