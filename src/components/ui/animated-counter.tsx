"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView } from "motion/react";

/**
 * 숫자 카운트 업 애니메이션 — 0 → value 까지 동그랗게 굴러가는 효과.
 *
 * 사용 예: <AnimatedCounter value={2590000} formatter={formatMoney} />
 *
 * - inView 일 때만 트리거 (보이지 않는 카드는 idle)
 * - prev value 에서 새 value 로 부드럽게 보간 (값 갱신 시에도 자연스럽게)
 * - prefers-reduced-motion 시 즉시 표시
 */
interface Props {
  value: number;
  /** 표시 포맷터 — 기본은 toLocaleString (천 단위 콤마). */
  formatter?: (n: number) => string;
  /** 애니메이션 시간(ms). 기본 700. */
  duration?: number;
  className?: string;
  /** 접두사 — 예: "+", "-". value 자체에 부호 안 넣고 분리. */
  prefix?: string;
}

export default function AnimatedCounter({
  value,
  formatter,
  duration = 700,
  className,
  prefix,
}: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(value);
  const inView = useInView(ref, { once: false, amount: 0.3 });
  const prevRef = useRef(value);

  useEffect(() => {
    if (!inView) return;
    // reduced-motion 환경에서는 즉시 갱신.
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      prevRef.current = value;
      return;
    }
    const from = prevRef.current;
    const controls = animate(from, value, {
      duration: duration / 1000,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
    });
    prevRef.current = value;
    return () => controls.stop();
  }, [value, inView, duration]);

  const fmt = formatter ?? ((n: number) => Math.round(n).toLocaleString("ko-KR"));
  return (
    <span ref={ref} className={className}>
      {prefix}
      {fmt(display)}
    </span>
  );
}
