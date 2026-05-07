"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowUp, MapPin, Plus, X as XIcon } from "lucide-react";
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
import TimePicker from "@/components/ui/time-picker";
import TagInput from "@/components/ui/tag-input";
import PlanPlacePicker from "@/components/travel/plan-place-picker";
import NaverMap from "@/components/travel/naver-map";
import { useTravelCategories, BUILTIN_TRAVEL_CATEGORIES } from "@/hooks/use-travel-categories";
import { useEventTags } from "@/hooks/use-event-tags";
import { Button } from "@/components/ui/button";
import type { TravelPlanTask, PlaceInfo, AltPlace } from "@/types";

// 일정 편집 UI — DeviceDialog 로 모바일/데스크탑 분기 자동 처리

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // 편집용 기존 task. null 이면 신규(day_index 사용)
  task: TravelPlanTask | null;
  defaultDayIndex: number;
  availableDays: number[];
  formatDayLabel: (day: number) => string;
  onAddNewDay: () => number;
  onSave: (
    updates: Partial<Omit<TravelPlanTask, "id" | "plan_id" | "created_at">>
  ) => Promise<void>;
  // 작성 세션 draft 를 구분할 키 (보통 planId). 같은 task/신규 슬롯에 대해
  // 시트 닫았다 다시 열어도 로컬에 저장된 입력 값을 복원.
  planId: string;
  /** task.start_time 이 비어있을 때 폼 입력란에 채울 fallback 시간 — 보통 체인 계산된 도착시간. */
  defaultStartTime?: string | null;
}

interface SheetDraft {
  dayIndex: number;
  startTime: string;
  stayMinutes: string;
  placeName: string;
  placeAddress: string | null;
  placeLat: number | null;
  placeLng: number | null;
  altPlaces: AltPlace[]; // 대체 위치 후보들 (1순위 = primary place_*)
  category: string;     // 분류 (단일)
  tags: string[];       // 태그 (복수) — event_tags 공용 풀
  content: string;
}

const DRAFT_PREFIX = "plan_task_draft:";

function draftKeyFor(planId: string, task: TravelPlanTask | null, defaultDayIndex: number) {
  return task
    ? `${DRAFT_PREFIX}${planId}:task:${task.id}`
    : `${DRAFT_PREFIX}${planId}:new:${defaultDayIndex}`;
}

function readDraft(key: string): SheetDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as SheetDraft;
  } catch {
    return null;
  }
}

function writeDraft(key: string, draft: SheetDraft) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(draft));
  } catch {}
}

function clearDraft(key: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {}
}

export default function PlanTaskSheet({
  open,
  onOpenChange,
  task,
  defaultDayIndex,
  availableDays,
  formatDayLabel,
  onAddNewDay,
  onSave,
  planId,
  defaultStartTime,
}: Props) {
  const draftKey = draftKeyFor(planId, task, defaultDayIndex);
  // 분류(단일) · 태그(복수) 분리. 분류 풀은 localStorage, 태그 풀은 event_tags(DB).
  const { categories, colors, addCategory, deleteCategory, updateCategoryColor, updateCategoryName } =
    useTravelCategories();
  const { tags: allEventTags, addTag: addEventTag, deleteTag: deleteEventTag, updateTagColor: updateEventTagColor } =
    useEventTags();

  // 시트 열릴 때의 초기 폼 값 — isDirty 비교용. open 트리거 useEffect 에서 갱신.
  const initialRef = useRef<SheetDraft | null>(null);

  const [dayIndex, setDayIndex] = useState(defaultDayIndex);
  const [startTime, setStartTime] = useState("");
  const [stayMinutes, setStayMinutes] = useState("");
  // 체류 입력 단위 — "min" 이면 그대로 분, "hour" 면 stayMinutes 는 시간값(0.5 step)
  const [stayUnit, setStayUnit] = useState<"min" | "hour">("min");
  const [placeName, setPlaceName] = useState("");
  const [placeAddress, setPlaceAddress] = useState<string | null>(null);
  const [placeLat, setPlaceLat] = useState<number | null>(null);
  const [placeLng, setPlaceLng] = useState<number | null>(null);
  const [placeQuery, setPlaceQuery] = useState("");
  const [editingPlace, setEditingPlace] = useState(false);
  // 대체 위치 후보들 — 1순위(primary)가 실패할 때 swap. 빈 배열이면 단일 장소.
  const [altPlaces, setAltPlaces] = useState<AltPlace[]>([]);
  // 대체 위치 추가용 picker 표시 여부 + 검색어.
  const [altPickerOpen, setAltPickerOpen] = useState(false);
  const [altQuery, setAltQuery] = useState("");
  // 분류 1개 (빈 문자열이면 미선택)
  const [category, setCategory] = useState<string>("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [content, setContent] = useState("");

  // open 될 때마다 state 초기화 — DB 값이 기준, 단 localStorage draft 가 있으면 덮어씀
  useEffect(() => {
    if (!open) return;
    if (task) {
      setDayIndex(task.day_index);
      // 폼 입력은 DB 의 stored start_time 만 채움. 자동 계산(defaultStartTime) 값은
      // 폼에 사용자 입력값처럼 보이지 않도록 의도적으로 무시 — input 비어 있으면
      // 목록에선 체인 계산값이 표시되지만 폼에 들어가는 순간 "사용자 입력값" 으로
      // 굳어버리는 문제 회피.
      const stored = task.start_time ? task.start_time.slice(0, 5) : "";
      setStartTime(stored);
      setStayMinutes(String(task.stay_minutes || ""));
      setPlaceName(task.place_name);
      setPlaceAddress(task.place_address);
      setPlaceLat(task.place_lat);
      setPlaceLng(task.place_lng);
      setAltPlaces(task.alt_places ?? []);
      // 분류: 새 category 컬럼 우선, 없으면 null. 태그: tag 컬럼 (콤마구분).
      setCategory(task.category ?? "");
      setSelectedTags(
        task.tag ? task.tag.split(",").map((s) => s.trim()).filter(Boolean) : []
      );
      setContent(task.content ?? "");
    } else {
      setDayIndex(defaultDayIndex);
      setStartTime("");
      setStayMinutes("");
      setPlaceName("");
      setPlaceAddress(null);
      setPlaceLat(null);
      setPlaceLng(null);
      setAltPlaces([]);
      setCategory("");
      setSelectedTags([]);
      setContent("");
    }
    setPlaceQuery("");
    setEditingPlace(false);
    setAltPickerOpen(false);
    setAltQuery("");
    // 작성 세션 draft 복원 (있으면)
    const d = readDraft(draftKey);
    if (d) {
      setDayIndex(d.dayIndex);
      setStartTime(d.startTime);
      setStayMinutes(d.stayMinutes);
      setPlaceName(d.placeName);
      setPlaceAddress(d.placeAddress);
      setPlaceLat(d.placeLat);
      setPlaceLng(d.placeLng);
      setAltPlaces(d.altPlaces ?? []);
      setCategory(d.category ?? "");
      setSelectedTags(d.tags ?? []);
      setContent(d.content);
    }
    // initialRef 는 task 가 있을 때 task 값, 없으면 빈 폼. draft 복원 후라도 비교 기준은
    // "이번 세션 시작 시점의 폼 값" 이라 setTimeout 으로 다음 tick 에 캡처.
    setTimeout(() => {
      initialRef.current = {
        dayIndex: task ? task.day_index : defaultDayIndex,
        startTime: task?.start_time ? task.start_time.slice(0, 5) : "",
        stayMinutes: task ? String(task.stay_minutes || "") : "",
        placeName: task?.place_name ?? "",
        placeAddress: task?.place_address ?? null,
        placeLat: task?.place_lat ?? null,
        placeLng: task?.place_lng ?? null,
        altPlaces: task?.alt_places ?? [],
        category: task?.category ?? "",
        tags: task?.tag ? task.tag.split(",").map((s) => s.trim()).filter(Boolean) : [],
        content: task?.content ?? "",
      };
    }, 0);
  }, [open, task, defaultDayIndex, draftKey]);

  // 시트 열려있는 동안 편집 내용을 500ms debounce 로 localStorage 에 저장
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      writeDraft(draftKey, {
        dayIndex,
        startTime,
        stayMinutes,
        placeName,
        placeAddress,
        placeLat,
        placeLng,
        altPlaces,
        category,
        tags: selectedTags,
        content,
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [
    open,
    draftKey,
    dayIndex,
    startTime,
    stayMinutes,
    placeName,
    placeAddress,
    placeLat,
    placeLng,
    altPlaces,
    category,
    selectedTags,
    content,
  ]);

  const handlePickPlace = (p: PlaceInfo) => {
    setPlaceName(p.name);
    setPlaceAddress(p.address);
    setPlaceLat(p.lat);
    setPlaceLng(p.lng);
    setPlaceQuery("");
    setEditingPlace(false);
  };

  const handleDayChange = (v: string | null) => {
    if (!v) return;
    if (v === "__new__") setDayIndex(onAddNewDay());
    else setDayIndex(parseInt(v));
  };

  const handleStayChange = (v: string) => {
    // 시간 모드는 소수점 허용(0.5 step 자유 입력), 분 모드는 정수만
    if (stayUnit === "hour") {
      const cleaned = v.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
      setStayMinutes(cleaned);
    } else {
      const cleaned = v.replace(/[^0-9]/g, "");
      setStayMinutes(cleaned);
    }
  };

  // 단위 토글 — 값 자동 변환 (표시값 기준)
  const toggleStayUnit = () => {
    const n = parseFloat(stayMinutes);
    if (stayUnit === "min") {
      // 분 → 시간
      setStayUnit("hour");
      if (Number.isFinite(n) && n > 0) {
        const hours = n / 60;
        setStayMinutes(hours % 1 === 0 ? String(hours) : hours.toFixed(1));
      }
    } else {
      // 시간 → 분
      setStayUnit("min");
      if (Number.isFinite(n) && n > 0) {
        setStayMinutes(String(Math.round(n * 60)));
      }
    }
  };

  const [saving, setSaving] = useState(false);

  // 명시적 저장 버튼
  const handleSave = async () => {
    if (!placeName.trim()) return;
    const mins = (() => {
      const n = parseFloat(stayMinutes);
      if (!Number.isFinite(n) || n <= 0) return 0;
      return stayUnit === "hour" ? Math.round(n * 60) : Math.floor(n);
    })();
    setSaving(true);
    try {
      await onSave({
        day_index: dayIndex,
        start_time: startTime || null,
        place_name: placeName,
        place_address: placeAddress,
        place_lat: placeLat,
        place_lng: placeLng,
        alt_places: altPlaces.length > 0 ? altPlaces : null,
        tag: selectedTags.length > 0 ? selectedTags.join(",") : null,
        category: category.trim() || null,
        content: content.trim() || null,
        stay_minutes: mins,
      });
      clearDraft(draftKey);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  // 취소 — draft 유지(다시 열면 복원). isDirty 면 toast 로 비차단 안내 +
  // "초기화" 액션을 통해 사용자가 실수로 닫았을 때 명시적으로 폐기하도록.
  const handleCancel = () => {
    const cur: SheetDraft = {
      dayIndex,
      startTime,
      stayMinutes,
      placeName,
      placeAddress,
      placeLat,
      placeLng,
      altPlaces,
      category,
      tags: selectedTags,
      content,
    };
    const init = initialRef.current;
    const isDirty = init ? JSON.stringify(cur) !== JSON.stringify(init) : false;
    if (isDirty) {
      toast("수정사항이 임시 저장됐어요. 다시 열면 이어서 작성할 수 있어요.", {
        action: {
          label: "초기화",
          onClick: () => clearDraft(draftKey),
        },
      });
    }
    onOpenChange(false);
  };

  // 폼 본문 — Sheet(모바일)·Dialog(데스크탑) 공통. 드래그 핸들은 모바일만.
  const renderForm = () => (
    <>
        <div className="flex flex-col gap-3">
          {/* 일자 · 시간 · 체류 — grid 로 라벨·입력 컬럼 정렬.
              라벨은 아래 장소/분류/태그 섹션과 동일하게 Label 컴포넌트 + 좌측정렬.
              w-fit + auto 컬럼으로 입력박스가 컨텐츠 너비에 맞게 렌더 (화면 전체 폭 X). */}
          <div className="grid grid-cols-[5.5rem_auto_auto] gap-1.5 items-center w-fit">
            {/* 라벨 행 */}
            <Label className="text-xs text-muted-foreground">일자</Label>
            <Label className="text-xs text-muted-foreground">시간</Label>
            <Label className="text-xs text-muted-foreground">체류시간</Label>
            {/* 입력 행 */}
            <Select value={String(dayIndex)} onValueChange={handleDayChange}>
              <SelectTrigger className="h-8 text-xs w-[5.5rem] px-2">
                {formatDayLabel(dayIndex)}
              </SelectTrigger>
              <SelectContent className="w-[5.5rem] min-w-[5.5rem]">
                {availableDays.map((d) => (
                  <SelectItem key={d} value={String(d)} hideIndicator className="text-xs">
                    {formatDayLabel(d)}
                  </SelectItem>
                ))}
                <SelectItem value="__new__" hideIndicator className="text-xs text-neutral-600">
                  + 새 일자
                </SelectItem>
              </SelectContent>
            </Select>

            <TimePicker
              value={startTime}
              onChange={setStartTime}
              className="h-8 text-xs px-2 w-[4.5rem]"
            />

            {/* 체류시간: 분/시간 토글 + 입력 */}
            <div className="flex items-center h-8 rounded-md border bg-transparent overflow-hidden">
              <Input
                type="text"
                inputMode={stayUnit === "hour" ? "decimal" : "numeric"}
                value={stayMinutes}
                onChange={(e) => handleStayChange(e.target.value)}
                placeholder={stayUnit === "hour" ? "시간" : "분"}
                className="h-full text-xs w-12 border-0 rounded-none focus-visible:ring-0 px-2 placeholder:text-[10px]"
              />
              <button
                type="button"
                onClick={toggleStayUnit}
                className="h-full px-2 text-xs font-medium border-l bg-muted/50 hover:bg-muted text-muted-foreground"
                title="분/시간 단위 전환"
              >
                {stayUnit === "hour" ? "시간" : "분"}
              </button>
            </div>
          </div>

          {/* 장소 — 선택된 값이 있으면 카드(탭 시 검색창으로 전환, 기존 이름을
              쿼리로 주입). 검색창 포커스 잃으면 기존 값 유지하며 카드 복귀. */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">장소</Label>
            {placeName && placeLat != null && !editingPlace ? (
              <button
                type="button"
                onClick={() => {
                  setPlaceQuery(placeName);
                  setEditingPlace(true);
                }}
                className="flex items-start gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-left hover:bg-muted/50 transition-colors"
              >
                <MapPin className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{placeName}</div>
                  {placeAddress && (
                    <div className="text-xs text-muted-foreground truncate">{placeAddress}</div>
                  )}
                </div>
              </button>
            ) : (
              <PlanPlacePicker
                value={placeQuery}
                onChange={setPlaceQuery}
                onPick={handlePickPlace}
                onBlur={() => {
                  // 결과 선택 없이 외부로 포커스 이동 → 기존 값 유지한 채 카드 복귀
                  if (editingPlace) {
                    setEditingPlace(false);
                    setPlaceQuery("");
                  }
                }}
                autoFocus={editingPlace}
                placeholder="장소명·지역 (예: 성산일출봉)"
              />
            )}

            {/* 선택된 장소의 지도 — travel-form 과 동일 NaverMap 재사용.
                NaverMap 자체가 모바일 두손가락 핀치줌 / 데스크탑 Alt+휠 줌 지원. */}
            {placeName && placeLat != null && placeLng != null && !editingPlace && (
              <div onClick={(e) => e.stopPropagation()}>
                <NaverMap lat={placeLat} lng={placeLng} height={200} zoom={16} />
              </div>
            )}
          </div>

          {/* 대체 위치 — 1순위(위 장소)가 실패할 때 swap 할 후보들.
              picker 로 추가 / 각 후보 옆 ↑ 버튼으로 1순위와 swap / × 로 제거. */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                대체 위치 {altPlaces.length > 0 && `(${altPlaces.length})`}
              </Label>
              {altPlaces.length === 0 && !altPickerOpen && (
                <button
                  type="button"
                  onClick={() => {
                    setAltPickerOpen(true);
                    setAltQuery("");
                  }}
                  className="text-[11px] text-info hover:underline disabled:opacity-50"
                  disabled={!placeName.trim() || placeLat == null}
                  title={!placeName.trim() ? "1순위 장소를 먼저 선택하세요" : undefined}
                >
                  + 추가
                </button>
              )}
            </div>

            {/* 저장된 대체 후보 카드 */}
            {altPlaces.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {altPlaces.map((alt, i) => (
                  <li
                    key={`${alt.name}-${i}`}
                    className="flex items-center gap-2 rounded-md border bg-muted/30 pl-2 pr-1 py-1.5"
                  >
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{alt.name}</div>
                      {alt.address && (
                        <div className="text-xs text-muted-foreground truncate">{alt.address}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-label={`${alt.name} 1순위로 변경`}
                      title="1순위로 변경"
                      onClick={() => {
                        // primary 와 alt[i] swap
                        const oldPrimary: AltPlace = {
                          name: placeName,
                          address: placeAddress,
                          lat: placeLat,
                          lng: placeLng,
                        };
                        setPlaceName(alt.name);
                        setPlaceAddress(alt.address);
                        setPlaceLat(alt.lat);
                        setPlaceLng(alt.lng);
                        setAltPlaces((prev) => {
                          const next = [...prev];
                          next[i] = oldPrimary;
                          return next;
                        });
                      }}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`${alt.name} 제거`}
                      onClick={() =>
                        setAltPlaces((prev) => prev.filter((_, j) => j !== i))
                      }
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* picker — 토글로 노출. 추가 후 자동 닫힘. */}
            {altPickerOpen ? (
              <PlanPlacePicker
                value={altQuery}
                onChange={setAltQuery}
                onPick={(p) => {
                  setAltPlaces((prev) => [
                    ...prev,
                    { name: p.name, address: p.address, lat: p.lat, lng: p.lng },
                  ]);
                  setAltPickerOpen(false);
                  setAltQuery("");
                }}
                onBlur={() => {
                  setAltPickerOpen(false);
                  setAltQuery("");
                }}
                autoFocus
                placeholder="대체 장소 검색"
              />
            ) : (
              altPlaces.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAltPickerOpen(true);
                    setAltQuery("");
                  }}
                  className="self-start h-8 text-xs"
                  disabled={!placeName.trim() || placeLat == null}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  대체 위치 추가
                </Button>
              )
            )}
          </div>

          {/* 분류 · 태그 영역에 mousedown 시 장소 검색 자동 닫기
              → 드롭다운이 동시에 두 개 뜨는 산만함 방지 */}
          <div
            className="flex flex-col gap-3"
            onMouseDownCapture={() => {
              if (editingPlace) {
                setEditingPlace(false);
                setPlaceQuery("");
              }
            }}
          >
            {/* 분류 — 여행 폼과 동일한 풀. 단일 선택. */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">분류</Label>
              <TagInput
                selectedTags={category ? [category] : []}
                allTags={categories.map((c) => ({ id: c, name: c, color: colors[c] || "#6B7280" }))}
                onChange={(next) => {
                  const picked = next.find((t) => t !== category);
                  if (picked) setCategory(picked);
                  else if (next.length === 0) setCategory("");
                }}
                onAddTag={addCategory}
                onDeleteTag={deleteCategory}
                onUpdateTagColor={updateCategoryColor}
                onRenameTag={updateCategoryName}
                builtinIds={BUILTIN_TRAVEL_CATEGORIES}
                orderKey="tag-order:travel-categories"
                placeholder="검색·추가"
              />
            </div>

            {/* 태그 — 캘린더·여행 폼과 공용 이벤트 태그 풀 */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">태그</Label>
              <TagInput
                selectedTags={selectedTags}
                allTags={allEventTags}
                onChange={setSelectedTags}
                onAddTag={addEventTag}
                onDeleteTag={deleteEventTag}
                onUpdateTagColor={updateEventTagColor}
                orderKey="tag-order:event-tags"
              />
            </div>
          </div>

          {/* 메모 */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">메모</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="세부 내용 (예: 일출 보기)"
              rows={2}
              className="min-h-16 leading-snug"
            />
          </div>

        </div>
    </>
  );

  const title = task ? "일정 수정" : "새 일정";

  return (
    <FormPage
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      desktopMaxWidth="md:!max-w-xl"
      onCancel={handleCancel}
      submitDisabled={!placeName.trim()}
      saving={saving}
      onSubmit={handleSave}
    >
      {renderForm()}
    </FormPage>
  );
}
