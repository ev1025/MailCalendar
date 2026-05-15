"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { TaskLeg } from "@/lib/travel/legs";
import type { TransportMode, TransportRouteStep } from "@/types";
import {
  busColor,
  cleanStopName,
  subwayLineColor,
} from "@/lib/travel/kr-transit-colors";
import { formatDuration, type TransitSegment } from "@/lib/travel/providers";
import { getRouteData } from "@/hooks/use-route-data";
import PlanTransportPicker, { SegmentBar } from "@/components/travel/plan-transport-picker";
import TransitSegmentChain from "@/components/travel/transit-segment-chain";
import { addMinutes } from "@/lib/travel/time";
import { openRouteInNaverMap } from "@/lib/travel/naver-map-link";

const NAVER_MAP_ICON = "https://ssl.pstatic.net/static/maps/assets/icons/favicon-32x32.png";

// Leg 카드 (2-line compact).
// Unselected:   [ 이동수단 선택 ▾ ]
// Selected:     🚶 도보 16분  (탭하면 picker 재오픈)
//
// picker 안에 수동 입력까지 포함되어 더 이상 별도 팝업 없음.

const MODE_ICON: Record<TransportMode, { emoji: string; label: string }> = {
  car: { emoji: "🚗", label: "승용차" },
  walk: { emoji: "🚶", label: "도보" },
  bus: { emoji: "🚌", label: "버스" },
  train: { emoji: "🚈", label: "지하철" },
  taxi: { emoji: "🚗", label: "승용차" }, // 하위호환
  transit: { emoji: "🚆", label: "소요시간" }, // 조합 경로 (도보+버스+지하철)
};

interface Props {
  leg: TaskLeg;
  legDeparture: string | null;
  onUpdateTask: (taskId: string, updates: Partial<{
    transport_mode: TransportMode | null;
    transport_duration_sec: number | null;
    transport_manual: boolean;
    transport_durations: Partial<Record<TransportMode, number | null>> | null;
    transport_route: TransportRouteStep[] | null;
  }>) => void;
}

export default function PlanLegCard({ leg, legDeparture, onUpdateTask }: Props) {
  const { fromTask, toTask } = leg;
  const hasCoords =
    fromTask.place_lat != null &&
    fromTask.place_lng != null &&
    toTask.place_lat != null &&
    toTask.place_lng != null;

  const [pickerOpen, setPickerOpen] = useState(false);

  const mode = toTask.transport_mode;
  const durationSec = toTask.transport_duration_sec;
  const isManual = toTask.transport_manual;
  const icon = mode ? MODE_ICON[mode] : null;
  const initialManualMinutes =
    isManual && durationSec ? Math.round(durationSec / 60) : undefined;

  // 버스·지하철 선택됐으면 segments 상세도 목록에 표시 — 캐시에서 가져옴
  const [segments, setSegments] = useState<TransitSegment[] | undefined>(undefined);
  useEffect(() => {
    if (!hasCoords || !mode || (mode !== "bus" && mode !== "train")) {
      setSegments(undefined);
      return;
    }
    let cancelled = false;
    getRouteData(
      { lat: fromTask.place_lat!, lng: fromTask.place_lng! },
      { lat: toTask.place_lat!, lng: toTask.place_lng! },
      mode
    ).then((r) => {
      if (!cancelled) setSegments(r?.segments);
    });
    return () => { cancelled = true; };
  }, [
    hasCoords,
    mode,
    fromTask.place_lat,
    fromTask.place_lng,
    toTask.place_lat,
    toTask.place_lng,
  ]);

  const filterKinds: "bus" | "rail" | undefined =
    mode === "bus" ? "bus" : mode === "train" ? "rail" : undefined;

  const handleSelect = (
    selectedMode: TransportMode,
    selectedDurationSec: number | null,
    route?: TransportRouteStep[]
  ) => {
    onUpdateTask(toTask.id, {
      transport_mode: selectedMode,
      transport_duration_sec: selectedDurationSec,
      transport_manual: false,
      // transit 이면 route step 저장, 아니면 null 로 덮어써서 이전 잔해 제거
      transport_route: selectedMode === "transit" ? (route ?? null) : null,
    });
    setPickerOpen(false);
  };

  const handleManual = (minutes: number) => {
    onUpdateTask(toTask.id, {
      transport_duration_sec: minutes * 60,
      transport_manual: true,
      // mode 는 직전 것 유지 (없으면 "car" 기본)
      transport_mode: toTask.transport_mode ?? "car",
      transport_route: null,
    });
  };

  if (!mode || durationSec == null) {
    return (
      <>
        <div className="flex items-center ml-6 pl-2 border-l-2 border-dashed border-muted-foreground/30 py-1">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={!hasCoords}
            className="flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            <span>이동수단 선택</span>
            <ChevronDown className="h-3 w-3" />
          </button>
          {!hasCoords && (
            <span className="text-[10px] text-muted-foreground ml-2">좌표 없음</span>
          )}
        </div>
        {hasCoords && (
          <PlanTransportPicker
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            from={{ lat: fromTask.place_lat!, lng: fromTask.place_lng! }}
            to={{ lat: toTask.place_lat!, lng: toTask.place_lng! }}
            legDeparture={legDeparture}
            selectedMode={null}
            onSelect={handleSelect}
            onManualSave={handleManual}
            initialManualMinutes={initialManualMinutes}
          />
        )}
      </>
    );
  }

  return (
    <>
      {/* 전체 블록 클릭 시 picker 재오픈. 우측에 네이버지도 길찾기 아이콘 (stopPropagation).
          외부는 <div role=button> — 내부에 실제 <button>(네이버 아이콘) 을 넣으려면
          button 중첩을 피해야 해서 div 로 전환. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setPickerOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setPickerOpen(true);
          }
        }}
        className="flex items-start gap-2 ml-6 pl-2 pr-1.5 border-l-2 border-primary/30 py-1.5 text-left hover:bg-accent/50 rounded-r-md transition-colors cursor-pointer"
        title="이동수단 변경"
      >
        <div className="flex-1 flex flex-col gap-1.5 min-w-0">
        {/* transit 모드는 picker RouteCard 와 동일한 풀 레이아웃.
            (소요시간 · 도착 · 도보 / 진행바 / 정류장·배지 상세) */}
        {mode === "transit" && toTask.transport_route && toTask.transport_route.length > 0 ? (
          (() => {
            const route = toTask.transport_route!;
            const walkingSec = route
              .filter((s) => s.kind === "walk")
              .reduce((acc, s) => acc + s.durationSec, 0);
            const arrival = legDeparture
              ? addMinutes(legDeparture, Math.max(1, Math.round(durationSec / 60)))
              : null;
            const walkMin = Math.round(walkingSec / 60);
            return (
              <div className="flex flex-col gap-2 min-w-0">
                {/* 헤더: 총 소요 · 도착 · 도보 */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-primary font-bold">
                    {formatDuration(durationSec)}
                  </span>
                  {arrival && (
                    <span className="text-[10px] text-muted-foreground">· 도착 {arrival}</span>
                  )}
                  <span className="text-[10px] text-muted-foreground">· 도보 {walkMin}분</span>
                  {isManual && <span className="text-[10px] text-muted-foreground">(수동)</span>}
                </div>
                {/* 진행바 — picker 와 동일 컴포넌트 */}
                <SegmentBar steps={route} totalSec={durationSec} />
                {/* 정류장 · 배지 상세 */}
                <div className="flex flex-col gap-2 pl-1 pointer-events-none">
                  {route
                    .filter((s) => s.kind !== "walk")
                    .map((s, i) => {
                      const names =
                        s.alternateNames && s.alternateNames.length > 0
                          ? s.alternateNames
                          : s.name
                            ? [s.name]
                            : [];
                      const from = normalizeStopName(s.fromStop, s.kind);
                      const to = normalizeStopName(s.toStop, s.kind);
                      return (
                        <div key={i} className="flex flex-col gap-1 min-w-0">
                          <div className="text-[10px] font-normal break-keep">
                            {from}
                            {to && <span className="mx-1 font-normal">→</span>}
                            {to}
                          </div>
                          <div className="flex items-center gap-1 flex-wrap">
                            {names.map((name, j) =>
                              s.kind === "bus" ? (
                                <BusBadgeFull key={j} name={name} />
                              ) : (
                                <SubwayBadgeFull key={j} name={name} />
                              )
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })()
        ) : (
          <div className="flex items-baseline gap-1.5 min-w-0">
            {icon && <span className="text-xs">{icon.emoji}</span>}
            <span className="text-xs text-primary font-bold">{icon?.label}</span>
            <span className="text-[10px] text-muted-foreground">{formatDuration(durationSec)}</span>
            {isManual && <span className="text-[10px] text-muted-foreground">(수동)</span>}
          </div>
        )}
        {/* 단일 버스·지하철 selected 상태에서 세그먼트 상세(배지+역명) 표시 */}
        {!isManual && mode !== "transit" && segments && segments.length > 0 && (
          <div className="pl-1 pointer-events-none">
            <TransitSegmentChain segments={segments} filterKinds={filterKinds} />
          </div>
        )}
        </div>
        {/* 네이버지도 길찾기 — 구간 A→B 를 현재 이동수단으로 네이버앱 호출 */}
        {hasCoords && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openRouteInNaverMap({
                from: {
                  lat: fromTask.place_lat!,
                  lng: fromTask.place_lng!,
                  name: fromTask.place_name,
                },
                to: {
                  lat: toTask.place_lat!,
                  lng: toTask.place_lng!,
                  name: toTask.place_name,
                },
                mode,
              });
            }}
            className="shrink-0 p-1 rounded hover:bg-accent transition-colors self-center"
            title="네이버지도에서 길찾기"
            aria-label="네이버지도에서 길찾기"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={NAVER_MAP_ICON} alt="" className="h-4 w-4" />
          </button>
        )}
      </div>
      {hasCoords && (
        <PlanTransportPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          from={{ lat: fromTask.place_lat!, lng: fromTask.place_lng! }}
          to={{ lat: toTask.place_lat!, lng: toTask.place_lng! }}
          legDeparture={legDeparture}
          selectedMode={mode === "taxi" ? "car" : mode}
          onSelect={handleSelect}
          onManualSave={handleManual}
          initialManualMinutes={initialManualMinutes}
        />
      )}
    </>
  );
}

// 지하철/기차/트램 정류장은 '역' 접미사가 빠지는 경우 보정.
// 버스는 정류장 이름에 '역' 붙이지 않음 (예: "홍제삼거리").
function normalizeStopName(
  raw: string | null | undefined,
  kind: TransportRouteStep["kind"]
): string {
  const cleaned = cleanStopName(raw);
  if (!cleaned) return "";
  if (
    (kind === "subway" || kind === "train" || kind === "tram") &&
    !cleaned.endsWith("역")
  ) {
    return cleaned + "역";
  }
  return cleaned;
}

// transit 구간 배지 (풀 라벨) — "3호선" "KTX" "704" 등 이름 그대로 표시.
// plan-leg-card(여행계획 상세) 전용 컴팩트 사이즈. picker 쪽은 원래 크기 유지.
function SubwayBadgeFull({ name }: { name: string }) {
  return (
    <span
      className="inline-flex items-center h-4 px-1.5 rounded-full text-[10px] font-semibold text-white"
      style={{ backgroundColor: subwayLineColor(name) }}
    >
      {name}
    </span>
  );
}

function BusBadgeFull({ name }: { name: string }) {
  return (
    <span
      className="inline-flex items-center h-4 px-1.5 rounded text-[10px] font-semibold text-white"
      style={{ backgroundColor: busColor(name) }}
    >
      {name}
    </span>
  );
}
