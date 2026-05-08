/**
 * localStorage 기반 데이터 캐시 헬퍼.
 *
 * session-cache 와 같은 SWR-lite 패턴이지만 localStorage 라 탭/브라우저 종료
 * 후에도 유지 → 다시 앱 켰을 때 첫 렌더에 마지막 결과 즉시 표시. 이후 백그라운드
 * fetch 로 갱신.
 *
 * TTL: 너무 오래된 데이터(예: 일주일 전 일정 캐시)는 hydrate 안 함.
 *
 * SSR 안전: window 미존재 시 no-op.
 * QuotaExceeded 등은 silent — 캐시는 보조 수단.
 */

interface CacheEntry<T> {
  v: T;          // value
  t: number;     // timestamp (ms)
}

export function getPersistentCache<T>(key: string, maxAgeMs?: number): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (typeof entry !== "object" || entry === null || !("v" in entry) || !("t" in entry)) {
      // 구버전(직접 직렬화) 호환 — 그냥 값만 들어있으면 그대로 반환.
      return entry as unknown as T;
    }
    if (maxAgeMs != null && Date.now() - entry.t > maxAgeMs) return null;
    return entry.v;
  } catch {
    return null;
  }
}

export function setPersistentCache<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    const entry: CacheEntry<T> = { v: value, t: Date.now() };
    window.localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // QuotaExceededError 등 무시.
  }
}

export function clearPersistentCache(prefix: string): void {
  if (typeof window === "undefined") return;
  try {
    const ls = window.localStorage;
    const keys: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    for (const k of keys) ls.removeItem(k);
  } catch {
    // ignore
  }
}
