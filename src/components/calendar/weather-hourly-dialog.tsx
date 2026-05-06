"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Droplets, Wind } from "lucide-react";
import { useWeatherLocation } from "@/hooks/use-weather-location";
import { getWeatherIconUrl } from "@/lib/weather";

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
}

export default function WeatherHourlyDialog({ open, onOpenChange, date }: Props) {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showBackButton={false}
        className="max-w-[calc(100%-1.5rem)] sm:max-w-md p-0 gap-0 overflow-hidden"
      >
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base">{dateLabel} 시간별 날씨</DialogTitle>
        </DialogHeader>

        <div className="max-h-[60dvh] overflow-y-auto px-3 pb-4">
          {loading && (
            <div className="flex flex-col gap-1.5 px-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
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
            <div className="flex flex-col">
              {entries.map((e) => {
                const hour = parseInt(e.time.slice(11, 13), 10);
                const isNow = hour === nowHour;
                return (
                  <div
                    key={e.time}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${
                      isNow ? "bg-primary/10 ring-1 ring-primary/20" : ""
                    }`}
                  >
                    {/* 시각 */}
                    <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
                      {String(hour).padStart(2, "0")}시
                    </span>
                    {/* 아이콘 + 한글 */}
                    <div className="flex flex-1 min-w-0 items-center gap-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getWeatherIconUrl(e.weather_icon)}
                        alt={e.weather_description}
                        className="h-6 w-6 shrink-0"
                      />
                      <span className="truncate text-xs text-foreground">
                        {e.weather_description}
                      </span>
                    </div>
                    {/* 강수확률 — 미래 데이터만 */}
                    {e.precipitation_probability != null && (
                      <span className="flex items-center gap-0.5 text-[11px] tabular-nums text-blue-500 shrink-0 w-10 justify-end">
                        <Droplets className="h-3 w-3" />
                        {e.precipitation_probability}%
                      </span>
                    )}
                    {/* 풍속 */}
                    <span className="flex items-center gap-0.5 text-[11px] tabular-nums text-muted-foreground shrink-0 w-12 justify-end">
                      <Wind className="h-3 w-3" />
                      {e.wind_speed}m/s
                    </span>
                    {/* 기온 */}
                    <span className="text-sm font-semibold tabular-nums shrink-0 w-10 text-right">
                      {e.temperature}°
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
