"use client";

import { useState, useEffect } from "react";
import FormPage from "@/components/ui/form-page";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  FORM_TEXTAREA,
} from "@/lib/form-classes";
import type { CalendarEvent, EventTag, RepeatType } from "@/types";

const COLORS = [
  "#3B82F6", "#EF4444", "#22C55E", "#F59E0B",
  "#A855F7", "#EC4899", "#06B6D4", "#6B7280",
];

// 신규 이벤트 생성 시 색상을 랜덤 선택 — 매번 같은 기본값(파랑) 이 아닌
// 다양한 색상으로 이벤트를 구분하기 쉽게.
function randomEventColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

const TAG_PALETTE = [
  "#EF4444", "#F97316", "#F59E0B", "#EAB308", "#84CC16",
  "#22C55E", "#10B981", "#14B8A6", "#06B6D4", "#0EA5E9",
  "#3B82F6", "#6366F1", "#8B5CF6", "#A855F7", "#D946EF", "#EC4899",
];

function randomTagColor(): string {
  return TAG_PALETTE[Math.floor(Math.random() * TAG_PALETTE.length)];
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

const REPEAT_OPTIONS: { value: RepeatType; label: string }[] = [
  { value: "none", label: "없음" },
  { value: "weekly", label: "매주" },
  { value: "monthly", label: "매월" },
  { value: "yearly", label: "매년" },
];

const KO_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 반복 일정 마지막 발화일 — start + (count × 주기). count=1 → 다음 1회가 마지막. */
function formatRepeatEnd(startDate: string, repeat: RepeatType, count: number): string {
  if (!startDate || repeat === "none" || count <= 0) return "";
  const d = new Date(startDate + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  if (repeat === "weekly") d.setDate(d.getDate() + 7 * count);
  else if (repeat === "monthly") d.setMonth(d.getMonth() + count);
  else if (repeat === "yearly") d.setFullYear(d.getFullYear() + count);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}(${KO_WEEKDAYS[d.getDay()]})`;
}

/** 8자리 숫자 → "YYYY-MM-DD" 부분 포맷. 4자리부터 "-" 자동 삽입. */
function formatDigitsAsDate(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
}

/** 8자리 (YYYYMMDD) → Date | null. 잘못된 날짜 (예: 13월) 거부. */
function parseDigitsToDate(digits: string): Date | null {
  if (!/^\d{8}$/.test(digits)) return null;
  const y = parseInt(digits.slice(0, 4), 10);
  const m = parseInt(digits.slice(4, 6), 10);
  const dd = parseInt(digits.slice(6, 8), 10);
  if (m < 1 || m > 12 || dd < 1 || dd > 31) return null;
  const date = new Date(y, m - 1, dd);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== dd) return null;
  return date;
}

/** 시작일·반복 타입·종료일 → 반복 횟수. 사이클에 안 맞으면 floor. */
function computeCountFromEnd(startDate: string, repeat: RepeatType, endDate: Date): number {
  if (!startDate || repeat === "none") return 1;
  const start = new Date(startDate + "T00:00:00");
  if (Number.isNaN(start.getTime()) || endDate <= start) return 1;
  if (repeat === "weekly") {
    const days = Math.round((endDate.getTime() - start.getTime()) / 86400000);
    return Math.max(1, Math.floor(days / 7));
  }
  if (repeat === "monthly") {
    return Math.max(
      1,
      (endDate.getFullYear() - start.getFullYear()) * 12 + (endDate.getMonth() - start.getMonth()),
    );
  }
  if (repeat === "yearly") {
    return Math.max(1, endDate.getFullYear() - start.getFullYear());
  }
  return 1;
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
  onSave: (data: Omit<CalendarEvent, "id" | "created_at">, repeatCount?: number) => Promise<{ error: unknown }>;
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
  const [repeat, setRepeat] = useState<RepeatType>("none");
  const [repeatCount, setRepeatCount] = useState(-1);
  // 직접 입력 모드 — 사용자가 8자리 숫자로 종료일 직접 입력 시. 계산된 count 가
  // repeatCount 에 기록되고 모드는 자동 해제. 입력 중에는 customDigits 가 visual.
  const [customDateMode, setCustomDateMode] = useState(false);
  const [customDigits, setCustomDigits] = useState("");
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
      setRepeat((event.repeat as RepeatType) || "none");
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
    // repeatCount = 사용자가 본 "추가 반복 횟수" (1 = 이번 + 1번 더 = 총 2번).
    // handleSave 는 총 개수 기준이므로 +1 변환. -1(무한) 은 그대로.
    const rc =
      repeat !== "none" && !event
        ? repeatCount === -1
          ? -1
          : repeatCount + 1
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
        repeat: repeat === "none" ? null : repeat,
        ...(sharedWith.length > 0 ? { shared_with: sharedWith } : {}),
      } as Omit<CalendarEvent, "id" | "created_at">,
      rc
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


          {/* 반복 / 반복 횟수 — 두 컬럼 라벨. 반복 None 일 땐 횟수 컬럼 숨김. */}
          <div className={`grid gap-2 ${repeat !== "none" ? "grid-cols-[auto_1fr]" : "grid-cols-1"}`}>
            <div className="flex flex-col gap-1.5">
              <Label className={FORM_LABEL}>반복</Label>
              <Select value={repeat} onValueChange={(v) => {
                if (v) {
                  setRepeat(v as RepeatType);
                  // 반복 타입 변경 시 직접 입력 모드 해제 (계산된 날짜가 의미 없어짐).
                  if (customDateMode) setCustomDateMode(false);
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
            {repeat !== "none" && (
              <div className="flex flex-col gap-1.5 min-w-0">
                <Label className={FORM_LABEL}>반복 횟수</Label>
                <Select
                  value={customDateMode ? "custom" : String(repeatCount)}
                  onValueChange={(v) => {
                    if (v === "custom") {
                      setCustomDateMode(true);
                      // 현재 종료일 기준값 prefill — 사용자가 미세 조정 편함.
                      const endStr = formatRepeatEnd(startDate, repeat, repeatCount > 0 ? repeatCount : 1);
                      const digits = endStr.replace(/\D/g, "").slice(0, 8);
                      setCustomDigits(digits);
                    } else if (v) {
                      setCustomDateMode(false);
                      setRepeatCount(parseInt(v, 10));
                    }
                  }}
                >
                  <SelectTrigger className={`${FORM_INPUT_COMPACT} w-full min-w-0`}>
                    <span className="truncate">
                      {customDateMode
                        ? "직접 입력"
                        : repeatCount === -1
                          ? "계속"
                          : startDate
                            ? `${repeatCount}회 - ${formatRepeatEnd(startDate, repeat, repeatCount)}`
                            : `${repeatCount}회`}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="min-w-[14rem]">
                    <SelectItem value="custom">직접 입력</SelectItem>
                    <SelectItem value="-1">계속</SelectItem>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
                      <SelectItem key={i} value={String(i)}>
                        {i}회{startDate ? ` - ${formatRepeatEnd(startDate, repeat, i)}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {customDateMode && (
                  /* 8자리 숫자 입력 — TimePicker 처럼 4/6 자리에서 "-" 자동 삽입.
                     완전 입력 (8자리) 시 onBlur 또는 Enter 로 확정. */
                  <input
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    value={formatDigitsAsDate(customDigits)}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
                      setCustomDigits(digits);
                    }}
                    onBlur={() => {
                      const parsed = parseDigitsToDate(customDigits);
                      if (parsed && startDate) {
                        const count = computeCountFromEnd(startDate, repeat, parsed);
                        setRepeatCount(count);
                        setCustomDateMode(false);
                      } else {
                        // 미완성·잘못된 입력 → 모드 해제 + 직전 값 유지.
                        setCustomDateMode(false);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        (e.currentTarget as HTMLInputElement).blur();
                      }
                      if (e.key === "Escape") {
                        setCustomDateMode(false);
                      }
                    }}
                    placeholder="YYYY-MM-DD"
                    className={`${FORM_INPUT_COMPACT} w-full min-w-0 tabular-nums`}
                  />
                )}
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
