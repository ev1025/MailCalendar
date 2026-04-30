"use client";

import { useEffect, useState } from "react";

export interface WeatherLocation {
  name: string;
  lat: number;
  lon: number;
  country: string; // ISO2 (e.g. "KR", "FR")
}

const KEY = "weather_location";
const DEFAULT: WeatherLocation = {
  name: "서울",
  lat: 37.5665,
  lon: 126.978,
  country: "KR",
};

export function getWeatherLocation(): WeatherLocation {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function setWeatherLocation(loc: WeatherLocation) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(loc));
  window.dispatchEvent(new Event("weather-location-change"));
}

export function useWeatherLocation() {
  const [loc, setLoc] = useState<WeatherLocation>(DEFAULT);
  useEffect(() => {
    setLoc(getWeatherLocation());
    const handler = () => setLoc(getWeatherLocation());
    window.addEventListener("weather-location-change", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("weather-location-change", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);
  return loc;
}

export interface GeoResult {
  id: number;
  name: string;
  country: string;
  country_code: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  /** Open-Meteo 가 일부 결과에 채워주는 인구 — 동명 도시 disambiguation 용. */
  population?: number;
}

export async function searchLocation(query: string): Promise<GeoResult[]> {
  if (!query.trim()) return [];
  // count 를 늘려 후보를 더 많이 받고, 클라에서 인구순 정렬해 큰 도시 먼저 표시.
  // Open-Meteo 기본 ranking 은 점수 기반이라 같은 이름의 작은 마을이 큰 도시보다
  // 위에 오는 경우가 빈번 (예: '부산' 검색에 전남 부산리가 먼저).
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    query
  )}&count=20&language=ko&format=json`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const results = (data.results as GeoResult[]) || [];
  return results
    .slice()
    .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
    .slice(0, 8);
}
