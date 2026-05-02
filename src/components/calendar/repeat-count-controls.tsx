"use client";

import { useEffect, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { FORM_LABEL } from "@/lib/form-classes";
import RepeatCountField from "./repeat-count-field";
import { WeeklyIntervalButton, MonthlyNthButton } from "./repeat-modifiers";

/**
 * 반복 횟수 + 격주/N주차 modifier 버튼 묶음.
 * Fragment 로 sibling 들을 반환 — 부모 flex 컨테이너(items-end gap-2)에서 정렬.
 *
 * 1) 반복 횟수 column (Label + RepeatCountField)
 * 2) WeeklyIntervalButton (repeat=weekly 일 때만)
 * 3) MonthlyNthButton (repeat=monthly 일 때만)
 *
 * 내부 state: repeatCountOpen / customDigits / inputRef. repeat 종류 바뀌면 reset.
 */
interface RepeatCountControlsProps {
  /** RepeatCountField 의 anchor (첫 발화일). 매월+nth 모드면 부모가 첫 nth-weekday 로
   *  변환해 전달. */
  startDate: string;
  repeat: "weekly" | "monthly" | "yearly";
  repeatCount: number;
  setRepeatCount: (n: number) => void;
  weeklyInterval: number;
  setWeeklyInterval: (n: number) => void;
  monthlyNth: { week: number; weekday: number } | null;
  setMonthlyNth: (v: { week: number; weekday: number } | null) => void;
}

export default function RepeatCountControls({
  startDate,
  repeat,
  repeatCount,
  setRepeatCount,
  weeklyInterval,
  setWeeklyInterval,
  monthlyNth,
  setMonthlyNth,
}: RepeatCountControlsProps) {
  const [repeatCountOpen, setRepeatCountOpen] = useState(false);
  const [customDigits, setCustomDigits] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // 반복 종류 변경 시 편집 상태 초기화 — 매주→매월 전환 등에서 잔존 디지트 제거.
  useEffect(() => {
    setRepeatCountOpen(false);
    setCustomDigits("");
  }, [repeat]);

  return (
    <>
      <div className="flex flex-col gap-1.5 min-w-0">
        <Label className={FORM_LABEL}>반복 횟수</Label>
        <RepeatCountField
          startDate={startDate}
          repeat={repeat}
          repeatCount={repeatCount}
          setRepeatCount={setRepeatCount}
          customDigits={customDigits}
          setCustomDigits={setCustomDigits}
          open={repeatCountOpen}
          setOpen={setRepeatCountOpen}
          inputRef={inputRef}
          weeklyInterval={weeklyInterval}
          monthlyNth={monthlyNth}
        />
      </div>
      {repeat === "weekly" && (
        <WeeklyIntervalButton
          interval={weeklyInterval}
          onChange={setWeeklyInterval}
        />
      )}
      {repeat === "monthly" && (
        <MonthlyNthButton
          startDate={startDate}
          value={monthlyNth}
          onChange={setMonthlyNth}
        />
      )}
    </>
  );
}
