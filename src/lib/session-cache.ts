/**
 * sessionStorage 기반 데이터 캐시 헬퍼.
 *
 * 목적: 페이지 진입 시 발생하는 "빈 화면 → 데이터 채워짐" 단계적 로딩(jank) 제거.
 * 같은 키의 마지막 결과를 즉시 hydrate → 백그라운드 fetch 로 갱신하는 SWR-lite 패턴.
 *
 * sessionStorage 선택 이유:
 *  - 탭 닫으면 자동 정리 (long-term staleness 무방지)
 *  - localStorage 와 달리 다른 탭/세션 충돌 없음
 *  - 5MB 한도 내에서 대부분 케이스 충분
 *
 * SSR 안전: window 미존재 시 no-op.
 * 직렬화 실패/quota 초과는 silent — 캐시는 보조 수단이라 실패해도 fetch 가 진행됨.
 */

export function getSessionCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setSessionCache<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // QuotaExceededError 등 무시 — 캐시 미저장 상태로 진행.
  }
}

export function clearSessionCache(prefix: string): void {
  if (typeof window === "undefined") return;
  try {
    const ss = window.sessionStorage;
    const keys: string[] = [];
    for (let i = 0; i < ss.length; i++) {
      const k = ss.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    for (const k of keys) ss.removeItem(k);
  } catch {
    // ignore
  }
}
