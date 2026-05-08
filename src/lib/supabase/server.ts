import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";

/**
 * RSC / Route Handler / Server Action 전용 Supabase 클라이언트.
 * 매 요청마다 새 인스턴스. 쿠키는 next/headers의 요청 단위 store에서 읽고,
 * setAll은 RSC 컨텍스트에서는 무시(미들웨어가 갱신 담당).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createServerClient<any>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // RSC에서 쿠키 set은 미들웨어가 처리. 여기서 실패해도 무해.
        }
      },
    },
  });
}
