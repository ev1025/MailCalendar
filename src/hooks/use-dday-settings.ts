"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCurrentUserId } from "@/lib/current-user";

/**
 * D-day 설정 훅 — DB 영속 + 공유 파트너 fallback.
 *
 * 동작:
 *  - 각 사용자는 자기 row(app_users) 에 dday_enabled / dday_date / dday_time 저장.
 *  - 읽기: ① 본인 dday 가 enabled 면 그것 사용. ② 아니면 calendar_shares accepted
 *    파트너(들) 중 enabled 인 첫 사람 dday 를 fallback 으로 사용. ③ 없으면 빈 상태.
 *  - 쓰기: 본인 row 에만.
 *  - 토글 OFF 면 본인 row 의 dday_enabled=false. 그 시점에 공유 파트너 dday 가
 *    있으면 화면엔 그게 표시됨.
 *
 * 양쪽 다 설정한 경우 — 본인 우선. 한쪽만 설정한 경우 — 그 값 양쪽 모두 표시.
 */

export interface DdaySettings {
  enabled: boolean;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:MM" 24h */
  time: string;
  /** 표시되는 dday 출처 — "self" 본인 / "partner" 공유 파트너 / "none" 없음. */
  source: "self" | "partner" | "none";
}

const DEFAULT: DdaySettings = {
  enabled: false,
  date: "",
  time: "",
  source: "none",
};

/** localStorage 캐시 — DB fetch 끝나기 전 초기 렌더에서 깜빡임 없이 D-day 버튼이
 *  뜨게 하는 용도. DB 가 진실 source 라 fetch 후 업데이트로 덮어씀.
 *  cache 가 stale 일 수 있으나 (파트너가 바꿨을 때) 1초 이내 보정. */
const CACHE_KEY = "dday_settings_cache_v1";

function loadCache(): DdaySettings {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw);
    return {
      enabled: !!parsed.enabled,
      date: typeof parsed.date === "string" ? parsed.date : "",
      time: typeof parsed.time === "string" ? parsed.time : "",
      source: parsed.source === "self" || parsed.source === "partner" ? parsed.source : "none",
    };
  } catch {
    return DEFAULT;
  }
}

function saveCache(s: DdaySettings) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(s));
  } catch {}
}

function normalizeTime(t: string | null): string {
  if (!t) return "";
  // DB TIME 은 "HH:MM:SS" 형식 — 우리 UI 는 "HH:MM" 만 사용.
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export function useDdaySettings() {
  const userId = useCurrentUserId();
  // 초기값을 localStorage 캐시에서 동기적으로 로드 → 첫 렌더부터 D-day 버튼이
  // 다른 헤더 아이콘과 함께 즉시 표시. SSR 단계에선 DEFAULT, hydration 후 캐시 반영.
  const [settings, setSettings] = useState<DdaySettings>(DEFAULT);

  // 마운트 직후 1회: 캐시 → state 동기화 (SSR/CSR 불일치 회피).
  useEffect(() => {
    const cached = loadCache();
    if (cached.enabled || cached.source !== "none") {
      setSettings(cached);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    if (!userId) {
      setSettings(DEFAULT);
      saveCache(DEFAULT);
      return;
    }
    // ① 본인 dday 조회.
    const ownRes = await supabase
      .from("app_users")
      .select("dday_enabled, dday_date, dday_time")
      .eq("id", userId)
      .single();
    const own = ownRes.data as
      | { dday_enabled: boolean | null; dday_date: string | null; dday_time: string | null }
      | null;
    if (own?.dday_enabled && own.dday_date && own.dday_time) {
      const next: DdaySettings = {
        enabled: true,
        date: own.dday_date,
        time: normalizeTime(own.dday_time),
        source: "self",
      };
      setSettings(next);
      saveCache(next);
      return;
    }

    // ② 공유 파트너(들) 의 dday fallback.
    const sharesRes = await supabase
      .from("calendar_shares")
      .select("owner_id, viewer_id")
      .eq("status", "accepted")
      .or(`owner_id.eq.${userId},viewer_id.eq.${userId}`);
    const partnerIds = (sharesRes.data ?? [])
      .map((s: { owner_id: string; viewer_id: string }) =>
        s.owner_id === userId ? s.viewer_id : s.owner_id,
      )
      .filter((id) => id && id !== userId);
    if (partnerIds.length > 0) {
      const partnersRes = await supabase
        .from("app_users")
        .select("id, dday_enabled, dday_date, dday_time")
        .in("id", partnerIds);
      const validPartner = (partnersRes.data ?? []).find(
        (p: {
          dday_enabled: boolean | null;
          dday_date: string | null;
          dday_time: string | null;
        }) => p.dday_enabled && p.dday_date && p.dday_time,
      );
      if (validPartner) {
        const next: DdaySettings = {
          enabled: true,
          date: validPartner.dday_date as string,
          time: normalizeTime(validPartner.dday_time as string),
          source: "partner",
        };
        setSettings(next);
        saveCache(next);
        return;
      }
    }

    // ③ 본인 dday 가 disabled 라도 date/time 은 form 복원용으로 유지.
    const next: DdaySettings = {
      enabled: !!own?.dday_enabled,
      date: own?.dday_date ?? "",
      time: normalizeTime(own?.dday_time ?? ""),
      source: "none",
    };
    setSettings(next);
    saveCache(next);
  }, [userId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  /** 본인 row 만 갱신. partner 표시는 fetch 로 다시 결정. */
  const update = async (patch: Partial<Pick<DdaySettings, "enabled" | "date" | "time">>) => {
    if (!userId) return;
    const next = { ...settings, ...patch };
    // 낙관적 업데이트.
    setSettings({
      enabled: next.enabled,
      date: next.date,
      time: next.time,
      source: next.enabled && next.date && next.time ? "self" : settings.source,
    });
    await supabase
      .from("app_users")
      .update({
        dday_enabled: next.enabled,
        dday_date: next.date || null,
        dday_time: next.time || null,
      })
      .eq("id", userId);
    // 정확한 source 결정을 위해 재fetch (특히 OFF 시 파트너 fallback).
    fetchSettings();
  };

  const isReady =
    settings.source !== "none" && settings.date.length > 0 && settings.time.length >= 4;

  return { settings, update, isReady, refetch: fetchSettings };
}
