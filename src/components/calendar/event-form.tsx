"use client";

import { useState, useEffect, useRef } from "react";
import FormPage from "@/components/ui/form-page";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { X } from "lucide-react";
import TimePicker from "@/components/ui/time-picker";
import ColorPickerPanel from "@/components/ui/color-picker";
import WeatherIcon from "./weather-icon";
import DatePicker from "@/components/ui/date-picker";
import TagInput from "@/components/ui/tag-input";
import { FormField } from "@/components/ui/form-field";
import {
  FORM_LABEL,
  FORM_INPUT_PRIMARY,
  FORM_INPUT_COMPACT,
} from "@/lib/form-classes";
import type { CalendarEvent, EventTag, RepeatType } from "@/types";
import { KO_WEEKDAYS } from "@/lib/calendar/repeat-helpers";
import RepeatCountField from "./repeat-count-field";

const COLORS = [
  "#3B82F6", "#EF4444", "#22C55E", "#F59E0B",
  "#A855F7", "#EC4899", "#06B6D4", "#6B7280",
];

// 신규 이벤트 생성 시 색상을 랜덤 선택 — 매번 같은 기본값(파랑) 이 아닌
// 다양한 색상으로 이벤트를 구분하기 쉽게.
function randomEventColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function ColorPickerPopover({ color, onChange, isCustom }: { color: string; onChange: (c: string) => void; isCustom: boolean }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(color);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setPreview(color); }}>
      <PopoverTrigger
        className={`h-5 w-5 rounded-full cursor-pointer transition-all ${
          isCustom || open ? "ring-2 ring-offset-1 ring-primary scale-110" : "hover:scale-110"
        }`}
        style={{ background: open ? preview : isCustom ? color : "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)" }}
      />
      <PopoverContent className="w-[220px] p-3" align="start" side="bottom">
        <ColorPickerPanel
          color={color}
          onPreview={setPreview}
          onConfirm={(c) => { onChange(c); setOpen(false); }}
        />
      </PopoverContent>
    </Popover>
  );
}

// UI 전용 확장 타입 — DB 의 RepeatType ('weekly'/'monthly'/'yearly'/null) 에
// "infinite" 추가. 저장 시점에 weekly + count=-1 로 변환.
type UIRepeat = RepeatType | "infinite";

const REPEAT_OPTIONS: { value: UIRepeat; label: string }[] = [
  { value: "none", label: "없음" },
  { value: "infinite", label: "계속" },
  { value: "weekly", label: "매주" },
  { value: "monthly", label: "매월" },
  { value: "yearly", label: "매년" },
];

/** 매주 N주마다 인라인 토글 — "종료 설정" 패턴.
 *  interval=1 일 땐 "+ 격주" 점선 버튼, 누르면 그 자리에서 [숫자 input] 주마다 로 변환.
 *  X 로 매주(interval=1) 로 복귀. */
function WeeklyIntervalButton({
  interval,
  onChange,
}: {
  interval: number;
  onChange: (n: number) => void;
}) {
  const isActive = interval > 1;
  if (!isActive) {
    return (
      <button
        type="button"
        onClick={() => onChange(2)}
        className={`${FORM_INPUT_COMPACT} shrink-0 rounded-md border border-dashed text-muted-foreground hover:border-foreground hover:text-foreground transition-colors px-2 whitespace-nowrap`}
      >
        + 격주
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1 shrink-0">
      <input
        type="text"
        inputMode="numeric"
        value={interval}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
          if (digits === "") return;
          const n = parseInt(digits, 10);
          if (n >= 2) onChange(n);
        }}
        className={`${FORM_INPUT_COMPACT} w-12 rounded-lg border border-input bg-transparent px-2 text-center tabular-nums outline-none focus:border-ring transition-colors dark:bg-input/30`}
      />
      <span className="text-xs text-muted-foreground">주마다</span>
      <button
        type="button"
        onClick={() => onChange(1)}
        className="text-muted-foreground hover:text-foreground p-0.5 shrink-0"
        aria-label="격주 해제"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** 매월 N주차 W요일 인라인 토글 — "종료 설정" 패턴.
 *  null 일 땐 "+ N주차" 점선 버튼, 누르면 그 자리에서 두 개의 Select(주·요일) 로 변환.
 *  X 로 같은 일자 모드(null) 로 복귀. 초기 추천값은 시작일의 실제 N주차·요일. */
function MonthlyNthButton({
  startDate,
  value,
  onChange,
}: {
  startDate: string;
  value: { week: number; weekday: number } | null;
  onChange: (v: { week: number; weekday: number } | null) => void;
}) {
  const startInfo = (() => {
    if (!startDate) return null;
    const d = new Date(startDate + "T00:00:00");
    if (Number.isNaN(d.getTime())) return null;
    return { week: Math.ceil(d.getDate() / 7), weekday: d.getDay() };
  })();

  if (!value) {
    return (
      <button
        type="button"
        onClick={() =>
          onChange({
            week: startInfo?.week ?? 1,
            weekday: startInfo?.weekday ?? 1,
          })
        }
        className={`${FORM_INPUT_COMPACT} shrink-0 rounded-md border border-dashed text-muted-foreground hover:border-foreground hover:text-foreground transition-colors px-2 whitespace-nowrap`}
      >
        + N주차
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1 shrink-0">
      <Select
        value={String(value.week)}
        onValueChange={(v) => v && onChange({ ...value, week: parseInt(v, 10) })}
      >
        <SelectTrigger className={`${FORM_INPUT_COMPACT} w-fit min-w-[4.25rem]`}>
          {value.week}째주
        </SelectTrigger>
        <SelectContent className="min-w-[4.25rem]">
          {[1, 2, 3, 4, 5].map((n) => (
            <SelectItem key={n} value={String(n)}>
              {n}째주
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={String(value.weekday)}
        onValueChange={(v) =>
          v && onChange({ ...value, weekday: parseInt(v, 10) })
        }
      >
        <SelectTrigger className={`${FORM_INPUT_COMPACT} w-fit min-w-[4.25rem]`}>
          {KO_WEEKDAYS[value.weekday]}요일
        </SelectTrigger>
        <SelectContent className="min-w-[4.25rem]">
          {KO_WEEKDAYS.map((w, i) => (
            <SelectItem key={i} value={String(i)}>
              {w}요일
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button
        type="button"
        onClick={() => onChange(null)}
        className="text-muted-foreground hover:text-foreground p-0.5 shrink-0"
        aria-label="N주차 해제"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

interface EventFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: CalendarEvent | null;
  defaultDate?: string;
  tags: EventTag[];
  onAddTag?: (name: string, color: string) => Promise<{ error: unknown }>;
  onDeleteTag?: (id: string) => Promise<{ error: unknown }>;
  onUpdateTagColor?: (id: string, color: string) => Promise<{ error: unknown }>;
  onRenameTag?: (id: string, name: string) => Promise<{ error: unknown }>;
  weatherMap?: Record<string, import("@/types").WeatherData>;
  onSave: (
    data: Omit<CalendarEvent, "id" | "created_at">,
    repeatCount?: number,
    repeatOpts?: {
      weeklyInterval?: number;
      monthlyNth?: { week: number; weekday: number } | null;
    },
  ) => Promise<{ error: unknown }>;
  onBack?: () => void;
}

export default function EventForm({
  open,
  onOpenChange,
  event,
  defaultDate,
  tags,
  onAddTag,
  onDeleteTag,
  onUpdateTagColor,
  onRenameTag,
  weatherMap,
  onSave,
  onBack,
}: EventFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [color, setColor] = useState(() => randomEventColor());
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [repeat, setRepeat] = useState<UIRepeat>("none");
  const [repeatCount, setRepeatCount] = useState(-1);
  // 매주 N주마다 — 1=매주(default), 2=격주, 3·4=3·4주마다.
  const [weeklyInterval, setWeeklyInterval] = useState(1);
  // 매월 N주차 W요일 — null=같은 일자(default).
  const [monthlyNth, setMonthlyNth] = useState<{ week: number; weekday: number } | null>(null);
  // 반복 횟수 커스텀 드롭다운 상태 — 빌트인 Select 대신 Popover 기반.
  // 직접 입력 input 이 popover 내부에 있어야 + 8자리 즉시 커밋 + 동일값 재클릭
  // 가능하게 하려면 Select 의 제약을 벗어나야 함.
  const [repeatCountOpen, setRepeatCountOpen] = useState(false);
  const [customDigits, setCustomDigits] = useState("");
  // 직접 입력 input ref — popover 열릴 때 자동 포커스용.
  const customInputRef = useRef<HTMLInputElement>(null);
  const [showEndDate, setShowEndDate] = useState(false);
  const [showEndTime, setShowEndTime] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sharedWith, setSharedWith] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    if (event) {
      setTitle(event.title);
      setDescription(event.description || "");
      setStartDate(event.start_date);
      setEndDate(event.end_date || "");
      setStartTime(event.start_time ? event.start_time.slice(0, 5) : "");
      setEndTime(event.end_time ? event.end_time.slice(0, 5) : "");
      setColor(event.color);
      setSelectedTags(event.tag ? event.tag.split(",") : []);
      setRepeat(((event.repeat as RepeatType) || "none") as UIRepeat);
      setRepeatCount(-1);

      setShowEndDate(!!event.end_date);
      setShowEndTime(!!event.end_time);
      setSharedWith(
        (event as unknown as { shared_with?: string[] | null }).shared_with ||
          []
      );
    } else {
      resetForm();
      setSharedWith([]);
    }
  }, [event, defaultDate, open]);

  function resetForm() {
    setTitle("");
    setDescription("");
    setStartDate(defaultDate || new Date().toISOString().split("T")[0]);
    setEndDate("");
    setStartTime("");
    setEndTime("");
    setColor(randomEventColor());
    setSelectedTags([]);
    setRepeat("none");
    setRepeatCount(-1);
    setShowEndDate(false);
    setShowEndTime(false);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startDate) return;

    setSaving(true);
    // UI "infinite" → DB 는 weekly + count=-1 로 매핑. 사용자에겐 "계속" 의미만 보임.
    // repeatCount = 사용자가 본 "추가 반복 횟수" (1 = 이번 + 1번 더 = 총 2번).
    // handleSave 는 총 개수 기준이므로 +1 변환. -1(무한) 은 그대로.
    const dbRepeat: RepeatType | null =
      repeat === "none" ? null : repeat === "infinite" ? "weekly" : repeat;
    const effectiveCount = repeat === "infinite" ? -1 : repeatCount;
    const rc =
      dbRepeat !== null && !event
        ? effectiveCount === -1
          ? -1
          : effectiveCount + 1
        : undefined;
    const { error } = await onSave(
      {
        title: title.trim(),
        description: description.trim() || null,
        start_date: startDate,
        end_date: endDate || null,
        start_time: startTime || null,
        end_time: endTime || null,
        color,
        tag: selectedTags.length > 0 ? selectedTags.join(",") : null,
        repeat: dbRepeat,
        ...(sharedWith.length > 0 ? { shared_with: sharedWith } : {}),
      } as Omit<CalendarEvent, "id" | "created_at">,
      rc,
      // 매주 N주마다 / 매월 N주차 W요일 옵션 — buildRepeatEvents 가 사용.
      dbRepeat === "weekly"
        ? { weeklyInterval }
        : dbRepeat === "monthly"
          ? { monthlyNth }
          : undefined,
    );
    setSaving(false);
    if (!error) {
      onOpenChange(false);
    }
  };

  return (
    <FormPage
      open={open}
      onOpenChange={onOpenChange}
      title={event ? "일정 수정" : "새 일정"}
      headerExtra={
        weatherMap && startDate && weatherMap[startDate] ? (
          <WeatherIcon weather={weatherMap[startDate]} showRange />
        ) : null
      }
      onBack={
        onBack && event
          ? () => { onOpenChange(false); onBack(); }
          : undefined
      }
      submitDisabled={!title.trim() || !startDate}
      saving={saving}
      onSubmit={() => {
        void handleSubmit({ preventDefault: () => {} } as React.FormEvent);
      }}
    >
        <div className="flex flex-col gap-4">
          {/* 제목 */}
          <FormField label="제목" required htmlFor="event-title">
            <Input
              id="event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="일정 제목"
              className={FORM_INPUT_PRIMARY}
            />
          </FormField>

          {/* 색상 */}
          <div className="flex flex-col gap-1.5">
            <Label className={FORM_LABEL}>색상</Label>
            <div className="flex items-center gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`h-5 w-5 rounded-full transition-all ${
                    color === c ? "ring-2 ring-offset-1 ring-primary scale-110" : "hover:scale-110"
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
              {/* 커스텀 컬러피커 */}
              <ColorPickerPopover color={color} onChange={setColor} isCustom={!COLORS.includes(color)} />
            </div>
          </div>

          {/* 날짜 */}
          <div className="flex flex-col gap-1.5">
            <Label className={FORM_LABEL}>날짜</Label>
            <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-1 min-w-0">
              <DatePicker value={startDate} onChange={setStartDate} className={`${FORM_INPUT_COMPACT} min-w-0`} />
              <span className="text-xs text-muted-foreground">~</span>
              {showEndDate ? (
                <DatePicker value={endDate} onChange={setEndDate} min={startDate} className={`${FORM_INPUT_COMPACT} min-w-0`} />
              ) : (
                <button type="button" className={`${FORM_INPUT_COMPACT} min-w-0 rounded-md border border-dashed text-muted-foreground hover:border-foreground hover:text-foreground transition-colors px-1`} onClick={() => setShowEndDate(true)}>
                  종료 설정
                </button>
              )}
              {showEndDate ? (
                <button type="button" className="text-muted-foreground hover:text-foreground shrink-0 p-0.5" onClick={() => { setShowEndDate(false); setEndDate(""); }}>
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <span className="w-4" />
              )}
            </div>
          </div>

          {/* 시간 */}
          <div className="flex flex-col gap-1.5">
            <Label className={FORM_LABEL}>시간</Label>
            <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-1 min-w-0">
              <TimePicker value={startTime} onChange={setStartTime} className={`${FORM_INPUT_COMPACT} min-w-0`} />
              <span className="text-xs text-muted-foreground">~</span>
              {showEndTime ? (
                <TimePicker value={endTime} onChange={setEndTime} className={`${FORM_INPUT_COMPACT} min-w-0`} />
              ) : (
                <button type="button" className={`${FORM_INPUT_COMPACT} min-w-0 rounded-md border border-dashed text-muted-foreground hover:border-foreground hover:text-foreground transition-colors px-1`} onClick={() => setShowEndTime(true)}>
                  종료 설정
                </button>
              )}
              {showEndTime ? (
                <button type="button" className="text-muted-foreground hover:text-foreground shrink-0 p-0.5" onClick={() => { setShowEndTime(false); setEndTime(""); }}>
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <span className="w-4" />
              )}
            </div>
          </div>


          {/* 반복 / 반복 횟수 — 두 컬럼 모두 컨텐츠 크기에 맞춤 (잉여 공간 없음). */}
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex flex-col gap-1.5">
              <Label className={FORM_LABEL}>반복</Label>
              <Select value={repeat} onValueChange={(v) => {
                if (v) {
                  setRepeat(v as UIRepeat);
                  // 반복 타입 변경 시 직접 입력 popover 닫힘 + customDigits 초기화.
                  // "infinite" 선택 시 repeatCount 도 -1 로 강제 (UI 의도 명시).
                  setRepeatCountOpen(false);
                  setCustomDigits("");
                  if (v === "infinite") setRepeatCount(-1);
                }
              }}>
                <SelectTrigger className={`${FORM_INPUT_COMPACT} w-fit min-w-[4.5rem]`}>
                  {REPEAT_OPTIONS.find((o) => o.value === repeat)?.label || "없음"}
                </SelectTrigger>
                <SelectContent className="min-w-[5rem]">
                  {REPEAT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* "infinite"(계속) / "none"(없음) 일 땐 반복 횟수 컬럼 숨김 — 의미 없음. */}
            {repeat !== "none" && repeat !== "infinite" && (
              <div className="flex flex-col gap-1.5 min-w-0">
                <Label className={FORM_LABEL}>반복 횟수</Label>
                <div className="flex items-center gap-1.5">
                  <RepeatCountField
                    startDate={startDate}
                    repeat={repeat}
                    repeatCount={repeatCount}
                    setRepeatCount={setRepeatCount}
                    customDigits={customDigits}
                    setCustomDigits={setCustomDigits}
                    open={repeatCountOpen}
                    setOpen={setRepeatCountOpen}
                    inputRef={customInputRef}
                    weeklyInterval={weeklyInterval}
                    monthlyNth={monthlyNth}
                  />
                  {/* 매주 — 격주/3주/4주 토글 (입력 박스 우측). */}
                  {repeat === "weekly" && (
                    <WeeklyIntervalButton
                      interval={weeklyInterval}
                      onChange={setWeeklyInterval}
                    />
                  )}
                  {/* 매월 — N주차 W요일 토글. */}
                  {repeat === "monthly" && (
                    <MonthlyNthButton
                      startDate={startDate}
                      value={monthlyNth}
                      onChange={setMonthlyNth}
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 태그 */}
          <div className="flex flex-col gap-1.5">
            <Label className={FORM_LABEL}>태그</Label>
            <TagInput
              selectedTags={selectedTags}
              allTags={tags}
              onChange={setSelectedTags}
              onAddTag={onAddTag}
              onDeleteTag={onDeleteTag}
              onUpdateTagColor={onUpdateTagColor}
              onRenameTag={onRenameTag}
              orderKey="tag-order:event-tags"
            />
          </div>


          {/* 메모 */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-desc" className={FORM_LABEL}>메모</Label>
            <Textarea
              id="event-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="세부 내용 (선택)"
              rows={3}
            />
          </div>

        </div>
    </FormPage>
  );
}
