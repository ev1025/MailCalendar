"use client";

import { useEffect, useState } from "react";
import { Plus, Route } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogActionsBar,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useTravelPlans } from "@/hooks/use-travel-plans";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import type { TravelItem } from "@/types";

// 여행 카드의 메뉴에서 열림. 기존 계획 선택 또는 새 계획 생성 →
// 현재 여행 항목의 places[] 를 tasks 로 일괄 insert.
// 새 일자로 삽입(현재 계획의 max day_index + 1).

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  travelItem: TravelItem | null;
  onDone?: (planId: string) => void;
}

export default function AddToPlanDialog({ open, onOpenChange, travelItem, onDone }: Props) {
  const { plans, addPlan } = useTravelPlans();
  const [mode, setMode] = useState<"pick" | "new">("pick");
  const [newTitle, setNewTitle] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // 선택된 계획의 기존 day_index 목록 (day 선택 UI 용)
  const [existingDays, setExistingDays] = useState<number[]>([]);
  // -1 = "+ 새 일자" (max+1). 그 외는 해당 day_index 뒤에 append.
  const [targetDay, setTargetDay] = useState<number>(-1);

  // 계획 선택이 바뀌면 해당 계획의 day 목록 로드
  useEffect(() => {
    if (!selectedPlanId || !open) {
      setExistingDays([]);
      setTargetDay(-1);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("travel_plan_tasks")
        .select("day_index")
        .eq("plan_id", selectedPlanId);
      const unique = Array.from(new Set((data ?? []).map((r) => r.day_index as number))).sort(
        (a, b) => a - b
      );
      setExistingDays(unique);
      setTargetDay(-1); // 기본값 — 새 일자
    })();
  }, [selectedPlanId, open]);

  // 선택된 plan 을 useTravelPlanTasks 로 다시 hook 걸기보다,
  // 한 번만 조회해서 max day_index 파악 후 bulk insert.
  const injectPlaces = async (planId: string) => {
    if (!travelItem) return;
    // places[] 우선, 비어있으면 구버전 단일 장소(place_name/lat/lng) 로 폴백
    let places = travelItem.places ?? [];
    if (
      places.length === 0 &&
      travelItem.place_name &&
      travelItem.lat != null &&
      travelItem.lng != null
    ) {
      places = [
        {
          name: travelItem.place_name,
          address: travelItem.address ?? "",
          lat: travelItem.lat,
          lng: travelItem.lng,
        },
      ];
    }

    // 대상 day_index 결정 — targetDay 가 -1 이면 새 일자(max+1), 아니면 지정 day 에 append
    let nextDay: number;
    if (targetDay === -1) {
      const { data: existing } = await supabase
        .from("travel_plan_tasks")
        .select("day_index")
        .eq("plan_id", planId)
        .order("day_index", { ascending: false })
        .limit(1);
      nextDay = existing && existing.length > 0 ? (existing[0].day_index as number) + 1 : 0;
    } else {
      nextDay = targetDay;
    }
    // 지정 day 의 기존 max manual_order 뒤에 붙이기
    const { data: dayTasks } = await supabase
      .from("travel_plan_tasks")
      .select("manual_order")
      .eq("plan_id", planId)
      .eq("day_index", nextDay)
      .order("manual_order", { ascending: false })
      .limit(1);
    const baseOrder =
      dayTasks && dayTasks.length > 0 ? (dayTasks[0].manual_order as number) + 1 : 0;

    // 장소 없으면 빈 일정 1개 생성 (사용자가 계획 안에서 장소 직접 입력).
    // travelItem 의 태그(tag, comma-separated) + 분류(category) 모두 전달.
    const rows =
      places.length === 0
        ? [
            {
              plan_id: planId,
              day_index: nextDay,
              start_time: null,
              place_name: travelItem.title,
              place_address: null,
              place_lat: null,
              place_lng: null,
              tag: travelItem.tag,
              category: travelItem.category,
              content: null,
              stay_minutes: 0,
              manual_order: baseOrder,
              transport_mode: null,
              transport_duration_sec: null,
              transport_manual: false,
            },
          ]
        : places.map((p, i) => ({
            plan_id: planId,
            day_index: nextDay,
            start_time: null,
            place_name: p.name,
            place_address: p.address,
            place_lat: p.lat,
            place_lng: p.lng,
            tag: travelItem.tag,
            category: travelItem.category,
            content: i === 0 ? travelItem.title : null,
            stay_minutes: 0,
            manual_order: baseOrder + i,
            transport_mode: null,
            transport_duration_sec: null,
            transport_manual: false,
          }));

    const { error } = await supabase
      .from("travel_plan_tasks")
      .insert(rows as never);
    if (error) {
      toast.error("일정 추가 실패");
      return;
    }
    if (places.length === 0) {
      toast.info("위치 없이 빈 일정을 추가했습니다. 계획에서 장소를 입력하세요.");
    } else {
      toast.success(`${places.length}개 장소를 계획에 추가했습니다`);
    }
    onDone?.(planId);
    onOpenChange(false);
  };

  const handleConfirm = async () => {
    if (!travelItem) return;
    setSaving(true);
    try {
      if (mode === "new") {
        const title = newTitle.trim() || travelItem.title;
        const { data } = await addPlan({ title });
        if (data) await injectPlaces(data.id);
      } else {
        if (!selectedPlanId) {
          toast.error("계획을 선택하세요");
          return;
        }
        await injectPlaces(selectedPlanId);
      }
    } finally {
      setSaving(false);
    }
  };

  if (!travelItem) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showBackButton={false}
        className="max-w-[calc(100%-3rem)] sm:max-w-md p-0 gap-0 overflow-hidden"
      >
        <div className="px-5 pt-5 pb-4 flex flex-col gap-3.5">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Route className="h-4 w-4" /> 여행 계획에 추가
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{travelItem.title}</span>
          {(() => {
            const count =
              (travelItem.places?.length ?? 0) > 0
                ? travelItem.places!.length
                : travelItem.lat != null && travelItem.lng != null
                  ? 1
                  : 0;
            return count > 0
              ? ` 에 저장된 장소 ${count}개가 선택한 계획에 새 일자로 추가됩니다.`
              : " 에 저장된 장소가 없어 빈 일정만 추가됩니다. 계획에서 장소를 직접 입력할 수 있습니다.";
          })()}
        </p>

        {/* 탭 스타일로 명확히 — 두 옵션이 상호배타적임을 시각적으로 강조. */}
        <div role="tablist" aria-label="계획 선택 방식" className="flex p-0.5 bg-muted/50 rounded-lg">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "pick"}
            onClick={() => setMode("pick")}
            className={`flex-1 h-8 text-xs font-medium rounded-md transition-all duration-150 tap-feedback ${
              mode === "pick"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            기존 계획
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "new"}
            onClick={() => setMode("new")}
            className={`flex-1 h-8 text-xs font-medium rounded-md transition-all duration-150 tap-feedback inline-flex items-center justify-center gap-1 ${
              mode === "new"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Plus className="h-3 w-3" /> 새 계획
          </button>
        </div>

        {mode === "pick" ? (
          plans.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              계획이 없습니다. &quot;새 계획&quot;으로 만드세요.
            </p>
          ) : (
            <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
              {plans.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPlanId(p.id)}
                  className={`rounded-md border px-3 py-2 text-left transition-colors ${
                    selectedPlanId === p.id
                      ? "border-primary bg-primary/10"
                      : "hover:bg-accent/50"
                  }`}
                >
                  <div className="text-sm font-medium truncate">{p.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.start_date || p.end_date
                      ? `${p.start_date ?? "-"} ~ ${p.end_date ?? "-"}`
                      : "기간 미정"}
                  </div>
                </button>
              ))}
            </div>
          )
        ) : (
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={`예: ${travelItem.title} 일정`}
            className="h-9 text-sm"
          />
        )}

        {/* 일자 선택 — 기존 계획 선택 후, 기존 day 가 1개 이상 있을 때만 노출.
            기본: "+ 새 일자"(-1). */}
        {mode === "pick" && selectedPlanId && existingDays.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">추가할 일자</span>
            <Select
              value={String(targetDay)}
              onValueChange={(v) => v && setTargetDay(parseInt(v))}
            >
              <SelectTrigger className="h-8 text-xs flex-1">
                {targetDay === -1 ? "+ 새 일자" : `${targetDay + 1}일차`}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="-1" className="text-xs">+ 새 일자</SelectItem>
                {existingDays.map((d) => (
                  <SelectItem key={d} value={String(d)} className="text-xs">
                    {d + 1}일차
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        </div>
        <DialogActionsBar
          onCancel={() => onOpenChange(false)}
          onConfirm={handleConfirm}
          confirmLabel="추가"
          busy={saving}
          confirmDisabled={mode === "pick" && !selectedPlanId}
        />
      </DialogContent>
    </Dialog>
  );
}
