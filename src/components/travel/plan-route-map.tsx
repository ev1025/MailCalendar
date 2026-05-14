"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

// 여러 마커 + 선택적 폴리라인(자가용 경로 path 있을 때)을 표시하는 지도.
// Phase A의 naver-map.tsx는 단일 좌표 전용이라, 경로맵 전용 컴포넌트 분리.

interface MapPin {
  lat: number;
  lng: number;
  label?: string;
}

// 구간(leg) 한 개 — 실제 path 있으면 실선, 없으면 인접 핀 사이 점선.
// 이 구조로 바꾸면서 "1→2 만 이어지고 2→3 부터는 끊김" 버그 해결.
interface MapLeg {
  fromIdx: number;  // pins 배열 내 출발 핀 인덱스
  toIdx: number;    // pins 배열 내 도착 핀 인덱스
  path?: [number, number][]; // 있으면 실선, 없으면 점선 fallback
  strokeColor?: string;      // 모드·지하철 호선별 색상 (없으면 기본 파랑)
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
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // 지도 인스턴스 레퍼런스 — 1회만 생성해 증분 업데이트.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // map 생성 완료를 state 로 노출해 pins/legs 이펙트 재실행 보장.
  const [mapReady, setMapReady] = useState(false);
  // Alt+휠 리스너 해제용
  const cleanupRef = useRef<(() => void) | null>(null);

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

    // bounds 로 화면 맞춤
    if (pins.length > 1) {
      const bounds = new naver.maps.LatLngBounds(
        new naver.maps.LatLng(pins[0].lat, pins[0].lng),
        new naver.maps.LatLng(pins[0].lat, pins[0].lng)
      );
      for (const p of pins) bounds.extend(new naver.maps.LatLng(p.lat, p.lng));
      map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
    } else if (pins.length === 1) {
      map.setCenter(new naver.maps.LatLng(pins[0].lat, pins[0].lng));
      map.setZoom(13);
    }

    // 번호 마커
    for (let i = 0; i < pins.length; i++) {
      const p = pins[i];
      const marker = new naver.maps.Marker({
        position: new naver.maps.LatLng(p.lat, p.lng),
        map,
        title: p.label,
        icon: {
          content:
            `<div style="background:#3b82f6;color:#fff;border-radius:50%;width:24px;height:24px;` +
            `display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;` +
            `box-shadow:0 1px 3px rgba(0,0,0,0.3);">${i + 1}</div>`,
          anchor: new naver.maps.Point(12, 12),
        },
      });
      overlays.push(marker);
    }

    // 구간 선
    for (const leg of legs ?? []) {
      const from = pins[leg.fromIdx];
      const to = pins[leg.toIdx];
      if (!from || !to) continue;
      const hasPath = leg.path && leg.path.length > 1;
      const solidColor = leg.strokeColor ?? "#3b82f6";
      const line = hasPath
        ? new naver.maps.Polyline({
            path: leg.path!.map((pt) => new naver.maps.LatLng(pt[1], pt[0])),
            strokeColor: solidColor,
            strokeOpacity: 0.9,
            strokeWeight: 4,
            map,
          })
        : new naver.maps.Polyline({
            path: [
              new naver.maps.LatLng(from.lat, from.lng),
              new naver.maps.LatLng(to.lat, to.lng),
            ],
            strokeColor: "#94a3b8",
            strokeOpacity: 0.8,
            strokeWeight: 2,
            strokeStyle: "shortdash",
            map,
          });
      overlays.push(line);
    }

    // cleanup — 이 렌더에서 만든 overlay 만 제거. 다음 렌더에서 새 overlay 셋 생성.
    return () => {
      for (const o of overlays) {
        try { o.setMap(null); } catch { /* ignore */ }
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
      </div>
    </>
  );
}
