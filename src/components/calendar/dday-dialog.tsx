"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Heart, CalendarDays } from "lucide-react";
import DatePicker from "@/components/ui/date-picker";
import { todayYmd, daysBetween } from "@/lib/date-utils";

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

/** 단일 카운트 셀 — 숫자 + 단위. 색상은 props 의 tone 으로 결정. */
function CountCell({
  value,
  unit,
  tone,
}: {
  value: number;
  unit: string;
  tone: "rose" | "slate" | "blue" | "amber";
}) {
  const tones: Record<typeof tone, { bg: string; text: string }> = {
    rose: { bg: "bg-rose-500", text: "text-white" },
    slate: { bg: "bg-slate-200 dark:bg-slate-700", text: "text-slate-900 dark:text-slate-100" },
    blue: { bg: "bg-blue-600", text: "text-white" },
    amber: { bg: "bg-amber-500", text: "text-white" },
  };
  const { bg, text } = tones[tone];
  return (
    <div
      // max-w 제거 — 트랙을 꽉 채우도록. 그래야 그리드 col-gap 과 row-gap 이
      // 시각적으로도 같은 간격으로 보임 (max-w 가 있으면 트랙 안에서 셀이
      // 좌측에 몰려 cell 사이 공백이 row-gap 보다 커 보이는 문제).
      className={`${bg} ${text} flex aspect-square w-full flex-col items-center justify-center rounded-2xl shadow-sm`}
    >
      <span className="text-3xl font-extrabold tabular-nums leading-none tracking-tight sm:text-4xl">
        {value}
      </span>
      <span className="mt-1 text-[10px] font-medium uppercase tracking-widest opacity-90 sm:text-[11px]">
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

  // D-day 계산기 — 임의의 날짜를 골라 오늘부터의 차이 표시. 다이얼로그 안에서만 임시 상태.
  const [calcDate, setCalcDate] = useState("");
  const calcResult = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(calcDate)) return null;
    const days = daysBetween(todayYmd(), calcDate);
    if (days === 0) return { label: "D-Day", tone: "today" as const, days: 0 };
    if (days > 0) return { label: `D-${days}`, tone: "future" as const, days };
    return { label: `D+${Math.abs(days)}`, tone: "past" as const, days };
  }, [calcDate]);

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

          {/* 카운트 그리드 — 2x2. 셀 색은 의미별: 일=강조(rose), 시간=중립(slate), 분=blue, 초=amber. */}
          {diff && (
            <div className="mx-auto grid w-full max-w-[228px] grid-cols-2 gap-2 sm:max-w-[228px] sm:gap-2">
              <CountCell value={diff.days} unit="일" tone="rose" />
              <CountCell value={diff.hours} unit="시간" tone="slate" />
              <CountCell value={diff.minutes} unit="분" tone="blue" />
              <CountCell value={diff.seconds} unit="초" tone="amber" />
            </div>
          )}

          {!target && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              D-day 기준일이 설정되지 않았어요
            </p>
          )}

          {/* 구분선 + D-day 계산기 — 임의 날짜를 골라 오늘부터 차이 표시.
              future = D-N / today = D-Day / past = D+N. */}
          <div className="mt-6 border-t border-border/60 pt-5">
            <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              <span>D-day 계산기</span>
            </div>
            <DatePicker
              value={calcDate}
              onChange={setCalcDate}
              placeholder="날짜를 선택하세요"
              className="w-full"
            />
            {calcResult && (
              <div
                className={`mt-3 flex items-baseline justify-center gap-2 rounded-xl py-3 ${
                  calcResult.tone === "today"
                    ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                    : calcResult.tone === "future"
                      ? "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                      : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                }`}
              >
                <span className="text-3xl font-extrabold tabular-nums tracking-tight">
                  {calcResult.label}
                </span>
                {calcResult.tone !== "today" && (
                  <span className="text-xs text-muted-foreground">
                    {calcResult.tone === "future" ? "남음" : "지남"}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
