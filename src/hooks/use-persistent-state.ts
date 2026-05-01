"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * localStorage 동기 영속화 훅 — JSON 직렬화 + cross-tab 동기화 + SSR 안전.
 *
 * 사용 예:
 *   const [order, setOrder] = usePersistentState<string[]>("plan-order", []);
 *
 * 동작:
 *  - 초기값: lazy callback 으로 첫 렌더부터 localStorage 값 사용 (SSR 단계 default).
 *  - 쓰기 실패(quota 등)는 console.warn 로 알림 — 무음 실패 방지.
 *  - 다른 탭에서 같은 key 변경 시 storage 이벤트로 동기화.
 *
 * 주의:
 *  - SSR/CSR 첫 렌더 사이에 hydration mismatch 가능 (의도적 trade-off).
 *    중요 UI 라면 useEffect 마운트 후 표시하는 게이트 추가 권장.
 *  - validate 옵션으로 저장된 값의 형태 검증 가능 (스키마 변경 대비).
 */
export function usePersistentState<T>(
  key: string,
  defaultValue: T,
  options: {
    /** 파싱한 값이 유효한지 검사. false 반환 시 defaultValue 사용. */
    validate?: (parsed: unknown) => parsed is T;
  } = {},
): [T, (next: T | ((prev: T) => T)) => void] {
  const { validate } = options;

  const read = useCallback((): T => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;
      const parsed = JSON.parse(raw);
      if (validate && !validate(parsed)) return defaultValue;
      return parsed as T;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    } catch (e) {
      console.warn(`[usePersistentState] parse failed for "${key}":`, e);
      return defaultValue;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const [state, setState] = useState<T>(read);

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      setState((prev) => {
        const value = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(key, JSON.stringify(value));
          } catch (e) {
            console.warn(`[usePersistentState] write failed for "${key}":`, e);
          }
        }
        return value;
      });
    },
    [key],
  );

  // 다른 탭 동기화 — 같은 key 변경 시 우리 state 도 업데이트.
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== key) return;
      setState(read());
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [key, read]);

  return [state, setValue];
}
