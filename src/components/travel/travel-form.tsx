"use client";

import { useState, useEffect } from "react";
import FormPage from "@/components/ui/form-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FormField } from "@/components/ui/form-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import TagInput from "@/components/ui/tag-input";
import ColorPickerRow from "@/components/ui/color-picker-popover";
import NaverMap from "@/components/travel/naver-map";
import { X, MapPin, Search as SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { translateError } from "@/lib/api-errors";
import { useTravelCategories, BUILTIN_TRAVEL_CATEGORIES } from "@/hooks/use-travel-categories";
import { useFormDraft } from "@/hooks/use-form-draft";
import type { TravelItem, TravelCategory, TravelTag, EventTag, PlaceInfo } from "@/types";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// 신규 항목 생성 시 기본 색상 랜덤 — 매번 같은 파랑 대신 다양한 색으로 구분 용이.
const DEFAULT_COLORS = [
  "#3B82F6", "#EF4444", "#22C55E", "#F59E0B",
  "#A855F7", "#EC4899", "#06B6D4", "#6B7280",
];
function randomDefaultColor(): string {
  return DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)];
}

interface TravelFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: TravelItem | null;
  tags: TravelTag[];
  eventTags?: EventTag[];
  onAddTag?: (name: string, color: string) => Promise<{ error: unknown }>;
  onDeleteTag?: (id: string) => Promise<{ error: unknown }>;
  onUpdateTagColor?: (id: string, color: string) => Promise<{ error: unknown }>;
  onAddEventTag?: (name: string, color: string) => Promise<{ error: unknown }>;
  onDeleteEventTag?: (id: string) => Promise<{ error: unknown }>;
  onUpdateEventTagColor?: (id: string, color: string) => Promise<{ error: unknown }>;
  onRenameEventTag?: (id: string, name: string) => Promise<{ error: unknown }>;
  onNavigateToMonth?: (year: number, month: number) => void;
  onRemoveVisitedDate?: (itemId: string, date: string) => Promise<void>;
  onSave: (data: Omit<TravelItem, "id" | "created_at" | "updated_at">) => Promise<{ error: unknown }>;
}

export default function TravelForm({
  open, onOpenChange, item, eventTags = [], onAddEventTag, onDeleteEventTag, onUpdateEventTagColor, onRenameEventTag, onNavigateToMonth, onRemoveVisitedDate, onSave,
}: TravelFormProps) {
  const { categories: midCategories, colors: categoryColors, addCategory, deleteCategory, updateCategoryColor, updateCategoryName } = useTravelCategories();

  const [title, setTitle] = useState("");
  const [color, setColor] = useState(() => randomDefaultColor());
  const [region, setRegion] = useState("");
  // 여러 위치 태그
  const [places, setPlaces] = useState<PlaceInfo[]>([]);
  // 입력창 검색 상태
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceInfo[]>([]);
  const [placeLoading, setPlaceLoading] = useState(false);
  // 카드를 눌러 펼친 위치 인덱스들 (여러 개 동시 펼침 가능)
  const [expandedPlaces, setExpandedPlaces] = useState<Set<number>>(new Set());
  // 미선택 상태(빈 문자열) — 사용자가 분류를 직접 골라야 저장 가능
  const [category, setCategory] = useState<TravelCategory | "">("");
  const [month, setMonth] = useState<number | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [visited, setVisited] = useState(false);
  const [saving, setSaving] = useState(false);

  // 자동 저장 드래프트 — item 편집 시엔 id 별 키, 신규 생성 시엔 "new" 고정 키.
  // 저장 안 누르고 모달 닫거나 탭 닫아도 입력값 복원됨.
  const draftKey = item ? `travel-form:${item.id}` : "travel-form:new";
  const draftValue = { title, color, region, category, month, selectedTags, notes, visited, places };
  const { loadDraft, clearDraft } = useFormDraft(draftKey, draftValue, {
    isEmpty: (v) =>
      !v.title.trim() &&
      !v.region.trim() &&
      !v.notes.trim() &&
      v.places.length === 0 &&
      v.selectedTags.length === 0 &&
      !v.category &&
      v.month == null &&
      !v.visited,
  });

  useEffect(() => {
    if (!open) return;
    // 1) item 기준으로 세팅
    if (item) {
      setTitle(item.title);
      setColor(item.color || categoryColors[item.category] || "#3B82F6");
      setRegion(item.region || "");
      setCategory(item.category);
      setMonth(item.month ?? null);
      setSelectedTags(item.tag ? item.tag.split(",") : []);
      setNotes(item.notes || "");
      setVisited(item.visited);
      if (item.places && item.places.length > 0) {
        setPlaces(item.places);
      } else if (item.place_name && item.lat != null && item.lng != null) {
        setPlaces([{
          name: item.place_name,
          address: item.address ?? "",
          lat: item.lat,
          lng: item.lng,
        }]);
      } else {
        setPlaces([]);
      }
    } else {
      setTitle("");
      setColor(randomDefaultColor());
      setRegion("");
      setCategory("");
      setMonth(null);
      setSelectedTags([]);
      setNotes("");
      setVisited(false);
      setPlaces([]);
    }
    // 2) 드래프트 있으면 우선 복원(자동) — 직전 세션 입력이 item 값보다 최신이므로.
    const draft = loadDraft();
    if (draft) {
      setTitle(draft.title ?? "");
      setColor(draft.color ?? randomDefaultColor());
      setRegion(draft.region ?? "");
      setCategory((draft.category as TravelCategory | "") ?? "");
      setMonth(draft.month ?? null);
      setSelectedTags(draft.selectedTags ?? []);
      setNotes(draft.notes ?? "");
      setVisited(draft.visited ?? false);
      setPlaces(draft.places ?? []);
    }
    setPlaceQuery("");
    setPlaceResults([]);
    setExpandedPlaces(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, open]);

  // 위치 검색 — 350ms 디바운스
  useEffect(() => {
    const q = placeQuery.trim();
    if (!q) {
      setPlaceResults([]);
      setPlaceLoading(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setPlaceLoading(true);
      try {
        const res = await fetch(`/api/naver/search?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setPlaceResults([]);
          return;
        }
        // 서버 응답을 PlaceInfo 형태로 정규화
        const items = (json.items ?? []).map((it: { name: string; roadAddress: string; address: string; lat: number; lng: number }) => ({
          name: it.name,
          address: it.roadAddress || it.address,
          lat: it.lat,
          lng: it.lng,
        }));
        setPlaceResults(items);
      } catch {
        if (!cancelled) setPlaceResults([]);
      } finally {
        if (!cancelled) setPlaceLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [placeQuery]);


  // 입력값을 실제 payload 로 빌드. 저장/자동저장 양쪽에서 재사용.
  const buildPayload = () => {
    const first = places[0] ?? null;
    return {
      title: title.trim(),
      in_season: false,
      region: region.trim() || null,
      category: category as TravelCategory,
      visited,
      tag: selectedTags.length > 0 ? selectedTags.join(",") : null,
      notes: notes.trim() || null,
      month,
      color,
      visited_dates: visited ? (item?.visited_dates ?? null) : null,
      mood: null,
      price_tier: null,
      rating: null,
      couple_notes: null,
      cover_image_url: null,
      place_name: first?.name ?? null,
      address: first?.address ?? null,
      lat: first?.lat ?? null,
      lng: first?.lng ?? null,
      places,
    };
  };

  const handleSubmit = async () => {
    if (!title.trim() || !category) return;
    setSaving(true);
    const { error } = await onSave(buildPayload());
    setSaving(false);
    if (error) {
      const raw = error instanceof Error ? error.message : typeof error === "string" ? error : null;
      toast.error(`저장 실패: ${translateError(raw)}`);
      console.error("[travel-form save]", error);
      return;
    }
    clearDraft();
    onOpenChange(false);
  };

  // 닫기 인터셉트 — 유의미 입력이 있으면 자동 저장 후 닫기.
  // "유의미" 기준: 최소한 title + category 가 채워진 상태.
  // (일부만 채운 상태로 닫으면 드래프트는 로컬에 남아 재오픈 시 복원됨.)
  const handleOpenChange = async (next: boolean) => {
    if (next) {
      onOpenChange(true);
      return;
    }
    // 닫기 전환. 저장 조건 만족 시 자동 저장.
    if (title.trim() && category) {
      try {
        setSaving(true);
        const { error } = await onSave(buildPayload());
        if (error) {
          const raw = error instanceof Error ? error.message : typeof error === "string" ? error : null;
          toast.error(`자동 저장 실패: ${translateError(raw)}`);
          console.error("[travel-form auto-save]", error);
          // 실패해도 닫기는 진행 — 드래프트 로컬에 남아있음.
        } else {
          clearDraft();
        }
      } finally {
        setSaving(false);
      }
    }
    onOpenChange(false);
  };

  return (
    <FormPage
      open={open}
      onOpenChange={handleOpenChange}
      title={item ? "여행 항목 수정" : "여행 항목 추가"}
      submitDisabled={!title.trim() || !category}
      saving={saving}
      onSubmit={handleSubmit}
    >
        <div className="flex flex-col gap-4">
          {/* 제목 */}
          <FormField label="제목" required htmlFor="travel-title">
            <Input
              id="travel-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 진해 군항제"
              className="h-9 text-sm"
            />
          </FormField>

          {/* 색상 */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">색상</Label>
            <ColorPickerRow color={color} onChange={setColor} />
          </div>

          {/* 시기 + 가봄 토글 — 한 행에 나란히 */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">시기</Label>
            <div className="flex items-center gap-3">
              <Select
                value={month != null ? String(month) : "none"}
                onValueChange={(v) => setMonth(!v || v === "none" ? null : parseInt(v))}
              >
                <SelectTrigger className="h-9 w-24 text-sm">
                  {month != null ? `${month}월` : <span className="text-muted-foreground">-</span>}
                </SelectTrigger>
                <SelectContent className="min-w-0">
                  <SelectItem value="none">없음</SelectItem>
                  {MONTHS.map((m) => (
                    <SelectItem key={m} value={String(m)}>{m}월</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={visited}
                  onClick={() => setVisited((v) => !v)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    visited ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      visited ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
                <span className="text-xs text-muted-foreground">{visited ? "가봄" : "안 가봄"}</span>
              </div>
            </div>
          </div>

          {/* 위치 — 네이버 지도 검색 인라인 드롭다운 · 다중 태그 */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">위치</Label>

            {/* 검색 입력창 — 타이핑하면 아래에 결과 드롭다운 */}
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={placeQuery}
                onChange={(e) => setPlaceQuery(e.target.value)}
                placeholder="장소명·지역 (예: 대전역, 애월 카페)"
                className="pl-9 h-9"
              />
              {placeQuery.trim() && (placeLoading || placeResults.length > 0) && (
                <div className="absolute left-0 right-0 top-full mt-1 z-30 max-h-60 overflow-y-auto rounded-md border bg-popover shadow-lg">
                  {placeLoading ? (
                    <p className="p-3 text-xs text-muted-foreground text-center">검색 중…</p>
                  ) : (
                    <ul className="divide-y">
                      {placeResults.map((p, i) => (
                        <li key={i}>
                          <button
                            type="button"
                            onClick={() => {
                              // 중복(같은 lat/lng) 방지
                              if (!places.some((x) => x.lat === p.lat && x.lng === p.lng)) {
                                setPlaces([...places, p]);
                              }
                              setPlaceQuery("");
                              setPlaceResults([]);
                            }}
                            className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-accent/50 transition-colors"
                          >
                            <MapPin className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{p.name}</div>
                              <div className="text-xs text-muted-foreground truncate">{p.address}</div>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* 선택된 장소 카드 — 카드를 누르면 지도 펼침/접힘. 별도 토글 버튼 없음 */}
            {places.length > 0 && (
              <div className="flex flex-col gap-2">
                {places.map((p, idx) => {
                  const isExpanded = expandedPlaces.has(idx);
                  return (
                    <div
                      key={`${p.lat}-${p.lng}-${idx}`}
                      onClick={() => {
                        setExpandedPlaces((prev) => {
                          const next = new Set(prev);
                          if (next.has(idx)) next.delete(idx);
                          else next.add(idx);
                          return next;
                        });
                      }}
                      className="flex flex-col gap-2 rounded-md border p-2 cursor-pointer hover:bg-accent/30 transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <MapPin className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{p.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{p.address}</div>
                        </div>
                        <a
                          href={`https://map.naver.com/p/search/${encodeURIComponent(p.name)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0 p-0.5 rounded hover:bg-accent transition-colors"
                          aria-label="네이버지도에서 보기"
                          title="네이버지도에서 보기"
                        >
                          {/* 네이버지도 공식 favicon (ssl.pstatic.net) */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src="https://ssl.pstatic.net/static/maps/assets/icons/favicon-32x32.png"
                            alt="네이버지도"
                            width={16}
                            height={16}
                            className="h-4 w-4"
                          />
                        </a>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPlaces(places.filter((_, i) => i !== idx));
                            setExpandedPlaces((prev) => {
                              const next = new Set(prev);
                              next.delete(idx);
                              return next;
                            });
                          }}
                          className="text-muted-foreground hover:text-destructive shrink-0 p-0.5"
                          aria-label="위치 제거"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {isExpanded && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <NaverMap lat={p.lat} lng={p.lng} height={200} zoom={16} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 분류 — 미선택 상태 허용, 저장 시 필수 */}
          <FormField label="분류" required>
            <TagInput
              selectedTags={category ? [category] : []}
              allTags={midCategories.map((c) => ({ id: c, name: c, color: categoryColors[c] || "#6B7280" }))}
              onChange={(next) => {
                const picked = next.find((t) => t !== category);
                if (picked) setCategory(picked as TravelCategory);
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
          </FormField>

          {/* 태그 */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">태그</Label>
            <TagInput
              selectedTags={selectedTags}
              allTags={eventTags.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
              onChange={setSelectedTags}
              onAddTag={onAddEventTag}
              onDeleteTag={onDeleteEventTag}
              onUpdateTagColor={onUpdateEventTagColor}
              onRenameTag={onRenameEventTag}
              orderKey="tag-order:event-tags"
              placeholder="검색·추가"
            />
          </div>

          {/* 여행 내용 */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">메모</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="세부 내용 (선택)" rows={4} />
          </div>

          {/* 가본 날 (캘린더 추가 이력) */}
          {item && item.visited_dates && item.visited_dates.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">가본 날</Label>
              <div className="flex flex-wrap gap-1.5">
                {item.visited_dates.map((d) => {
                  const dt = new Date(d + "T00:00:00");
                  const label = `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, "0")}.${String(dt.getDate()).padStart(2, "0")}`;
                  return (
                    <div key={d} className="group/vd relative">
                      <button
                        type="button"
                        className="rounded-md border px-2 py-1 text-xs text-muted-foreground hover:border-foreground hover:text-foreground transition-colors cursor-pointer"
                        onClick={() => {
                          if (onNavigateToMonth) {
                            onNavigateToMonth(dt.getFullYear(), dt.getMonth() + 1);
                            onOpenChange(false);
                          }
                        }}
                      >
                        {label}
                      </button>
                      {onRemoveVisitedDate && (
                        <button
                          type="button"
                          className="absolute -top-1.5 -right-1.5 transition-opacity rounded-full bg-background border text-muted-foreground hover:text-destructive p-0.5 md:opacity-0 md:group-hover/vd:opacity-100"
                          onClick={async (e) => {
                            e.stopPropagation();
                            await onRemoveVisitedDate(item.id, d);
                          }}
                          title="가본 날에서 제거"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
    </FormPage>
  );
}
