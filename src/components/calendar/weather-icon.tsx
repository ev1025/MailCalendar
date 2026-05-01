"use client";

import { getWeatherIconUrl } from "@/lib/weather";
import type { WeatherData } from "@/types";

interface WeatherIconProps {
  weather: WeatherData;
  compact?: boolean;
  inline?: boolean;
  showRange?: boolean;
}

interface TempRangeProps {
  min: number;
  max: number;
  /** 글자 크기 — Tailwind 클래스 그대로 받음. */
  size?: string;
  /** 가운데 구분자 색상 — text-muted-foreground 또는 흐림 변형. */
  separatorColor?: string;
}

/** 최저/최고 기온 — 파랑/회색/빨강 트리오. 모든 변형이 공유하는 핵심. */
function TempRange({
  min,
  max,
  size = "",
  separatorColor = "text-muted-foreground",
}: TempRangeProps) {
  return (
    <>
      <span className={`${size} text-blue-500 shrink-0`}>{min}°</span>
      <span className={`${size} ${separatorColor} shrink-0`}> / </span>
      <span className={`${size} text-red-500 shrink-0`}>{max}°</span>
    </>
  );
}

export default function WeatherIcon({
  weather,
  compact,
  inline,
  showRange,
}: WeatherIconProps) {
  const iconUrl = getWeatherIconUrl(weather.weather_icon);

  if (inline) {
    return (
      <div className="flex items-center gap-1 text-xs whitespace-nowrap overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={iconUrl} alt={weather.weather_description} className="h-4 w-4 shrink-0" />
        <span className="text-muted-foreground truncate">{weather.weather_description}</span>
        <TempRange min={weather.temperature_min} max={weather.temperature_max} />
      </div>
    );
  }

  if (compact) {
    // 컴팩트 — 모바일/데스크톱 캘린더 셀. 아이콘 위, 온도 아래 (스택).
    // 토(파랑) · 일(빨강) 날짜 숫자(500 레벨)와 명도 구분 위해 400 레벨 + /60 separator.
    return (
      <div className="flex flex-col items-center gap-0 leading-[1] shrink-0 max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={iconUrl}
          alt={weather.weather_description}
          className="h-[14px] w-[14px] md:h-[18px] md:w-[18px] shrink-0 -mb-0.5"
        />
        <div className="flex items-center leading-[1] whitespace-nowrap tabular-nums">
          <span className="text-[6.5px] md:text-[8px] text-blue-400">
            {weather.temperature_min}°
          </span>
          <span className="text-[6.5px] md:text-[8px] text-muted-foreground/60">/</span>
          <span className="text-[6.5px] md:text-[8px] text-red-400">
            {weather.temperature_max}°
          </span>
        </div>
      </div>
    );
  }

  // 기본 — DayDetail 헤더. 가로 1줄.
  return (
    <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={iconUrl}
        alt={weather.weather_description}
        className="h-5 w-5 shrink-0"
        title={weather.weather_description}
      />
      {showRange ? (
        <span className="leading-none flex">
          <TempRange min={weather.temperature_min} max={weather.temperature_max} />
        </span>
      ) : (
        <span className="text-muted-foreground leading-none">{weather.temperature_max}°</span>
      )}
      <span className="text-muted-foreground">{weather.weather_description}</span>
    </div>
  );
}
