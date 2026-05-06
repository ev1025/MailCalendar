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
    let cancelled = false;
    setEntries(null);
    setError(null);
    setLoading(true);
    fetch(
      `/api/weather/hourly?date=${date}&lat=${location.lat}&lon=${location.lon}`,
    )
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) setError(json.error);
        else setEntries(json.entries ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
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
    const d = new Date(date + "T00:00:00");
    if (Number.isNaN(d.getTime())) return date;
    const wk = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
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
        // 부모 DayDetail 의 일정이 많아도 가려지도록 max-w xl 까지 확장.
        // 모바일은 calc(100%-1rem) — 거의 풀너비.
        className="max-w-[calc(100%-1rem)] sm:max-w-xl p-0 gap-0 overflow-hidden z-[80]"
        // overlay 도 함께 z-[80] — 부모 다이얼로그 콘텐츠 위로 깔리지 않으면
        // 일정이 많은 DayDetail 의 popup ring/border 가 hourly popup 을 가림.
        overlayClassName="z-[80]"
        // overlay 클릭 시 명시적 close — Base UI dismissible 이 nested 환경에서
        // 동작 안 하는 케이스 보강. stopPropagation 으로 부모(DayDetail) 까지
        // 전파 안 되게 막아 부모 닫힘 cascade 방지.
        onOverlayClick={(e) => {
          e.stopPropagation();
          onOpenChange(false);
        }}
      >
        <div className="contents">
          <DialogHeader className="px-5 pt-5 pb-2 shrink-0">
            <DialogTitle className="text-base">{dateLabel} 시간별 날씨</DialogTitle>
          </DialogHeader>

          {/* 일일 요약 — 큰 아이콘 + 한글 설명 + 최고/최저 기온. weather prop 없으면 생략. */}
          {weather && (
            <div className="flex items-center gap-4 px-5 pb-4 pt-1 border-b">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getWeatherIconUrl(weather.weather_icon)}
                alt={weather.weather_description}
                className="h-16 w-16 shrink-0"
              />
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <span className="text-sm font-medium text-foreground truncate">
                  {weather.weather_description}
                </span>
                <div className="flex items-center gap-3 text-sm tabular-nums">
                  <span className="flex items-center gap-0.5 text-red-500">
                    <ArrowUp className="h-3.5 w-3.5" />
                    {weather.temperature_max}°
                  </span>
                  <span className="flex items-center gap-0.5 text-blue-500">
                    <ArrowDown className="h-3.5 w-3.5" />
                    {weather.temperature_min}°
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 본문 — 가로 스크롤 스트립. iPhone Weather 앱 스타일.
              한 컬럼: 시각 / 아이콘 / 기온 / 풍속 / 강수확률. */}
          <div className="overflow-x-auto overflow-y-hidden pb-5">
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
                        isNow ? "bg-primary/10 ring-1 ring-primary/20" : ""
                      }`}
                    >
                      {/* 시각 — 오전/오후 N시. 살짝 축소. */}
                      <span className="text-[10px] font-medium tabular-nums text-muted-foreground whitespace-nowrap">
                        {formatHourKo(hour)}
                      </span>
                      {/* 아이콘 — 한 단계 작게(36px → 32px). */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getWeatherIconUrl(e.weather_icon)}
                        alt={e.weather_description}
                        className="h-8 w-8"
                      />
                      {/* 기온 — 가장 강조이지만 한 단계 축소. */}
                      <span className="mt-0.5 text-sm font-bold tabular-nums leading-none">
                        {e.temperature}°
                      </span>
                      {/* 강수확률 — 아이콘과 값 사이 gap-0.5 로 가까이. 사이즈 한 단계 더 축소.
                          데이터 없는 날(과거 등) 도 "0%" 로 통일 표기 — 사용자 일관성. */}
                      <span className="mt-1 flex items-center gap-0.5 text-[8px] tabular-nums leading-none text-blue-500">
                        <Droplet className="h-2 w-2 shrink-0" />
                        <span>{e.precipitation_probability ?? 0}%</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
