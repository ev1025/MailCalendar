"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Heart, CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { addDaysISO, ymd, todayYmd, daysBetween } from "@/lib/date-utils";

/**
 * D-day 다이얼로그 — 사용자가 입력한 기념일(date+time)부터 경과 시간을 1초 단위로 표시.
 *
 * 이전 iframe srcDoc 방식은 흰 배경이 다이얼로그 카드와 분리 안 돼 어색.
 * 또 다크모드 미대응. React 네이티브 렌더로 교체 → 테마 토큰·그라디언트·다크모드 자동.
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "YYYY-MM-DD" — 비어있으면 다이얼로그가 빈 상태로 뜸 (caller 가 가드해야 함). */
  date: string;
  /** "HH:MM" 24h */
  time: string;
}

interface Diff {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function computeDiff(target: Date): Diff {
  const ms = Date.now() - target.getTime();
  const abs = Math.abs(ms);
  return {
    days: Math.floor(abs / 86400000),
    hours: Math.floor((abs % 86400000) / 3600000),
    minutes: Math.floor((abs % 3600000) / 60000),
    seconds: Math.floor((abs % 60000) / 1000),
  };
}

/** 단일 카운트 셀 — 숫자 + 단위. 원래 iframe 시절 컬러 팔레트 복원.
 *  숫자는 모두 진한 네이비(#183059) 로 통일, 라벨은 셀별 대비색. */
function CountCell({
  value,
  unit,
  tone,
}: {
  value: number;
  unit: string;
  tone: "days" | "hours" | "minutes" | "seconds";
}) {
  // bg = 셀 배경 hex, label = "일/시간/분/초" 색. 숫자는 항상 NAVY.
  const NAVY = "#183059";
  const palette: Record<typeof tone, { bg: string; label: string }> = {
    days: { bg: "#EF2F3C", label: "#EEEEEE" },          // 빨강 + 옅은 회색 라벨
    hours: { bg: "#EEEEEE", label: NAVY },              // 연회색 + 네이비 라벨
    minutes: { bg: "#276FBF", label: "#EEEEEE" },        // 파랑 + 옅은 회색 라벨
    seconds: { bg: "#F0A202", label: "#EEEEEE" },       // 주황 + 옅은 회색 라벨
  };
  const { bg, label } = palette[tone];
  return (
    <div
      // max-w 제거 — 트랙을 꽉 채우도록. 그래야 그리드 col-gap 과 row-gap 이
      // 시각적으로도 같은 간격으로 보임.
      className="flex aspect-square w-full flex-col items-center justify-center rounded-2xl shadow-sm"
      style={{ backgroundColor: bg }}
    >
      <span
        className="text-3xl font-extrabold tabular-nums leading-none tracking-tight sm:text-4xl"
        style={{ color: NAVY }}
      >
        {value}
      </span>
      <span
        className="mt-1 text-[10px] font-medium uppercase tracking-widest sm:text-[11px]"
        style={{ color: label }}
      >
        {unit}
      </span>
    </div>
  );
}

export default function DdayDialog({ open, onOpenChange, date, time }: Props) {
  const target = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    if (!/^\d{2}:\d{2}$/.test(time)) return null;
    const t = new Date(`${date}T${time}:00`);
    return Number.isNaN(t.getTime()) ? null : t;
  }, [date, time]);

  const [diff, setDiff] = useState<Diff | null>(() => (target ? computeDiff(target) : null));

  useEffect(() => {
    if (!open || !target) return;
    setDiff(computeDiff(target));
    const id = setInterval(() => setDiff(computeDiff(target)), 1000);
    return () => clearInterval(id);
  }, [open, target]);

  const labelDate = useMemo(() => {
    if (!target) return "";
    const [y, m, d] = date.split("-");
    return `${y}. ${m}. ${d}. ${time}`;
  }, [date, time, target]);

  // D-day 계산기 — 기준일(date)부터 N일째 되는 날짜 계산. 예: 100, 1000일 기념일 산출.
  // 음수도 허용 → 기준일 N일 전 날짜. 기준일 미설정 시 비활성.
  const [calcDays, setCalcDays] = useState("");
  const calcResult = useMemo(() => {
    if (!target) return null;
    const trimmed = calcDays.trim();
    if (!trimmed) return null;
    const n = parseInt(trimmed, 10);
    if (Number.isNaN(n)) return null;
    // 1일째 = 기준일 그 자체. N일째 = 기준일 + (N-1)일.
    // 음수 입력은 그대로 (-N 일째 = 기준일에서 -N+1, 사실상 |N| 일 전).
    const offset = n >= 1 ? n - 1 : n;
    const resultDate = addDaysISO(ymd(target), offset);
    const today = todayYmd();
    const diffFromToday = daysBetween(today, resultDate);
    return { date: resultDate, n, offset, diffFromToday };
  }, [calcDays, target]);

  /** "YYYY-MM-DD" → "YYYY년 M월 D일 (요일)" 표시. */
  const formatKoreanDate = (iso: string): string => {
    const d = new Date(iso + "T00:00:00");
    if (Number.isNaN(d.getTime())) return iso;
    const wk = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${wk})`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showBackButton={false}
        // 다이얼로그 카드 자체는 default(투명) — 내부 그라디언트가 그대로 보이도록.
        className="max-w-[calc(100%-1.5rem)] sm:max-w-[420px] p-0 gap-0 overflow-hidden border-none"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>D-day</DialogTitle>
        </DialogHeader>

        {/* 배경 — 부드러운 라디얼 그라디언트 + 다크모드 대응. 카드 외곽과 자연스럽게 이어짐. */}
        <div
          className="relative px-6 py-8 sm:px-8 sm:py-10"
          style={{
            background:
              "radial-gradient(circle at top right, oklch(0.75 0.13 20 / 0.12), transparent 55%), radial-gradient(circle at bottom left, oklch(0.7 0.13 250 / 0.14), transparent 50%), var(--card)",
          }}
        >
          {/* 상단 라벨 */}
          {target && (
            <div className="mb-5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground sm:text-sm">
              <Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-500" />
              <span className="tabular-nums">{labelDate}</span>
            </div>
          )}

          {/* 카운트 그리드 — 2x2. 색상은 이전 iframe 디자인 그대로 복원. */}
          {diff && (
            <div className="mx-auto grid w-full max-w-[228px] grid-cols-2 gap-2 sm:max-w-[228px] sm:gap-2">
              <CountCell value={diff.days} unit="일" tone="days" />
              <CountCell value={diff.hours} unit="시간" tone="hours" />
              <CountCell value={diff.minutes} unit="분" tone="minutes" />
              <CountCell value={diff.seconds} unit="초" tone="seconds" />
            </div>
          )}

          {!target && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              D-day 기준일이 설정되지 않았어요
            </p>
          )}

          {/* 구분선 + D-day 계산기 — 기준일 기준 N일째 되는 날짜 계산. 100일/1000일 기념일 등.
              기준일 미설정 시는 안내 문구만 표시. */}
          {target && (
            <div className="mt-6 border-t border-border/60 pt-5">
              <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                <span>며칠째 되는 날 계산</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={calcDays}
                    onChange={(e) => setCalcDays(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
                    }}
                    placeholder="100"
                    className="pr-8 text-right tabular-nums"
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
                  >
                    일째
                  </span>
                </div>
                {/* 빠른 프리셋 — 100/200/365/1000일 */}
                <div className="flex gap-1">
                  {[100, 365, 1000].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setCalcDays(String(p))}
                      className="px-2 h-9 rounded-md border text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors tabular-nums"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              {calcResult && (
                <div className="mt-3 rounded-xl bg-rose-500/10 px-4 py-3 text-center">
                  <p className="text-[11px] text-muted-foreground">
                    기준일로부터 <span className="font-semibold tabular-nums">{calcResult.n}</span>일째
                  </p>
                  <p className="mt-1 text-base font-semibold tabular-nums text-rose-700 dark:text-rose-300">
                    {formatKoreanDate(calcResult.date)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                    {calcResult.diffFromToday === 0
                      ? "바로 오늘"
                      : calcResult.diffFromToday > 0
                        ? `오늘로부터 ${calcResult.diffFromToday}일 후`
                        : `${Math.abs(calcResult.diffFromToday)}일 전 지남`}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
