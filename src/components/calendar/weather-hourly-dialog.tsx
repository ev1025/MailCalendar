"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Droplet, ArrowUp, ArrowDown } from "lucide-react";
import { useWeatherLocation } from "@/hooks/use-weather-location";
import { getWeatherIconUrl } from "@/lib/weather";
import { parseYmd } from "@/lib/date-utils";
import { KO_WEEKDAYS } from "@/lib/calendar/repeat-helpers";
import type { WeatherData } from "@/types";

/**
 * 시간별 날씨 상세 다이얼로그 — date 와 좌표 전달, /api/weather/hourly 호출.
 * 24시간 그리드(2x12) 로 시간·아이콘·기온·강수확률·풍속 표시.
 */

interface HourlyEntry {
  time: string;
  temperature: number;
  precipitation_probability: number | null;
  wind_speed: number;
  weather_icon: string;
  weather_description: string;
}

// 모듈 레벨 캐시 — 같은 (date,lat,lon) 의 시간별 응답을 5분 보관.
// 사용자가 다이얼로그 열기 전에 prefetchHourly() 로 미리 채울 수도 있음.
type CacheEntry = { entries: HourlyEntry[]; cachedAt: number };
const hourlyCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

function cacheKey(date: string, lat: number, lon: number): string {
  return `${date}|${lat.toFixed(3)}|${lon.toFixed(3)}`;
}

async function fetchHourly(
  date: string,
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<HourlyEntry[] | null> {
  const key = cacheKey(date, lat, lon);
  const cached = hourlyCache.get(key);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.entries;
  }
  try {
    const res = await fetch(
      `/api/weather/hourly?date=${date}&lat=${lat}&lon=${lon}`,
      { signal },
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (json.error) return null;
    const entries = (json.entries ?? []) as HourlyEntry[];
    hourlyCache.set(key, { entries, cachedAt: Date.now() });
    return entries;
  } catch {
    return null;
  }
}

/** 외부에서 미리 시간별 날씨 prefetch — calendar/page 에서 weatherMap 로드 후
 *  보이는 월의 일부 날짜에 대해 백그라운드 호출. 사용자가 클릭했을 때 즉시 표시. */
export function prefetchHourlyWeather(date: string, lat: number, lon: number): void {
  fetchHourly(date, lat, lon).catch(() => {});
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "YYYY-MM-DD" — 비어있으면 다이얼로그 빈 상태. */
  date: string;
  /** 일일 요약(최고/최저/대표 아이콘) — 헤더에 큰 아이콘으로 노출. 없으면 헤더 간소화. */
  weather?: WeatherData | null;
}

export default function WeatherHourlyDialog({ open, onOpenChange, date, weather }: Props) {
  const location = useWeatherLocation();
  const [entries, setEntries] = useState<HourlyEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !date) return;
    // 캐시 즉시 hydrate — 있으면 loading=false 로 0초 표시.
    const cached = hourlyCache.get(cacheKey(date, location.lat, location.lon));
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      setEntries(cached.entries);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setEntries(null);
    setError(null);
    setLoading(true);
    fetchHourly(date, location.lat, location.lon)
      .then((rows) => {
        if (cancelled) return;
        if (rows === null) setError("fetch failed");
        else setEntries(rows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, date, location.lat, location.lon]);

  const dateLabel = useMemo(() => {
    if (!date) return "";
    const d = parseYmd(date);
    if (Number.isNaN(d.getTime())) return date;
    const wk = KO_WEEKDAYS[d.getDay()];
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${wk})`;
  }, [date]);

  // 현재 시간 강조 — 오늘 날짜인 경우만.
  const nowHour = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    if (date !== today) return -1;
    return new Date().getHours();
  }, [date]);

  // 외부 클릭 닫힘은 Base UI Dialog 의 native dismissible(default true) 에 위임.
  // 이전엔 document pointerdown 으로 직접 outside 감지했지만, 그 클릭이 부모
  // DayDetail 의 backdrop 까지 그대로 전달되어 둘 다 닫히는 문제 발생 → 제거.

  /** "오전 12시 / 오전 N시 / 오후 12시 / 오후 N시" 한국식 12h 시각 라벨. */
  const formatHourKo = (h: number): string => {
    if (h === 0) return "오전 12시";
    if (h < 12) return `오전 ${h}시`;
    if (h === 12) return "오후 12시";
    return `오후 ${h - 12}시`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showBackButton={false}
        // FormPage(z-[70]) / 부모 DayDetail Dialog(z-50) 위에 모두 떠야 함.
        // 모바일은 calc(100%-1rem) — 거의 풀너비. sm:max-w-xl.
        // 그라디언트는 style 로 — bg-popover 를 background shorthand 가 덮어씀.
        className="max-w-[calc(100%-1rem)] sm:max-w-xl p-0 gap-0 overflow-hidden z-[80]"
        overlayClassName="z-[80]"
        onOverlayClick={(e) => {
          e.stopPropagation();
          onOpenChange(false);
        }}
        style={{
          // 다이얼로그 전체에 색감을 확실히 입히기 — 알파값 강화(파랑 0.32→0.10 / 따뜻 0.22).
          // popover 솔리드를 fallback 으로 깔아 텍스트 가독성 유지.
          background:
            "linear-gradient(180deg, oklch(0.7 0.13 250 / 0.32) 0%, oklch(0.7 0.13 250 / 0.10) 50%, oklch(0.75 0.13 30 / 0.22) 100%), var(--popover)",
        }}
      >
        <DialogHeader className="px-4 pt-5 pb-3 shrink-0">
          <DialogTitle className="text-base">{dateLabel} 시간별 날씨</DialogTitle>
        </DialogHeader>

        {/* 그라디언트 배경 위에 두 개의 검은 반투명 패널(hero · strip).
            wrapper 의 px-4 가 viewport 안쪽 좌우 여백을 잡아주고, 각 패널은 w-full
            + min-w-0 으로 wrapper 폭을 절대 안 넘김. strip 은 overflow-hidden 으로
            내부 가로 스크롤이 패널을 뚫고 나오지 않게 차단. */}
        <div className="flex w-full min-w-0 flex-col gap-2 px-4 pb-4">

        {/* hero 패널 — 아이콘 + 큰 기온 + 한 줄 메타. */}
        {weather && (
          <div className="flex w-full min-w-0 items-center gap-4 rounded-2xl bg-black/[0.07] dark:bg-white/[0.06] ring-1 ring-inset ring-white/40 dark:ring-white/[0.06] shadow-[0_2px_6px_-2px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.5)] dark:shadow-[0_2px_6px_-2px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.04)] px-5 py-3.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getWeatherIconUrl(weather.weather_icon)}
              alt={weather.weather_description}
              className="h-14 w-14 shrink-0 drop-shadow-sm"
            />
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <span className="text-3xl font-bold tabular-nums leading-none text-foreground">
                {Math.round((weather.temperature_max + weather.temperature_min) / 2)}°
              </span>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs tabular-nums">
                <span className="text-foreground/70">{weather.weather_description}</span>
                <span className="text-foreground/30">·</span>
                <span className="flex items-center gap-0.5 text-rose-500 dark:text-rose-400">
                  <ArrowUp className="h-3 w-3" />
                  {weather.temperature_max}°
                </span>
                <span className="flex items-center gap-0.5 text-sky-500 dark:text-sky-400">
                  <ArrowDown className="h-3 w-3" />
                  {weather.temperature_min}°
                </span>
              </div>
            </div>
          </div>
        )}

        {/* strip 패널 — outer overflow-hidden(=viewport 가둠) + inner overflow-x-auto. */}
        <div className="w-full min-w-0 rounded-2xl bg-black/[0.07] dark:bg-white/[0.06] ring-1 ring-inset ring-white/40 dark:ring-white/[0.06] shadow-[0_2px_6px_-2px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.5)] dark:shadow-[0_2px_6px_-2px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.04)] overflow-hidden">
        <div className="overflow-x-auto overflow-y-hidden py-3 [touch-action:pan-x]">
            {loading && (
              <div className="flex gap-3 px-5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 w-16 shrink-0 rounded-xl" />
                ))}
              </div>
            )}

            {error && !loading && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                날씨 정보를 가져올 수 없습니다.
              </p>
            )}

            {!loading && entries && entries.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                표시할 시간별 데이터가 없습니다.
              </p>
            )}

            {!loading && entries && entries.length > 0 && (
              <div className="flex gap-1 px-3">
                {entries.map((e) => {
                  const hour = parseInt(e.time.slice(11, 13), 10);
                  const isNow = hour === nowHour;
                  return (
                    <div
                      key={e.time}
                      className={`flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-1.5 py-1.5 min-w-[54px] ${
                        // 그라디언트 배경 위에서 isNow 강조 — primary 보다는 white/fg 로
                        // 자연스럽게 떠오르는 느낌. 라이트모드에선 흰 카드, 다크모드는 fg/8.
                        isNow ? "bg-white/55 dark:bg-foreground/10 ring-1 ring-foreground/15 shadow-sm" : ""
                      }`}
                    >
                      {/* 시각 — 그라디언트 위에선 muted 가 너무 흐릿해 fg/65 로 한 단계 진하게. */}
                      <span className="text-[10px] font-medium tabular-nums text-foreground/65 whitespace-nowrap">
                        {formatHourKo(hour)}
                      </span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getWeatherIconUrl(e.weather_icon)}
                        alt={e.weather_description}
                        className="h-8 w-8"
                      />
                      {/* 기온 — 가장 강조. */}
                      <span className="mt-0.5 text-sm font-bold tabular-nums leading-none text-foreground">
                        {e.temperature}°
                      </span>
                      {/* 강수확률 — 채워진 sky-400 + 숫자 fg/55. */}
                      <span className="mt-1 flex items-center gap-0.5 text-[8px] tabular-nums leading-none">
                        <Droplet className="h-2 w-2 shrink-0 text-sky-500 dark:text-sky-400" fill="currentColor" />
                        <span className="text-foreground/55">{e.precipitation_probability ?? 0}%</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
