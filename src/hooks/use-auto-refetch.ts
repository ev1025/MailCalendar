"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

/**
 * 포그라운드 복귀 / Auth 토큰 갱신 / SIGNED_IN 시 자동으로 fetchFn 호출.
 *
 * 이전엔 use-travel-items / use-travel-plans / use-travel-plan-tasks 가
 * 동일한 visibilitychange + onAuthStateChange 리스너를 각자 작성.
 *
 * 사용 예:
 *   useAutoRefetch(fetchItems);
 *
 * 동작:
 *  - document.visibilityState === "visible" 로 전환 시 fetchFn 호출
 *  - Supabase Auth 의 TOKEN_REFRESHED / SIGNED_IN 이벤트에 fetchFn 호출
 *  - cleanup 시 모든 리스너 해제
 */
export function useAutoRefetch(fetchFn: () => void | Promise<void>) {
  // fetchFn 을 ref 로 잡아 effect deps 에서 제외 — caller 가 inline lambda 를 넘겨도
  // 매 렌더마다 리스너를 재등록하지 않음(Realtime/visibilitychange 채널 churn 방지).
  const fnRef = useRef(fetchFn);
  fnRef.current = fetchFn;
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") fnRef.current();
    };
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") fnRef.current();
    });
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      sub.subscription.unsubscribe();
    };
  }, []);
}
