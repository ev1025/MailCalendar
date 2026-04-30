"use client";

import { useEffect, useState } from "react";

/**
 * D-day 설정 훅 — localStorage 영속.
 * 설정 페이지의 토글/날짜/시간 입력과 캘린더 페이지의 버튼·다이얼로그가 공유.
 *
 * cross-device 동기화는 안 함 (DB 마이그레이션 필요해 일단 보류).
 * 추후 DB 로 옮길 때 이 hook 의 내부만 교체하면 caller 변경 없음.
 */
const STORAGE_KEY = "dday_settings";

export interface DdaySettings {
  enabled: boolean;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:MM" (24h) */
  time: string;
}

const DEFAULT: DdaySettings = {
  enabled: false,
  date: "",
  time: "",
};

function load(): DdaySettings {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw);
    return {
      enabled: !!parsed.enabled,
      date: typeof parsed.date === "string" ? parsed.date : "",
      time: typeof parsed.time === "string" ? parsed.time : "",
    };
  } catch {
    return DEFAULT;
  }
}

function save(s: DdaySettings) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    // 다른 페이지(설정 ↔ 캘린더) 가 같은 세션에서 즉시 반영되도록 storage 이벤트
    // 직접 dispatch — same-tab 의 다른 hook 인스턴스도 update.
    window.dispatchEvent(new Event("dday_settings_changed"));
  } catch {}
}

export function useDdaySettings() {
  const [settings, setSettings] = useState<DdaySettings>(DEFAULT);

  useEffect(() => {
    setSettings(load());
    const handler = () => setSettings(load());
    window.addEventListener("dday_settings_changed", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("dday_settings_changed", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const update = (patch: Partial<DdaySettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      save(next);
      return next;
    });
  };

  /** 버튼·다이얼로그 노출 가능 여부 — 토글 ON + 날짜·시간 모두 입력 */
  const isReady = settings.enabled && settings.date.length > 0 && settings.time.length >= 4;

  return { settings, update, isReady };
}
