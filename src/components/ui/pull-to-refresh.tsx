"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Loader2, ArrowDown } from "lucide-react";

/**
 * 모바일 pull-to-refresh — 스크롤이 최상단(scrollTop=0)인 상태에서 아래로 끌면
 * 인디케이터가 나타나고, threshold 넘어 떼면 onRefresh 호출.
 *
 * 자식 콘텐츠는 그대로 흐름 유지 — 이 컴포넌트는 부모 wrapper 만 추가하고
 * 인디케이터를 absolute 로 띄움.
 *
 * 데스크톱은 마우스 휠 스크롤이 별도 — 여기선 모바일 터치만 처리.
 */
interface Props {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
  /** 트리거 임계값 (px). 기본 70. */
  threshold?: number;
  /** 인디케이터 색상. 기본 currentColor. */
  className?: string;
  /** 스크롤 가능한 외부 컨테이너 — 미지정 시 이 컴포넌트 자체가 컨테이너. */
  scrollableSelector?: string;
}

export default function PullToRefresh({
  onRefresh,
  children,
  threshold = 70,
  className,
  scrollableSelector,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const scrollable = scrollableSelector
      ? (document.querySelector(scrollableSelector) as HTMLElement | null) ?? el
      : el;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshing) return;
      // 스크롤 최상단에서만 트리거.
      if (scrollable.scrollTop > 0) return;
      startYRef.current = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (refreshing || startYRef.current == null) return;
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy <= 0) {
        setPull(0);
        return;
      }
      // 저항감 — 실제 손가락 이동의 50% 만 따라감.
      const resisted = Math.min(dy * 0.5, threshold * 1.6);
      setPull(resisted);
    };
    const onTouchEnd = async () => {
      const startY = startYRef.current;
      startYRef.current = null;
      if (startY == null) return;
      const reachedThreshold = pull >= threshold;
      if (reachedThreshold) {
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }
      setPull(0);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [onRefresh, threshold, pull, refreshing, scrollableSelector]);

  const ready = pull >= threshold;
  const indicatorY = refreshing ? threshold : pull;
  const opacity = Math.min(pull / threshold, 1);

  // 아이콘 스케일 — pull 진행률에 비례. ready 상태일 때 1.2 로 살짝 부풀음.
  const iconScale = ready ? 1.2 : 0.6 + Math.min(pull / threshold, 1) * 0.4;

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      {/* 인디케이터 — absolute 로 떠 있어 콘텐츠 흐름 영향 없음.
          높이/opacity 는 손가락 이동에 즉각 반응(transition X), 릴리즈/리프레시
          시작 시점에만 spring 으로 자리잡음. */}
      <div
        aria-hidden={!refreshing && pull === 0}
        className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-center justify-center md:hidden"
        style={{
          height: indicatorY,
          opacity,
          transition: refreshing || pull === 0 ? "height 250ms cubic-bezier(0.34,1.56,0.64,1), opacity 200ms ease-out" : undefined,
        }}
      >
        {refreshing ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <motion.div
            animate={{ scale: iconScale, rotate: ready ? 180 : 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 22 }}
          >
            <ArrowDown
              className={`h-4 w-4 transition-colors ${
                ready ? "text-primary" : "text-muted-foreground"
              }`}
            />
          </motion.div>
        )}
      </div>
      {children}
    </div>
  );
}
