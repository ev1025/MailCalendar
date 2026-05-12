"use client";

import { getWeatherIconUrl } from "@/lib/weather";
import type { WeatherData } from "@/types";

interface WeatherIconProps {
  weather: WeatherData;
  compact?: boolean;
  inline?: boolean;
  showRange?: boolean;
  /** 기본 가로형에서 폰트·아이콘·여백 한 단계 축소. day-detail 헤더 우측처럼
   *  공간 좁을 때 사용. */
  dense?: boolean;
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
      <span className={`${size} text-blue-500 dark:text-blue-400 shrink-0`}>{min}°</span>
      <span className={`${size} ${separatorColor} shrink-0`}> / </span>
      <span className={`${size} text-red-500 dark:text-red-400 shrink-0`}>{max}°</span>
    </>
  );
}

export default function WeatherIcon({
  weather,
  compact,
  inline,
  showRange,
  dense,
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
          <span className="text-[6.5px] md:text-[8px] text-blue-500 dark:text-blue-400">
            {weather.temperature_min}°
          </span>
          <span className="text-[6.5px] md:text-[8px] text-muted-foreground/60">/</span>
          <span className="text-[6.5px] md:text-[8px] text-red-500 dark:text-red-400">
            {weather.temperature_max}°
          </span>
        </div>
      </div>
    );
  }

  // 기본 — DayDetail 헤더 / EventForm 헤더. 가로 1줄.
  // 순서: [한글 설명] [아이콘] [기온] — 텍스트 좌측, 시각 표현 우측.
  // dense=true: 공간 좁은 곳용으로 폰트·아이콘·간격 한 단계 더 축소.
  const textCls = dense ? "text-[10px]" : "text-xs";
  const gapCls = dense ? "gap-0.5" : "gap-1.5";
  const imgCls = dense ? "h-3.5 w-3.5" : "h-5 w-5";
  return (
    <div className={`flex items-center ${gapCls} ${textCls} whitespace-nowrap`}>
      <span className="text-muted-foreground leading-none">{weather.weather_description}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={iconUrl}
        alt={weather.weather_description}
        className={`${imgCls} shrink-0`}
        title={weather.weather_description}
      />
      {showRange ? (
        <span className="leading-none flex">
          <TempRange min={weather.temperature_min} max={weather.temperature_max} />
        </span>
      ) : (
        <span className="text-muted-foreground leading-none">{weather.temperature_max}°</span>
      )}
    </div>
  );
}
