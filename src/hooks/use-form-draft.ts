"use client";

import { useEffect, useRef, useState } from "react";

// 폼 입력값을 localStorage 에 드래프트로 자동 저장하는 훅.
// - 값이 변하면 디바운스(600ms) 후 localStorage 에 기록.
// - 페이지 언로드 직전엔 디바운스 대기 없이 즉시 flush.
// - isEmpty 가 true 이면 드래프트 키 제거(빈 폼 유령 방지).
// - clearDraft() 호출로 명시 삭제(저장 완료 시).
// - loadDraft() 로 마지막 저장된 드래프트 객체 반환.

const STORAGE_PREFIX = "form-draft:";

export function useFormDraft<T>(
  key: string,
  value: T,
  options: {
    /** 저장하지 말아야 할 상태(빈 폼 등). 기본: 항상 저장. */
    isEmpty?: (v: T) => boolean;
    debounceMs?: number;
  } = {}
) {
  const { isEmpty, debounceMs = 600 } = options;
  const [hasDraft, setHasDraft] = useState<boolean>(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestValue = useRef(value);
  latestValue.current = value;

  const storageKey = STORAGE_PREFIX + key;

  const flush = () => {
    if (typeof window === "undefined") return;
    const v = latestValue.current;
    try {
      if (isEmpty && isEmpty(v)) {
        localStorage.removeItem(storageKey);
        setHasDraft(false);
      } else {
        localStorage.setItem(storageKey, JSON.stringify(v));
        setHasDraft(true);
      }
    } catch (e) {
      // 쿼터 초과 / 시리얼라이즈 실패 — 무음 실패는 디버깅 어려움. 콘솔 경고로 흔적 남김.
      console.warn(`[useFormDraft] write failed for "${storageKey}":`, e);
    }
  };

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, debounceMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, debounceMs]);

  // unload 직전 즉시 flush (디바운스 대기 중 값 누락 방지).
  useEffect(() => {
    const onBeforeUnload = () => flush();
    window.addEventListener("beforeunload", onBeforeUnload);
    // 모바일 안정성 위해 pagehide 도 구독.
    window.addEventListener("pagehide", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onBeforeUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 초기 마운트 시 드래프트 존재 여부만 확인.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setHasDraft(localStorage.getItem(storageKey) !== null);
  }, [storageKey]);

  const loadDraft = (): T | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (e) {
      console.warn(`[useFormDraft] parse failed for "${storageKey}":`, e);
      return null;
    }
  };

  const clearDraft = () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(storageKey);
    setHasDraft(false);
  };

  return { hasDraft, loadDraft, clearDraft };
}
