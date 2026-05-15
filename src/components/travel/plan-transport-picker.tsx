"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Bus, Check, TramFront, Zap } from "lucide-react";
import FormPage from "@/components/ui/form-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  formatDuration,
  fetchTransitAlternatives,
  type TransitRoute,
} from "@/lib/travel/providers";
import { useRouteDurations } from "@/hooks/use-route-data";
import { addMinutes } from "@/lib/travel/time";
import {
  busColor,
  cleanStopName,
  subwayLineColor,
} from "@/lib/travel/kr-transit-colors";
import type { TransportMode, TransportRouteStep } from "@/types";

// 이동수단 선택 — FormPage 기반 2탭 구조.
// 탭 1 "대중교통": Google Directions alternatives=true → 조합 경로 카드 목록
// 탭 2 "자동차/도보/수동": 기존 단일 수단 리스트 + 수동 입력

type SortKey = "fastest" | "less-walk";
type Tab = "transit" | "direct";

// 같은 정류장 시퀀스를 공유하는 경로끼리 묶어 버스·지하철 노선을 집계.
interface AggregatedRoute {
  durationSec: number;
  walkingSec: number;
  steps: TransportRouteStep[];
}

function aggregateRoutes(routes: TransitRoute[]): AggregatedRoute[] {
  const groups = new Map<string, AggregatedRoute>();
  for (const route of routes) {
    // 시그니처 = transit step 의 정규화된 출발점만. '홍제삼거리(A)' 와
    // '홍제삼거리.인왕산...' 처럼 부연 표기가 달라도 cleanStopName 이 같은
    // '홍제삼거리' 로 정규화해주므로 같은 정류장의 여러 버스가 한 AggregatedRoute
    // 의 alternateNames 에 누적됨. (이전엔 from→to 두 쌍을 비교해 중간 정류장이
    // 살짝 달라지면 병합 실패하던 문제 있었음.)
    const transitSig = route.steps
      .filter((s) => s.kind !== "walk")
      .map((s) => `${s.kind}:${cleanStopName(s.fromStop)}`)
      .join("|");
    const key =
      transitSig || `walk-only:${Math.round(route.walkingSec / 60)}`;

    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        durationSec: route.durationSec,
        walkingSec: route.walkingSec,
        steps: route.steps.map((s) => ({
          kind: s.kind,
          durationSec: s.durationSec,
          name: s.name,
          fromStop: s.fromStop,
          toStop: s.toStop,
          numStops: s.numStops,
          alternateNames:
            s.kind !== "walk" && s.name ? [s.name] : [],
        })),
      });
    } else {
      // 같은 시그니처 → transit step 의 name 을 alternateNames 에 누적
      let ei = 0;
      for (const sNew of route.steps) {
        if (sNew.kind === "walk") continue;
        while (ei < existing.steps.length && existing.steps[ei].kind === "walk") ei++;
        if (ei >= existing.steps.length) break;
        const target = existing.steps[ei];
        if (sNew.name && target.alternateNames && !target.alternateNames.includes(sNew.name)) {
          target.alternateNames.push(sNew.name);
        }
        ei++;
      }
    }
  }
  return Array.from(groups.values());
}

function sortRoutes(routes: AggregatedRoute[], by: SortKey): AggregatedRoute[] {
  const TIE_SEC = 120; // ±2분 범위 = 유사
  return [...routes].sort((a, b) => {
    if (by === "less-walk") {
      if (Math.abs(a.walkingSec - b.walkingSec) > 30) return a.walkingSec - b.walkingSec;
      if (Math.abs(a.durationSec - b.durationSec) > TIE_SEC) return a.durationSec - b.durationSec;
    } else {
      if (Math.abs(a.durationSec - b.durationSec) > TIE_SEC) return a.durationSec - b.durationSec;
    }
    // tie → 버스 포함 > 지하철 전용 > 도보만
    const score = (r: AggregatedRoute) =>
      r.steps.some((s) => s.kind === "bus") ? 2 : r.steps.some((s) => s.kind !== "walk") ? 1 : 0;
    return score(b) - score(a);
  });
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  legDeparture: string | null;
  selectedMode: TransportMode | null;
  /** 선택 시 호출. transit 모드면 route step 배열도 함께 전달. */
  onSelect: (
    mode: TransportMode,
    durationSec: number | null,
    route?: TransportRouteStep[]
  ) => void;
  onManualSave: (minutes: number) => void;
  initialManualMinutes?: number;
}

export default function PlanTransportPicker({
  open,
  onOpenChange,
  from,
  to,
  legDeparture,
  selectedMode,
  onSelect,
  onManualSave,
  initialManualMinutes,
}: Props) {
  const [tab, setTab] = useState<Tab>(() =>
    selectedMode === "car" || selectedMode === "taxi" || selectedMode === "walk"
      ? "direct"
      : "transit"
  );
  const [sort, setSort] = useState<SortKey>("fastest");

  // 대중교통 alternatives
  const [alternatives, setAlternatives] = useState<TransitRoute[] | null>(null);
  const [altLoading, setAltLoading] = useState(false);
  const [altError, setAltError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setAltLoading(true);
    setAltError(null);
    fetchTransitAlternatives(from, to).then(({ routes, error }) => {
      if (cancelled) return;
      if (routes && routes.length > 0) {
        setAlternatives(routes);
      } else {
        setAlternatives([]);
        setAltError(error?.message ?? "경로 없음");
      }
      setAltLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, from.lat, from.lng, to.lat, to.lng]);

  // 자동차/도보 단일 모드
  const { durations } = useRouteDurations(from, to, open && tab === "direct");

  // 수동 입력 — 기존 로직 그대로
  const [manualValue, setManualValue] = useState(
    initialManualMinutes ? String(initialManualMinutes) : ""
  );
  const [manualUnit, setManualUnit] = useState<"min" | "hour">("min");

  useEffect(() => {
    if (open) {
      setManualValue(initialManualMinutes ? String(initialManualMinutes) : "");
      setManualUnit("min");
    }
  }, [open, initialManualMinutes]);

  const handleManualChange = (v: string) => {
    if (manualUnit === "hour") {
      setManualValue(v.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1"));
    } else {
      setManualValue(v.replace(/[^0-9]/g, ""));
    }
  };
  const toggleManualUnit = () => {
    const n = parseFloat(manualValue);
    if (manualUnit === "min") {
      setManualUnit("hour");
      if (Number.isFinite(n) && n > 0) {
        const hours = n / 60;
        setManualValue(hours % 1 === 0 ? String(hours) : hours.toFixed(1));
      }
    } else {
      setManualUnit("min");
      if (Number.isFinite(n) && n > 0) {
        setManualValue(String(Math.round(n * 60)));
      }
    }
  };
  const manualValid = (() => {
    const n = parseFloat(manualValue);
    return Number.isFinite(n) && n > 0;
  })();
  const commitManual = () => {
    const n = parseFloat(manualValue);
    if (!Number.isFinite(n) || n <= 0) return;
    const mins = manualUnit === "hour" ? Math.round(n * 60) : Math.floor(n);
    onManualSave(mins);
    onOpenChange(false);
  };

  const aggregated = useMemo(
    () => (alternatives ? aggregateRoutes(alternatives) : []),
    [alternatives]
  );
  const sortedRoutes = useMemo(() => sortRoutes(aggregated, sort), [aggregated, sort]);

  return (
    <FormPage
      open={open}
      onOpenChange={onOpenChange}
      title="이동수단 선택"
      hideFooter
    >
      {/* 탭 버튼 — 이모지 없이 텍스트만 */}
      <div className="flex border-b -mx-4 md:-mx-6 mb-3">
        <TabBtn active={tab === "transit"} onClick={() => setTab("transit")}>
          대중교통
        </TabBtn>
        <TabBtn active={tab === "direct"} onClick={() => setTab("direct")}>
          자동차·도보·수동
        </TabBtn>
      </div>

      {/* 출발 + (대중교통 탭일 때만) 정렬 */}
      <div className="flex items-center justify-between mb-2 min-h-7">
        {legDeparture ? (
          <p className="text-xs text-muted-foreground">
            출발{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {legDeparture}
            </span>{" "}
            기준
          </p>
        ) : (
          <span />
        )}
        {tab === "transit" && (
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-7 w-[110px] text-xs">
              {sort === "fastest" ? "최단 경로순" : "도보 적은 순"}
            </SelectTrigger>
            <SelectContent className="min-w-0">
              <SelectItem value="fastest" className="text-xs" hideIndicator>
                최단 경로순
              </SelectItem>
              <SelectItem value="less-walk" className="text-xs" hideIndicator>
                도보 적은 순
              </SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* 본문 — 탭별 분기 */}
      {tab === "transit" ? (
        <TransitTab
          routes={sortedRoutes}
          loading={altLoading}
          error={altError}
          legDeparture={legDeparture}
          onPick={(route) => {
            onSelect("transit", route.durationSec, route.steps);
            onOpenChange(false);
          }}
        />
      ) : (
        <DirectTab
          durations={durations}
          selectedMode={selectedMode}
          legDeparture={legDeparture}
          manualValue={manualValue}
          manualUnit={manualUnit}
          manualValid={manualValid}
          onManualChange={handleManualChange}
          onToggleUnit={toggleManualUnit}
          onCommitManual={commitManual}
          onPick={(mode, dur) => {
            onSelect(mode, dur);
            onOpenChange(false);
          }}
        />
      )}
    </FormPage>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "border-b-2 border-primary text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

// ── 대중교통 탭 ──────────────────────────────────────────
function TransitTab({
  routes,
  loading,
  error,
  legDeparture,
  onPick,
}: {
  routes: AggregatedRoute[];
  loading: boolean;
  error: string | null;
  legDeparture: string | null;
  onPick: (route: AggregatedRoute) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        경로 계산 중…
      </div>
    );
  }
  if (error || routes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-1">
        <p className="text-sm text-muted-foreground">
          {error ?? "대중교통 경로가 없습니다"}
        </p>
      </div>
    );
  }
  const fastest = routes.reduce(
    (min, r) => (r.durationSec < min ? r.durationSec : min),
    Infinity
  );
  return (
    <div className="flex flex-col gap-2">
      {routes.map((r, i) => (
        <RouteCard
          key={i}
          route={r}
          isFastest={r.durationSec === fastest}
          legDeparture={legDeparture}
          onClick={() => onPick(r)}
        />
      ))}
    </div>
  );
}

function RouteCard({
  route,
  isFastest,
  legDeparture,
  onClick,
}: {
  route: AggregatedRoute;
  isFastest: boolean;
  legDeparture: string | null;
  onClick: () => void;
}) {
  const arrival =
    legDeparture != null
      ? addMinutes(legDeparture, Math.max(1, Math.round(route.durationSec / 60)))
      : null;
  const walkMin = Math.round(route.walkingSec / 60);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-2 rounded-md border p-3 text-left hover:bg-accent/50 transition-colors"
    >
      {/* 헤더: 총 소요 + 도착 + 도보합계 + 최속 배지 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-base font-semibold">
          {formatDuration(route.durationSec)}
        </span>
        {arrival && (
          <span className="text-xs text-muted-foreground">· 도착 {arrival}</span>
        )}
        <span className="text-xs text-muted-foreground">· 도보 {walkMin}분</span>
        {isFastest && (
          <span className="flex items-center gap-0.5 text-[10px] font-medium text-amber-600 ml-auto">
            <Zap className="h-2.5 w-2.5 fill-amber-500 stroke-amber-600" />
            최속
          </span>
        )}
      </div>

      {/* 진행 바 — 구간별 소요분 라벨 위, 색상 바 아래 */}
      <SegmentBar steps={route.steps} totalSec={route.durationSec} />

      {/* 상세 — 정류장 · 노선 배지 (이모지 없이 깔끔하게) */}
      <RouteStepsDetail steps={route.steps} />
    </button>
  );
}

// 진행바 — Gemini 제안(Method 1) 기반 inline-flex 구조.
// 마커를 absolute 로 '%' 위치 계산하던 기존 방식은 짧은 세그먼트·연속 transit
// 에서 위치 오정렬이 잦았음. 이제 마커가 flex 흐름 안에서 shrink-0 + 음의
// margin 으로 각 transit 세그먼트 '시작 경계' 에 브릿지로 걸침.
export function SegmentBar({ steps, totalSec: _totalSec }: { steps: TransportRouteStep[]; totalSec: number }) {
  return (
    <div className="flex h-5 items-center w-full">
      {steps.map((s, i) => {
        const min = Math.max(1, Math.round(s.durationSec / 60));
        const bg =
          s.kind === "walk"
            ? "#cbd5e1"
            : s.kind === "bus"
              ? busColor(s.alternateNames?.[0] ?? s.name)
              : s.kind === "subway" || s.kind === "train" || s.kind === "tram"
                ? subwayLineColor(s.alternateNames?.[0] ?? s.name)
                : "#64748b";
        const textColor = s.kind === "walk" ? "#475569" : "#ffffff";
        const isTransit = s.kind !== "walk";
        return (
          <React.Fragment key={i}>
            {/* transit 세그먼트 앞에 마커 — 첫 스텝이면 ml 0, 아니면 -ml-2 로
                이전 세그먼트 우측과 브릿지. -mr-2 로 뒤 세그먼트 좌측과도 브릿지.
                shrink-0 으로 공간 부족해도 찌그러지지 않음. z-10 으로 위에 얹힘. */}
            {isTransit && (
              <div
                className={`relative z-10 shrink-0 flex items-center justify-center h-5 w-5 rounded-full border border-white shadow -mr-2 ${
                  i > 0 ? "-ml-2" : ""
                }`}
                style={{ backgroundColor: bg }}
                aria-hidden="true"
              >
                {s.kind === "bus" ? (
                  <Bus className="h-3 w-3 text-white" strokeWidth={2.5} />
                ) : (
                  <TramFront className="h-3 w-3 text-white" strokeWidth={2.5} />
                )}
              </div>
            )}
            <div
              style={{
                flex: `${s.durationSec} 1 0`,
                minWidth: "44px",
                backgroundColor: bg,
                color: textColor,
              }}
              className="h-4 flex items-center justify-center text-[10px] font-bold tabular-nums rounded-full"
            >
              {`${min}분`}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// 정류장 · 경로 상세 — 여행계획 상세페이지(plan-leg-card) 의 transit 렌더와 동일 포맷.
// 도보 step 은 생략, 각 transit step 을 "출발역 ➔ 도착역" + "[풀네임 배지들]" 2줄로.
function RouteStepsDetail({ steps }: { steps: TransportRouteStep[] }) {
  return (
    <div className="flex flex-col gap-2">
      {steps
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
              {/* 타이틀: 출발역 → 도착역 — plan-leg-card 와 완전히 동일 규격
                  (text-[10px] + font-normal + '→'). 화살표 문자도 일반 weight
                  '→' 사용 ('➔' 은 heavy arrow 라 볼드로 보임). */}
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
  );
}

// 지하철/기차/트램 정류장은 '역' 접미사가 빠지는 경우 보정. 버스는 그대로.
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

// plan-leg-card 의 배지 크기(h-4 px-1.5 text-[10px])와 맞춰 통일.
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

// ── 자동차 · 도보 · 수동 탭 ─────────────────────────────────
const DIRECT_MODES: { value: TransportMode; label: string; emoji: string }[] = [
  { value: "car", label: "자동차", emoji: "🚗" },
  { value: "walk", label: "도보", emoji: "🚶" },
];

function DirectTab({
  durations,
  selectedMode,
  legDeparture,
  manualValue,
  manualUnit,
  manualValid,
  onManualChange,
  onToggleUnit,
  onCommitManual,
  onPick,
}: {
  durations: Record<TransportMode, number | "loading" | null>;
  selectedMode: TransportMode | null;
  legDeparture: string | null;
  manualValue: string;
  manualUnit: "min" | "hour";
  manualValid: boolean;
  onManualChange: (v: string) => void;
  onToggleUnit: () => void;
  onCommitManual: () => void;
  onPick: (mode: TransportMode, durationSec: number | null) => void;
}) {
  // DirectTab 공용 grid — 수동 입력 row 와 자동차/도보 row 모두 같은 컬럼
  // 구조로 정렬(이모지 2.5rem 고정 col + 본문 flex-1 col + 우측 액션 col).
  // 이모지 세로 중앙 정렬 + 넉넉한 padding 으로 시각적 크기 확대.
  return (
    <div className="flex flex-col gap-1">
      {/* 수동 입력 */}
      <div className="grid grid-cols-[2.5rem_1fr_auto] gap-x-3 items-center rounded-md px-3 py-3">
        <span
          className="text-2xl text-center shrink-0"
          aria-hidden="true"
        >
          ✏️
        </span>
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-sm shrink-0">수동 입력</span>
          <div className="flex items-center h-9 rounded-md border bg-transparent overflow-hidden">
            <Input
              type="text"
              inputMode={manualUnit === "hour" ? "decimal" : "numeric"}
              value={manualValue}
              onChange={(e) => onManualChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onCommitManual();
                }
              }}
              placeholder={manualUnit === "hour" ? "시간" : "분"}
              className="h-full text-sm w-16 border-0 rounded-none focus-visible:ring-0 px-2 tabular-nums"
            />
            <button
              type="button"
              onClick={onToggleUnit}
              className="h-full px-2 text-xs font-medium border-l bg-muted/50 hover:bg-muted text-muted-foreground"
              title="분/시간 단위 전환"
            >
              {manualUnit === "hour" ? "시간" : "분"}
            </button>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          className="h-9 px-4 text-sm"
          disabled={!manualValid}
          onClick={onCommitManual}
        >
          저장
        </Button>
      </div>

      {DIRECT_MODES.map((m) => {
        const d = durations[m.value];
        const selected = selectedMode === m.value;
        const arrival =
          legDeparture && typeof d === "number"
            ? addMinutes(legDeparture, Math.max(1, Math.round(d / 60)))
            : null;
        const label =
          d === "loading"
            ? "계산 중…"
            : d === null
              ? "계산 실패"
              : formatDuration(d);
        return (
          <button
            key={m.value}
            type="button"
            onClick={() => onPick(m.value, typeof d === "number" ? d : null)}
            disabled={d === "loading"}
            className={`grid grid-cols-[2.5rem_1fr_auto] gap-x-3 gap-y-0.5 items-center rounded-md px-3 py-3 text-left transition-colors disabled:opacity-60 ${
              selected ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-accent"
            }`}
          >
            {/* Row 1: 이모지 | 소요시간·도착 | check (이모지는 두 행 가운데) */}
            <span
              className="text-2xl text-center row-start-1 row-span-2 self-center"
              aria-hidden="true"
            >
              {m.emoji}
            </span>
            <div className="row-start-1 col-start-2 flex items-center gap-2 text-sm text-muted-foreground tabular-nums min-w-0">
              <span
                className={
                  d === null ? "" : "font-semibold text-foreground text-base"
                }
              >
                {label}
              </span>
              {arrival && (
                <>
                  <span>·</span>
                  <span>도착 {arrival}</span>
                </>
              )}
            </div>
            <span className="row-start-1 col-start-3 row-span-2 flex items-center justify-center w-4">
              {selected && <Check className="h-5 w-5 text-primary" />}
            </span>
            {/* Row 2: 수단 라벨 */}
            <span className="row-start-2 col-start-2 text-xs text-muted-foreground">
              {m.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
