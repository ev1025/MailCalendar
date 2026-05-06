"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Droplet } from "lucide-react";
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
        // 가로 스크롤 스트립을 충분히 보여주기 위해 max-w 살짝 키움.
        className="max-w-[calc(100%-1.5rem)] sm:max-w-lg p-0 gap-0 overflow-hidden z-[80]"
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
                      <span className="mt-1 text-base font-bold tabular-nums leading-none">
                        {e.temperature}°
                      </span>
                      {/* 강수확률 — 고정 폭(w-10) 안에서 아이콘 좌측 / 값 우측 정렬.
                          카드별로 값 자릿수가 달라도(0%/30%/100%) 아이콘 위치가
                          항상 같은 column 에 정렬되어 정돈된 느낌. */}
                      <span className="mt-1.5 flex w-10 items-center justify-between text-[10px] tabular-nums leading-none text-blue-500">
                        {e.precipitation_probability != null ? (
                          <>
                            <Droplet className="h-3 w-3 shrink-0" />
                            <span>{e.precipitation_probability}%</span>
                          </>
                        ) : (
                          <span className="mx-auto text-muted-foreground/30">·</span>
                        )}
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
