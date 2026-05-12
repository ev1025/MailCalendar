"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * URL searchParams 를 단일 진실원으로 쓰는 상태 훅.
 *
 * 패턴 통일 목적:
 *  - calendar(?view=, ?y=, ?m=), products(?category=) 등을 한 줄 호출로 통일
 *    (`const [y, setY] = useUrlNumberParam("y", default)`).
 *  - 새로고침 시 상태 소실 X (URL 에 들어 있음).
 *
 * 동작:
 *  - value: 매 렌더 searchParams 에서 직접 읽음 (별도 useState·sync effect 없음 →
 *    set 과 URL 이 어긋나는 레이스, 불필요한 재렌더 제거).
 *  - setValue: URL 만 갱신 (router.replace, scroll: false) → 다음 렌더에서 새 값 읽힘.
 *  - 같은 값으로 set 하면 history 추가 안 됨.
 *
 * 주의: useSearchParams 를 쓰므로 호출 컴포넌트는 <Suspense> 안에 있어야 함
 *   (정적 prerender 시 bail-out → fallback 렌더 → 클라에서만 실제 값으로 마운트 → 미스매치 없음).
 */

function readParam(sp: URLSearchParams | null | undefined, key: string): string | null {
  if (!sp) return null;
  return sp.get(key);
}

function buildUrl(pathname: string, sp: URLSearchParams): string {
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** 단일 string 파라미터. */
export function useUrlStringParam(
  key: string,
  defaultValue: string,
): [string, (next: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const value = readParam(searchParams, key) ?? defaultValue;

  const setValue = useCallback(
    (next: string) => {
      const sp = new URLSearchParams(searchParams?.toString() ?? "");
      if (next === defaultValue) {
        sp.delete(key);
      } else {
        sp.set(key, next);
      }
      router.replace(buildUrl(pathname ?? "/", sp), { scroll: false });
    },
    [router, pathname, searchParams, key, defaultValue],
  );

  return [value, setValue];
}

/** 정수 파라미터 (y, m, page 등). */
export function useUrlNumberParam(
  key: string,
  defaultValue: number,
): [number, (next: number) => void] {
  const [strValue, setStrValue] = useUrlStringParam(key, String(defaultValue));
  const num = Number.parseInt(strValue, 10);
  const value = Number.isFinite(num) ? num : defaultValue;
  const setValue = useCallback(
    (next: number) => {
      setStrValue(String(next));
    },
    [setStrValue],
  );
  return [value, setValue];
}
