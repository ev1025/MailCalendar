"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Droplet, Wind } from "lucide-react";
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

  // 외부(backdrop) 클릭 시 닫힘 — Base UI 기본 동작이지만 z-stack 충돌 환경에서
  // 보강하기 위해 ref + document pointerdown 으로 outside 감지.
  const popupRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (popupRef.current && t && !popupRef.current.contains(t)) {
        onOpenChange(false);
      }
    };
    // 다음 tick — open 트리거 자체 click 이 outside 로 잡히는 race 회피.
    const id = window.setTimeout(() => {
      document.addEventListener("pointerdown", handler);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("pointerdown", handler);
    };
  }, [open, onOpenChange]);

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
        // FormPage(z-[70]) 위에서도 보이도록 z-[80] 강제. backdrop 까지 함께 올림.
        // 가로 스크롤 스트립을 충분히 보여주기 위해 max-w 살짝 키움.
        className="max-w-[calc(100%-1.5rem)] sm:max-w-lg p-0 gap-0 overflow-hidden z-[80]"
      >
        <div ref={popupRef} className="contents">
          <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
            <DialogTitle className="text-base">{dateLabel} 시간별 날씨</DialogTitle>
          </DialogHeader>

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
                      className={`flex shrink-0 flex-col items-center gap-1 rounded-xl px-2 py-2 min-w-[64px] ${
                        isNow ? "bg-primary/10 ring-1 ring-primary/20" : ""
                      }`}
                    >
                      {/* 시각 — 오전/오후 N시 */}
                      <span className="text-[11px] font-medium tabular-nums text-muted-foreground whitespace-nowrap">
                        {formatHourKo(hour)}
                      </span>
                      {/* 아이콘 */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getWeatherIconUrl(e.weather_icon)}
                        alt={e.weather_description}
                        className="h-9 w-9"
                      />
                      {/* 기온 — 가장 강조. */}
                      <span className="text-base font-bold tabular-nums leading-none">
                        {e.temperature}°
                      </span>
                      {/* 강수확률 — 물방울 1개. 미래 데이터만 (과거는 hyphen). */}
                      <span className="flex items-center gap-0.5 text-[10px] tabular-nums text-blue-500 leading-none mt-0.5">
                        {e.precipitation_probability != null ? (
                          <>
                            <Droplet className="h-3 w-3" />
                            {e.precipitation_probability}%
                          </>
                        ) : (
                          <span className="text-muted-foreground/30">·</span>
                        )}
                      </span>
                      {/* 풍속 — 보조 정보, 작게. */}
                      <span className="flex items-center gap-0.5 text-[10px] tabular-nums text-muted-foreground leading-none">
                        <Wind className="h-2.5 w-2.5" />
                        {e.wind_speed}
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
