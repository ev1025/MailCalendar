"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { MapPin as MapPinIcon, Plus, Minus, Maximize } from "lucide-react";
import { formatMinutes } from "@/lib/travel/providers";

// 여러 마커 + 선택적 폴리라인(자가용 경로 path 있을 때)을 표시하는 지도.
// Phase A의 naver-map.tsx는 단일 좌표 전용이라, 경로맵 전용 컴포넌트 분리.

interface MapPin {
  lat: number;
  lng: number;
  label?: string;
  /** 일자별 색 구분에 사용 — 중간 마커 색이 day palette 인덱스로 결정. */
  dayIndex?: number;
  /** 양방향 하이라이트(맵 ↔ 일정 행) 연결용. */
  taskId?: string;
  /** task.start_time ("HH:MM:SS"/"HH:MM"/null) — InfoWindow 표시용. */
  time?: string | null;
  /** 다음 task 까지 이동시간(초) — InfoWindow 의 "다음까지 N분" 표시용. */
  nextDurationSec?: number | null;
}

// InfoWindow 의 HTML 컨텐츠 — XSS 방지용 단순 escape.
function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// "HH:MM:SS"/"HH:MM" → "HH:MM"
function pinTime(t: string | null | undefined): string {
  if (!t) return "";
  return t.length >= 5 ? t.slice(0, 5) : t;
}

// 구간(leg) 한 개 — 실제 path 있으면 실선, 없으면 인접 핀 사이 점선.
// 이 구조로 바꾸면서 "1→2 만 이어지고 2→3 부터는 끊김" 버그 해결.
interface MapLeg {
  fromIdx: number;  // pins 배열 내 출발 핀 인덱스
  toIdx: number;    // pins 배열 내 도착 핀 인덱스
  path?: [number, number][]; // 있으면 실선, 없으면 점선 fallback
  strokeColor?: string;      // 모드·지하철 호선별 색상 (없으면 기본 파랑)
  /** car / walk / bus / subway / train / taxi / null — 선 dash 스타일·굵기 결정. */
  mode?: string | null;
}

// 일자별 마커 색 — start/end(초록/빨강) 와 충돌 안 하는 7색 팔레트. 8일 이상이면 cycle.
const DAY_COLORS = ["#3b82f6", "#a855f7", "#f97316", "#06b6d4", "#eab308", "#6366f1", "#ec4899"];

function pinColorForDay(dayIndex: number | undefined): string {
  if (dayIndex == null) return "#3b82f6";
  return DAY_COLORS[dayIndex % DAY_COLORS.length];
}

// 이동수단별 선 스타일 — 도보·대중교통은 점선, 자가용·택시는 실선.
function legStrokeStyle(mode: string | null | undefined): { dash: string | null; weight: number } {
  if (mode === "walk") return { dash: "shortdash", weight: 3 };
  if (mode === "bus" || mode === "subway") return { dash: "shortdash", weight: 4 };
  if (mode === "train") return { dash: "longdash", weight: 4 };
  return { dash: null, weight: 4 };
}

interface Props {
  pins: MapPin[];
  // 각 leg 별 경로 정보. 없으면 인접 핀 점선 연결 안 함.
  legs?: MapLeg[];
  height?: number;
  // Tailwind 클래스로 반응형 높이 지정 시 사용(예: "h-60 md:h-[28rem]").
  // 지정되면 height prop 보다 우선.
  heightClass?: string;
  className?: string;
  /** 경로별 모드 선택 시 상단에 띄울 정보 — 이동수단·소요시간. */
  legInfo?: { mode: string | null; durationSec: number | null };
}

// 모드 한글 라벨 + 이모지 — leg info chip 표시용.
function modeLabel(mode: string | null | undefined): string {
  switch (mode) {
    case "car": return "🚗 자가용";
    case "walk": return "🚶 도보";
    case "bus": return "🚌 버스";
    case "subway": return "🚇 지하철";
    case "train": return "🚆 기차";
    case "taxi": return "🚕 택시";
    default: return "이동수단 미정";
  }
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    naver?: any;
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_NCP_MAP_CLIENT_ID;

export default function PlanRouteMap({
  pins,
  legs,
  height = 240,
  heightClass,
  className,
  legInfo,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // 지도 인스턴스 레퍼런스 — 1회만 생성해 증분 업데이트.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // map 생성 완료를 state 로 노출해 pins/legs 이펙트 재실행 보장.
  const [mapReady, setMapReady] = useState(false);
  // Alt+휠 리스너 해제용
  const cleanupRef = useRef<(() => void) | null>(null);
  // 첫 fitBounds 는 snap, 이후 segment 변경 시엔 부드럽게 panTo — 동선이 어디로 가는지 인지에 도움.
  const firstFitRef = useRef(true);
  // 마커 클릭 시 띄우는 InfoWindow — 인스턴스는 1개 공유(다른 핀 클릭 시 setContent + reopen).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoWindowRef = useRef<any>(null);

  // 지도 인터렉션은 기본 활성 — 드래그 pan / pinch zoom / ctrl+wheel zoom 가능.
  // scrollWheel=false 로 일반 스크롤 캡처만 막음 → 페이지 스크롤 자연스러움.

  // 지도 1회만 생성. pins/legs 변경 시 오버레이만 교체 → 지도 깜빡임 제거.
  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const init = () => {
      if (cancelled || !containerRef.current) return;
      const naver = window.naver;
      if (!naver?.maps) {
        timer = setTimeout(init, 50);
        return;
      }
      if (mapRef.current) {
        setMapReady(true);
        return;
      }
      mapRef.current = new naver.maps.Map(containerRef.current, {
        center: new naver.maps.LatLng(37.5665, 126.978),
        zoom: 13,
        zoomControl: false,
        scaleControl: false,
        mapDataControl: false,
        logoControl: false,
        scrollWheel: false,
        // 모바일 두 손가락 핀치 줌(기본값이지만 명시).
        pinchZoom: true,
      });
      setMapReady(true);
      // 데스크톱: Alt/Ctrl/⌘+휠로 줌. 일반 휠은 페이지 스크롤 유지.
      const map = mapRef.current;
      const onWheel = (e: WheelEvent) => {
        if (!e.altKey && !e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        const step = e.deltaY < 0 ? 1 : -1;
        const next = Math.min(21, Math.max(6, map.getZoom() + step));
        map.setZoom(next, true);
      };
      const wheelEl = containerRef.current;
      wheelEl.addEventListener("wheel", onWheel, { passive: false });
      cleanupRef.current = () => wheelEl.removeEventListener("wheel", onWheel);
      // NAVER 로고 DOM 제거 (지도 생성 직후·200ms·800ms 3중 보험)
      const killLogos = () => {
        if (!containerRef.current) return;
        containerRef.current
          .querySelectorAll("a[target=\"_blank\"]")
          .forEach((a) => ((a as HTMLElement).style.display = "none"));
      };
      killLogos();
      setTimeout(killLogos, 200);
      setTimeout(killLogos, 800);
    };

    init();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []); // 지도는 1회만 생성

  // pins · legs 변경 시 기존 오버레이 제거 후 새로 그리기 — 지도 자체는 유지.
  // cleanup 함수에서 이 렌더에서 만든 overlays 를 확실히 정리해 stale path 잔존 방지.
  useEffect(() => {
    const map = mapRef.current;
    const naver = window.naver;
    if (!mapReady || !map || !naver?.maps) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const overlays: any[] = [];

    // bounds 로 화면 맞춤. 첫 fit 은 snap(initial mount 자연스럽게), 이후 segment 변경 등은
    // panToBounds 로 부드럽게(존재하면) — Naver Maps v3 미지원 시 fitBounds 폴백.
    const padding = { top: 40, right: 40, bottom: 40, left: 40 };
    if (pins.length > 1) {
      const bounds = new naver.maps.LatLngBounds(
        new naver.maps.LatLng(pins[0].lat, pins[0].lng),
        new naver.maps.LatLng(pins[0].lat, pins[0].lng)
      );
      for (const p of pins) bounds.extend(new naver.maps.LatLng(p.lat, p.lng));
      if (firstFitRef.current) {
        map.fitBounds(bounds, padding);
        firstFitRef.current = false;
      } else if (typeof map.panToBounds === "function") {
        map.panToBounds(bounds, padding);
      } else {
        map.fitBounds(bounds, padding);
      }
    } else if (pins.length === 1) {
      // 단일 핀: 부드럽게 panTo (firstFitRef 도 소비).
      const c = new naver.maps.LatLng(pins[0].lat, pins[0].lng);
      if (firstFitRef.current) {
        map.setCenter(c);
        map.setZoom(13);
        firstFitRef.current = false;
      } else if (typeof map.panTo === "function") {
        map.panTo(c);
      } else {
        map.setCenter(c);
      }
    }

    // 마커 — 출발(첫 핀, 초록 ▶) / 도착(마지막 핀, 빨강 ■) / 중간(일자별 색 + 번호).
    for (let i = 0; i < pins.length; i++) {
      const p = pins[i];
      const isStart = i === 0;
      // 핀이 1개뿐이면 출발만 (도착 없음).
      const isEnd = pins.length > 1 && i === pins.length - 1;
      const bg = isStart ? "#22c55e" : isEnd ? "#ef4444" : pinColorForDay(p.dayIndex);
      const glyph = isStart
        ? '<svg width="9" height="9" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>'
        : isEnd
          ? '<svg width="8" height="8" viewBox="0 0 24 24" fill="#fff"><rect x="4" y="4" width="16" height="16" rx="1"/></svg>'
          : String(i + 1);
      const marker = new naver.maps.Marker({
        position: new naver.maps.LatLng(p.lat, p.lng),
        map,
        title: p.label,
        icon: {
          content:
            `<div style="background:${bg};color:#fff;border-radius:50%;width:24px;height:24px;` +
            `display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;` +
            `box-shadow:0 1px 3px rgba(0,0,0,0.3);">${glyph}</div>`,
          anchor: new naver.maps.Point(12, 12),
        },
      });
      // 클릭 → InfoWindow (장소·일차·시간·다음까지 N분). 인스턴스는 lazy 생성, 1개 공유.
      naver.maps.Event.addListener(marker, "click", () => {
        if (!infoWindowRef.current) {
          infoWindowRef.current = new naver.maps.InfoWindow({
            content: "",
            maxWidth: 240,
            backgroundColor: "transparent",
            borderWidth: 0,
            borderColor: "transparent",
            disableAnchor: true,
            pixelOffset: new naver.maps.Point(0, -8),
          });
        }
        const t = pinTime(p.time);
        const next = typeof p.nextDurationSec === "number" && p.nextDurationSec > 0
          ? `다음까지 ${escHtml(formatMinutes(Math.round(p.nextDurationSec / 60)))}`
          : "";
        const meta = [
          p.dayIndex != null ? `${p.dayIndex + 1}일차` : "",
          t ? escHtml(t) : "",
        ].filter(Boolean).join(" · ");
        infoWindowRef.current.setContent(
          `<div style="background:var(--card,#fff);color:var(--card-foreground,#0f172a);border:1px solid var(--border,#e5e7eb);border-radius:8px;padding:8px 10px;font-size:11px;line-height:1.4;min-width:140px;max-width:220px;box-shadow:0 4px 12px rgba(0,0,0,0.12);font-family:inherit;">` +
            `<div style="font-weight:600;font-size:12px;">${escHtml(p.label || "")}</div>` +
            (meta ? `<div style="color:var(--muted-foreground,#64748b);margin-top:2px;">${meta}</div>` : "") +
            (next ? `<div style="color:var(--muted-foreground,#94a3b8);margin-top:2px;">${next}</div>` : "") +
            `</div>`,
        );
        infoWindowRef.current.open(map, marker);
      });
      overlays.push(marker);
    }

    // 구간 선 — 이동수단별 색·dash 스타일. path 있으면 그대로, 없으면 두 핀 직선.
    for (const leg of legs ?? []) {
      const from = pins[leg.fromIdx];
      const to = pins[leg.toIdx];
      if (!from || !to) continue;
      const hasPath = !!leg.path && leg.path.length > 1;
      const { dash, weight } = legStrokeStyle(leg.mode);
      // 모드 색 우선 → 모드 없으면 회색(미정 fallback).
      const color = leg.strokeColor ?? (leg.mode ? "#3b82f6" : "#94a3b8");
      const lineWeight = hasPath ? weight : leg.mode ? weight : 2;
      const lineStyle = dash ?? (hasPath ? "solid" : "shortdash");
      const path = hasPath
        ? leg.path!.map((pt) => new naver.maps.LatLng(pt[1], pt[0]))
        : [
            new naver.maps.LatLng(from.lat, from.lng),
            new naver.maps.LatLng(to.lat, to.lng),
          ];
      const line = new naver.maps.Polyline({
        path,
        strokeColor: color,
        strokeOpacity: hasPath ? 0.9 : 0.8,
        strokeWeight: lineWeight,
        strokeStyle: lineStyle,
        map,
      });
      overlays.push(line);
    }

    // cleanup — 이 렌더에서 만든 overlay 만 제거. 다음 렌더에서 새 overlay 셋 생성.
    // InfoWindow 도 닫음(stale 마커 anchor 잔존 방지).
    return () => {
      for (const o of overlays) {
        try { o.setMap(null); } catch { /* ignore */ }
      }
      if (infoWindowRef.current) {
        try { infoWindowRef.current.close(); } catch { /* ignore */ }
      }
    };
  }, [mapReady, pins, legs]);

  if (!CLIENT_ID) {
    return (
      <div
        className={`flex items-center justify-center rounded-md bg-muted/40 text-xs text-muted-foreground ${heightClass ?? ""} ${className || ""}`}
        style={heightClass ? undefined : { height }}
      >
        NEXT_PUBLIC_NCP_MAP_CLIENT_ID 미설정
      </div>
    );
  }

  // 컨트롤 버튼 핸들러 — map 인스턴스에 직접 위임. 부드러운 setZoom(true)·panTo 사용.
  const handleZoomIn = () => {
    const m = mapRef.current;
    if (m) m.setZoom(Math.min(21, m.getZoom() + 1), true);
  };
  const handleZoomOut = () => {
    const m = mapRef.current;
    if (m) m.setZoom(Math.max(6, m.getZoom() - 1), true);
  };
  const handleResetView = () => {
    const m = mapRef.current;
    const naver = window.naver;
    if (!m || !naver?.maps || pins.length === 0) return;
    if (pins.length > 1) {
      const bounds = new naver.maps.LatLngBounds(
        new naver.maps.LatLng(pins[0].lat, pins[0].lng),
        new naver.maps.LatLng(pins[0].lat, pins[0].lng),
      );
      for (const p of pins) bounds.extend(new naver.maps.LatLng(p.lat, p.lng));
      const padding = { top: 40, right: 40, bottom: 40, left: 40 };
      if (typeof m.panToBounds === "function") m.panToBounds(bounds, padding);
      else m.fitBounds(bounds, padding);
    } else {
      const c = new naver.maps.LatLng(pins[0].lat, pins[0].lng);
      if (typeof m.panTo === "function") m.panTo(c);
      else m.setCenter(c);
    }
  };
  const ctrlBtnCls =
    "flex h-7 w-7 items-center justify-center rounded-md bg-background/90 text-foreground shadow-sm ring-1 ring-foreground/10 backdrop-blur transition-colors hover:bg-background";

  return (
    <>
      <Script
        src={`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${CLIENT_ID}`}
        strategy="afterInteractive"
      />
      <div className={`naver-map-host relative ${className || ""}`}>
        <div
          ref={containerRef}
          className={`rounded-md overflow-hidden ${heightClass ?? ""}`}
          style={heightClass ? undefined : { height }}
        />
        {/* leg info chip — 경로별 모드에서 상단 중앙에 모드·소요시간 노출 */}
        {legInfo && pins.length > 0 && (
          <div className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-full bg-background/95 px-3 py-1 text-[11px] font-medium shadow-md ring-1 ring-foreground/10 backdrop-blur">
            {modeLabel(legInfo.mode)}
            {typeof legInfo.durationSec === "number" && legInfo.durationSec > 0 && (
              <span className="text-muted-foreground"> · {formatMinutes(Math.round(legInfo.durationSec / 60))}</span>
            )}
          </div>
        )}
        {/* 줌·전체보기 컨트롤 — 우상단 (pins 가 있을 때만) */}
        {pins.length > 0 && (
          <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
            <button type="button" onClick={handleZoomIn} aria-label="확대" title="확대" className={ctrlBtnCls}>
              <Plus className="h-3.5 w-3.5" strokeWidth={2.2} />
            </button>
            <button type="button" onClick={handleZoomOut} aria-label="축소" title="축소" className={ctrlBtnCls}>
              <Minus className="h-3.5 w-3.5" strokeWidth={2.2} />
            </button>
            <button type="button" onClick={handleResetView} aria-label="전체 보기" title="전체 보기" className={ctrlBtnCls}>
              <Maximize className="h-3.5 w-3.5" strokeWidth={2.2} />
            </button>
          </div>
        )}
        {/* 빈 상태 — 지도 위에 오버레이로 깔아 map 인스턴스 라이프사이클은 유지. */}
        {pins.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 rounded-md bg-muted/70 text-center text-muted-foreground backdrop-blur-sm">
            <MapPinIcon className="h-6 w-6 opacity-60" strokeWidth={1.6} />
            <p className="text-xs font-medium">아직 장소가 없어요</p>
            <p className="text-[11px] text-muted-foreground/70">아래 &quot;일정 추가&quot;로 장소를 골라주세요</p>
          </div>
        )}
      </div>
    </>
  );
}
