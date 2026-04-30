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

/**
 * 주요 한국 도시 한글 → 영문 별명.
 * Open-Meteo geocoding 은 한글 쿼리에 매칭이 빈약해 ('서울' 입력 시 결과 없음
 * 또는 작은 마을 위주). 한글로 검색했는데 매핑이 있으면 영문으로도 같이 쿼리해
 * 결과를 합침.
 */
const KO_TO_EN: Record<string, string> = {
  서울: "Seoul",
  부산: "Busan",
  대구: "Daegu",
  인천: "Incheon",
  광주: "Gwangju",
  대전: "Daejeon",
  울산: "Ulsan",
  세종: "Sejong",
  제주: "Jeju",
  수원: "Suwon",
  성남: "Seongnam",
  용인: "Yongin",
  고양: "Goyang",
  창원: "Changwon",
  청주: "Cheongju",
  전주: "Jeonju",
  포항: "Pohang",
  안산: "Ansan",
  김해: "Gimhae",
  춘천: "Chuncheon",
  강릉: "Gangneung",
  여수: "Yeosu",
  목포: "Mokpo",
  경주: "Gyeongju",
  안동: "Andong",
  속초: "Sokcho",
};

async function fetchOnce(q: string): Promise<GeoResult[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    q,
  )}&count=20&language=ko&format=json`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results as GeoResult[]) || [];
}

export async function searchLocation(query: string): Promise<GeoResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // 한글 alias 가 있으면 한글 + 영문 두 쿼리를 병렬 호출 후 결과 합침.
  const english = KO_TO_EN[trimmed];
  const queries = english ? [trimmed, english] : [trimmed];
  const batches = await Promise.all(queries.map(fetchOnce));
  const all = batches.flat();

  // id 기준 dedup. 인구순 정렬 후 상위 8개.
  const seen = new Set<number>();
  const unique = all.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
  return unique
    .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
    .slice(0, 8);
}
