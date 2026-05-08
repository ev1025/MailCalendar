"use client";

import { useEffect } from "react";

/**
 * Service Worker 등록 (PWA 정적 캐싱).
 * - localhost / 개발 모드에서도 등록 (Next.js dev 서버는 sw.js 정적 파일 그대로 서빙).
 * - 단 secure context 필요 (HTTPS 또는 localhost). 그렇지 않으면 navigator.serviceWorker 미존재.
 *
 * 새 sw 배포 시 자동 갱신:
 *  - SW_VERSION 변경 → activate 핸들러가 구 캐시 삭제.
 *  - skipWaiting + clients.claim 으로 새 sw 가 즉시 컨트롤.
 */
export function SwRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => {
          console.warn("[SwRegister] register failed:", err);
        });
    };

    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });

    return () => {
      window.removeEventListener("load", onLoad);
    };
  }, []);

  return null;
}
