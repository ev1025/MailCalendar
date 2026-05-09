"use client";

import { useSyncExternalStore } from "react";

/**
 * 뷰포트 사이즈에 따른 분기 훅 — React 19 정석 (useSyncExternalStore).
 *
 * SSR/RSC 단계에선 getServerSnapshot 으로 false(모바일 가정) 반환.
 * 클라이언트는 window.matchMedia 의 외부 store 를 직접 구독 — 이펙트 안에서
 * setState 트리거 없음(react-hooks/set-state-in-effect 통과).
 */
function subscribe(query: string) {
  return (cb: () => void) => {
    if (typeof window === "undefined") return () => {};
    const mql = window.matchMedia(query);
    mql.addEventListener("change", cb);
    return () => mql.removeEventListener("change", cb);
  };
}

function getSnapshot(query: string) {
  return () => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  };
}

const getServerSnapshot = () => false;

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    subscribe(query),
    getSnapshot(query),
    getServerSnapshot,
  );
}
