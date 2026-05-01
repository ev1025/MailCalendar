import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";

// 자동 로그인 여부 플래그 — 로그인 시 UserSwitcher가 설정.
// true  → localStorage + 쿠키 양쪽에 세션 저장 (브라우저/PWA 재시작 후에도 유지)
// false → sessionStorage에 저장 (탭/앱 닫으면 로그아웃)
const REMEMBER_KEY = "auth_remember_me";
// 쿠키는 세션 토큰이 커서 chunked 저장. 최대 크기 안전 마진 3500자(쿠키 최대 4KB).
const COOKIE_MAX = 3500;
// iOS PWA 등 ITP 환경에서 localStorage 가 종종 비워지기 때문에 쿠키를
// 백업으로 병행 기록. 쿠키 읽기가 가능하면 localStorage 로 복원.
const COOKIE_PREFIX = "sbs.";

function getRemember(): boolean {
  if (typeof window === "undefined") return true;
  const v = localStorage.getItem(REMEMBER_KEY);
  return v !== "false"; // 기본값 true
}

export function setRememberMe(remember: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(REMEMBER_KEY, remember ? "true" : "false");
}

/** 세션 값을 쿠키 여러 조각으로 저장 (길이 제한 우회). Secure + SameSite=Lax.
 *  Secure 는 HTTPS 일 때만 — iOS Safari ITP 가 non-Secure 쿠키를 단기 세션 쿠키로
 *  강등시켜 7일도 못 가는 사례 방지. localhost http 개발은 Secure 생략. */
function cookieSet(key: string, value: string) {
  if (typeof document === "undefined") return;
  // 기존 chunks 제거
  cookieRemove(key);
  // 1년 만료. Supabase refresh token 수명과 유사.
  const expires = new Date(Date.now() + 365 * 86400 * 1000).toUTCString();
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const chunks = Math.ceil(value.length / COOKIE_MAX);
  for (let i = 0; i < chunks; i++) {
    const part = value.slice(i * COOKIE_MAX, (i + 1) * COOKIE_MAX);
    document.cookie = `${COOKIE_PREFIX}${key}.${i}=${encodeURIComponent(part)}; expires=${expires}; path=/; SameSite=Lax${secure}`;
  }
  // 전체 조각 개수도 저장 — get 시 조립 기준.
  document.cookie = `${COOKIE_PREFIX}${key}.n=${chunks}; expires=${expires}; path=/; SameSite=Lax${secure}`;
}

function cookieGet(key: string): string | null {
  if (typeof document === "undefined") return null;
  const all = document.cookie.split(";").map((c) => c.trim());
  const meta = all.find((c) => c.startsWith(`${COOKIE_PREFIX}${key}.n=`));
  if (!meta) return null;
  const n = parseInt(meta.slice((`${COOKIE_PREFIX}${key}.n=`).length), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const p = all.find((c) => c.startsWith(`${COOKIE_PREFIX}${key}.${i}=`));
    if (!p) return null;
    parts.push(decodeURIComponent(p.slice((`${COOKIE_PREFIX}${key}.${i}=`).length)));
  }
  return parts.join("");
}

function cookieRemove(key: string) {
  if (typeof document === "undefined") return;
  const all = document.cookie.split(";").map((c) => c.trim());
  for (const c of all) {
    if (c.startsWith(`${COOKIE_PREFIX}${key}.`)) {
      const eq = c.indexOf("=");
      const name = eq > 0 ? c.slice(0, eq) : c;
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
    }
  }
}

// localStorage + 쿠키 중복 기록으로 세션 영속성 강화.
// iOS PWA 등에서 localStorage 가 비워져도 쿠키로 복원 가능.
const hybridStorage = {
  getItem(key: string): string | null {
    if (typeof window === "undefined") return null;
    const remember = getRemember();
    if (!remember) return sessionStorage.getItem(key);
    const fromLs = localStorage.getItem(key);
    if (fromLs) return fromLs;
    // localStorage 비었는데 쿠키에 있다면 복원 (다음 호출부턴 localStorage hit).
    const fromCookie = cookieGet(key);
    if (fromCookie) {
      try { localStorage.setItem(key, fromCookie); } catch { /* 쿼터 초과 무시 */ }
      return fromCookie;
    }
    return null;
  },
  setItem(key: string, value: string): void {
    if (typeof window === "undefined") return;
    const remember = getRemember();
    if (remember) {
      try { localStorage.setItem(key, value); } catch { /* ignore */ }
      sessionStorage.removeItem(key);
      cookieSet(key, value);
    } else {
      sessionStorage.setItem(key, value);
      localStorage.removeItem(key);
      cookieRemove(key);
    }
  },
  removeItem(key: string): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
    cookieRemove(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: hybridStorage,
  },
});
