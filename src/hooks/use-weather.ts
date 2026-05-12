"use client";

import { useCallback, useEffect, useState } from "react";
import type { WeatherData } from "@/types";
import { useWeatherLocation } from "@/hooks/use-weather-location";
import { monthBounds } from "@/lib/date-utils";

const LS_KEY = "weather_cache_v3";

interface CachedEntry {
  data: WeatherData;
  cachedAt: string; // ISO
  type: "past" | "forecast";
}

type Cache = Record<string, CachedEntry>;

function cacheKey(locKey: string) {
  return `${LS_KEY}:${locKey}`;
}

function loadCache(locKey: string): Cache {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(cacheKey(locKey));
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveCache(locKey: string, cache: Cache) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(cacheKey(locKey), JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function isForecastExpired(cachedAt: string): boolean {
  const cached = new Date(cachedAt);
  const now = new Date();
  const diffHours = (now.getTime() - cached.getTime()) / 3600000;
  return diffHours > 6; // 6시간 지나면 예보 재요청
}

export function useWeather(year: number, month: number) {
  const location = useWeatherLocation();

  const { start: startDate, end: endDate } = monthBounds(year, month);

  const locKey = `${location.lat.toFixed(3)},${location.lon.toFixed(3)}`;

  // 초기 렌더 시 localStorage 캐시에서 즉시 hydrate — 빈 객체로 1차 렌더 후
  // 캐시 로드되며 2차 렌더하던 깜빡임 제거. (useState init 은 1회만 실행되므로
  // 첫 mount 시 prop 기준의 첫 키로만 동작 — 이후 월 변경 시는 아래 fetch effect 가 처리.)
  const computeInitialMap = (): Record<string, WeatherData> => {
    if (typeof window === "undefined") return {};
    const cache = loadCache(locKey);
    const map: Record<string, WeatherData> = {};
    for (const [date, entry] of Object.entries(cache)) {
      if (date >= startDate && date <= endDate) map[date] = entry.data;
    }
    return map;
  };
  // localStorage 를 한 번만 읽어 map·loading 둘 다 초기화 (이전엔 computeInitialMap 을
  // useState 초기값으로 2번 호출 → 마운트 때 localStorage 2번 읽음).
  const initial = useState(() => {
    const map = computeInitialMap();
    return { map, loading: Object.keys(map).length === 0 };
  })[0];
  const [weatherMap, setWeatherMap] = useState<Record<string, WeatherData>>(initial.map);
  const [loading, setLoading] = useState(initial.loading);

  useEffect(() => {
    const abortController = new AbortController();
    let cancelled = false;

    (async () => {
      setLoading(true);
      const cache = loadCache(locKey);
      const today = todayISO();

      // 1) 즉시: 캐시에서 이 달 범위 데이터 보여주기
      const initial: Record<string, WeatherData> = {};
      for (const [date, entry] of Object.entries(cache)) {
        if (date >= startDate && date <= endDate) {
          initial[date] = entry.data;
        }
      }
      if (!cancelled) {
        setWeatherMap(initial);
        setLoading(false);
      }

      // 2) 백그라운드: 빠진 날짜가 있거나 예보가 오래됐으면 재요청
      const needsRefresh = (() => {
        const cursor = new Date(startDate + "T00:00:00");
        const end = new Date(endDate + "T00:00:00");
        while (cursor <= end) {
          const d = cursor.toISOString().split("T")[0];
          const entry = cache[d];
          if (!entry) return true;
          if (entry.type === "forecast" && isForecastExpired(entry.cachedAt)) return true;
          cursor.setDate(cursor.getDate() + 1);
        }
        return false;
      })();

      if (!needsRefresh || cancelled) return;

      try {
        const res = await fetch(
          `/api/weather?start=${startDate}&end=${endDate}&lat=${location.lat}&lon=${location.lon}&country=${location.country}`,
          { signal: abortController.signal }
        );
        if (!res.ok || cancelled) return;
        const fresh: Record<string, WeatherData> = await res.json();
        if (cancelled) return;
        const nowIso = new Date().toISOString();
        const nextCache: Cache = { ...cache };
        const merged: Record<string, WeatherData> = { ...initial };
        for (const [date, data] of Object.entries(fresh)) {
          merged[date] = data;
          nextCache[date] = {
            data,
            cachedAt: nowIso,
            type: date >= today ? "forecast" : "past",
          };
        }
        saveCache(locKey, nextCache);
        if (!cancelled) setWeatherMap(merged);
      } catch {
        /* 네트워크 실패 또는 abort */
      }
    })();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [startDate, endDate, locKey, location.lat, location.lon, location.country]);

  // 인접 월(±1) prefetch — 사용자가 캘린더에서 좌우 스와이프했을 때
  // 날씨 아이콘이 캐시에서 즉시 뜨도록 백그라운드로 미리 요청.
  // 이미 캐시된 날짜(미만료) 만 있으면 skip.
  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    const prefetch = async (delta: number) => {
      const t = new Date(year, month - 1 + delta, 1);
      const ny = t.getFullYear();
      const nm = t.getMonth() + 1;
      const { start: sd, end: ed } = monthBounds(ny, nm);
      const cache = loadCache(locKey);
      // 이 월의 모든 날짜가 캐시에 있고 forecast 미만료 인지 검사 — 모두 OK 면 skip.
      const cur = new Date(sd + "T00:00:00");
      const end = new Date(ed + "T00:00:00");
      let allCached = true;
      while (cur <= end) {
        const d = cur.toISOString().split("T")[0];
        const entry = cache[d];
        if (!entry || (entry.type === "forecast" && isForecastExpired(entry.cachedAt))) {
          allCached = false;
          break;
        }
        cur.setDate(cur.getDate() + 1);
      }
      if (allCached) return;
      try {
        const res = await fetch(
          `/api/weather?start=${sd}&end=${ed}&lat=${location.lat}&lon=${location.lon}&country=${location.country}`,
          { signal: ac.signal },
        );
        if (!res.ok || cancelled) return;
        const fresh: Record<string, WeatherData> = await res.json();
        const today = todayISO();
        const nowIso = new Date().toISOString();
        const merged = loadCache(locKey);
        for (const [date, data] of Object.entries(fresh)) {
          merged[date] = {
            data,
            cachedAt: nowIso,
            type: date >= today ? "forecast" : "past",
          };
        }
        if (!cancelled) saveCache(locKey, merged);
      } catch {
        /* network/abort 무시 */
      }
    };
    prefetch(-1);
    prefetch(1);
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [year, month, locKey, location.lat, location.lon, location.country]);

  return { weatherMap, loading };
}
