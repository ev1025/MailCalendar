"use client";

import type { TaskLeg } from "@/lib/travel/legs";

// 경로맵 상단 배타 세그먼트: [전체] [일자별] [경로별] + 선택 시 옆에 드롭다운.
// 세그먼트 컨트롤은 앱 다른 토글(테마 picker · 설정 탭 · 프로필 모드)과 같은 시각 언어로 통일.

export type Segment =
  | { mode: "all" }
  | { mode: "day"; dayIndex: number }
  | { mode: "leg"; legIndex: number };

interface Props {
  segment: Segment;
  onChange: (s: Segment) => void;
  days: number[];        // 존재하는 day_index 목록
  legs: TaskLeg[];       // 좌표 있는 leg만 소비자 쪽에서 필터해서 전달
}

const SELECT_CLASS =
  "h-8 rounded-md border bg-background px-2 text-xs text-foreground transition-colors hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-ring/40";

export default function PlanSegmentTabs({ segment, onChange, days, legs }: Props) {
  const activeMode = segment.mode;

  const tabs = [
    { mode: "all" as const, label: "전체", disabled: false, onClick: () => onChange({ mode: "all" }) },
    {
      mode: "day" as const,
      label: "일자별",
      disabled: days.length === 0,
      onClick: () => onChange({ mode: "day", dayIndex: days[0] ?? 0 }),
    },
    {
      mode: "leg" as const,
      label: "경로별",
      disabled: legs.length === 0,
      onClick: () => onChange({ mode: "leg", legIndex: 0 }),
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-full border bg-muted/40 p-0.5 text-xs">
        {tabs.map(({ mode, label, disabled, onClick }) => {
          const active = activeMode === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={onClick}
              disabled={disabled}
              className={`rounded-full px-3 py-1.5 font-medium transition-colors disabled:opacity-40 ${
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {activeMode === "day" && days.length > 0 && (
        <select
          value={segment.mode === "day" ? segment.dayIndex : 0}
          onChange={(e) => onChange({ mode: "day", dayIndex: parseInt(e.target.value) })}
          className={SELECT_CLASS}
          aria-label="일자 선택"
        >
          {days.map((d) => (
            <option key={d} value={d}>{d + 1}일차</option>
          ))}
        </select>
      )}

      {activeMode === "leg" && legs.length > 0 && (
        <select
          value={segment.mode === "leg" ? segment.legIndex : 0}
          onChange={(e) => onChange({ mode: "leg", legIndex: parseInt(e.target.value) })}
          className={`${SELECT_CLASS} max-w-[220px]`}
          aria-label="경로 선택"
        >
          {legs.map((l, i) => (
            <option key={`${l.fromTaskId}-${l.toTaskId}`} value={i}>
              {i + 1}. {l.fromTask.place_name} → {l.toTask.place_name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
