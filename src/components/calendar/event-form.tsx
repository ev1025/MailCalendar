"use client";

import { useState, useEffect, useRef } from "react";
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

/**
 * 반복 횟수 입력 컴포넌트 — 여행 페이지의 위치 검색 박스 패턴.
 *
 * UX:
 *  - 입력 박스 자체가 트리거. 포커스 시 아래 드롭다운 자동 등장.
 *  - 8자리 숫자 입력 → "YYYY-MM-DD" 자동 포맷 → 완성 시 즉시 repeatCount 커밋.
 *  - 드롭다운 항목 클릭 → 그 날짜를 input 에 채움 + 드롭다운 닫힘.
 *  - 다시 input 클릭 → 직전에 선택했던 회차가 드롭다운 최상단에 위치하도록 scroll.
 *  - "계속" 옵션은 input 비움 + 닫힘.
 */
function RepeatCountField({
  startDate,
  repeat,
  repeatCount,
  setRepeatCount,
  customDigits,
  setCustomDigits,
  open,
  setOpen,
  inputRef,
}: {
  startDate: string;
  repeat: RepeatType;
  repeatCount: number;
  setRepeatCount: (n: number) => void;
  customDigits: string;
  setCustomDigits: (s: string) => void;
  open: boolean;
  setOpen: (o: boolean) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  // 항목 탭 vs 스크롤 구분 — touchstart 에서 y 기록, touchmove 시 8px 초과면
  // cancel. touchend 에서 cancel 안 됐으면 액션 발화.
  const tapStartRef = useRef<{ y: number; cancelled: boolean } | null>(null);
  // touchend → 합성 mousedown 이중 발화 방지.
  const lastTapRef = useRef(0);

  // input 표시값.
  const displayValue = (() => {
    if (customDigits.length > 0) return formatDigitsAsDate(customDigits);
    if (repeatCount > 0 && startDate) {
      const end = formatRepeatEnd(startDate, repeat, repeatCount);
      return end.replace(/\./g, "-").replace(/\([^)]*\)/, "").trim();
    }
    return "";
  })();

  // 드롭다운 열릴 때 — 현재 선택된 회차가 첫 visible 행이 되도록 scroll.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const target = repeatCount > 0
      ? listRef.current.querySelector<HTMLElement>(`[data-count="${repeatCount}"]`)
      : listRef.current.querySelector<HTMLElement>(`[data-count="-1"]`);
    if (target) target.scrollIntoView({ block: "start" });
  }, [open, repeatCount]);

  const handleSelectCount = (n: number) => {
    const now = performance.now();
    if (now - lastTapRef.current < 350) return; // 이중 발화 방지
    lastTapRef.current = now;
    setRepeatCount(n);
    if (n > 0 && startDate) {
      const end = formatRepeatEnd(startDate, repeat, n);
      setCustomDigits(end.replace(/\D/g, "").slice(0, 8));
    } else {
      setCustomDigits("");
    }
    setOpen(false);
  };

  // 항목 버튼용 핸들러 묶음 — 스크롤 시 선택되지 않게.
  const itemHandlers = (n: number) => ({
    onTouchStart: (e: React.TouchEvent) => {
      tapStartRef.current = { y: e.touches[0].clientY, cancelled: false };
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (tapStartRef.current && Math.abs(e.touches[0].clientY - tapStartRef.current.y) > 8) {
        tapStartRef.current.cancelled = true;
      }
    },
    onTouchEnd: () => {
      const valid = tapStartRef.current && !tapStartRef.current.cancelled;
      tapStartRef.current = null;
      if (valid) handleSelectCount(n);
    },
    onMouseDown: (e: React.MouseEvent) => {
      e.preventDefault(); // input blur 차단 (desktop)
      handleSelectCount(n);
    },
  });

  return (
    <div className="relative w-fit">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
          setCustomDigits(digits);
          if (digits.length === 8) {
            const parsed = parseDigitsToDate(digits);
            if (parsed && startDate) {
              const count = computeCountFromEnd(startDate, repeat, parsed);
              setRepeatCount(count);
              setOpen(false);
            }
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          // Backspace 를 명시 처리 — 포맷팅된 dash 때문에 onChange 만으로는
          // 1 keystroke 에 2 char 가 사라지는 것처럼 보이는 문제 회피.
          // 커서가 끝에 있고 selection 없으면 raw digit 1개만 제거.
          if (e.key === "Backspace") {
            const el = e.currentTarget;
            if (
              el.selectionStart === el.value.length &&
              el.selectionEnd === el.value.length &&
              customDigits.length > 0
            ) {
              e.preventDefault();
              setCustomDigits(customDigits.slice(0, -1));
            }
          }
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // 드롭다운 항목 mousedown/touchend 가 먼저 처리되도록 지연.
          setTimeout(() => setOpen(false), 200);
        }}
        placeholder="직접 입력"
        className={`${FORM_INPUT_COMPACT} h-9 w-44 rounded-lg border border-input bg-transparent px-2.5 tabular-nums outline-none focus:border-ring transition-colors dark:bg-input/30`}
      />
      {open && (
        <div
          ref={listRef}
          className="absolute left-0 top-full mt-1 z-30 w-44 max-h-[7.5rem] overflow-y-auto rounded-lg border bg-popover shadow-lg overscroll-contain"
        >
          <button
            type="button"
            data-count="-1"
            {...itemHandlers(-1)}
            className={`w-full text-left px-3 py-1.5 text-xs whitespace-nowrap hover:bg-accent transition-colors ${
              repeatCount === -1 ? "bg-accent font-medium" : ""
            }`}
          >
            계속
          </button>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
            <button
              key={i}
              type="button"
              data-count={i}
              {...itemHandlers(i)}
              className={`w-full text-left px-3 py-1.5 text-xs whitespace-nowrap hover:bg-accent transition-colors tabular-nums ${
                repeatCount === i ? "bg-accent font-medium" : ""
              }`}
            >
              {i}회{startDate ? ` - ${formatRepeatEnd(startDate, repeat, i)}` : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
                  // 반복 타입 변경 시 직접 입력 popover 도 닫힘 + customDigits 초기화.
                  setRepeatCountOpen(false);
                  setCustomDigits("");
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
                {/* 입력 박스 자체가 트리거 — 여행 페이지 위치 검색과 동일 패턴.
                    포커스 시 드롭다운 등장. 입력값 8자리 완성 시 즉시 커밋.
                    리스트에서 항목 선택해도 input 에 그 날짜 유지 → 다시 열면
                    선택한 항목이 상단에 보이도록 scroll. */}
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
                />
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
