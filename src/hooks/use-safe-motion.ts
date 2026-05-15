"use client";

import { useReducedMotion } from "motion/react";

/**
 * motion/react 기반 컴포넌트에서 시스템 "동작 줄이기" 설정 존중.
 *
 * globals.css 의 @media (prefers-reduced-motion: reduce) 글로벌 가드는
 * CSS transition 만 잡고 Framer 의 JS 애니메이션은 통과시킨다. iOS·macOS·
 * Android·Windows 모두 OS 레벨 "동작 줄이기" 설정이 있어 이 사용자들에겐
 * 모달 스크롤·월 슬라이드·spring 가 그대로 발화돼 어지러움 유발.
 *
 * 사용 예:
 *   const t = useSafeTransition({ duration: 0.48, ease: [0.22, 1, 0.36, 1] });
 *   <motion.div animate={{ x: 0 }} transition={t} />
 *
 * reduced=true 면 duration 0 + 즉시 적용으로 변환.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useSafeTransition<T extends Record<string, any>>(transition: T): T {
  const reduced = useReducedMotion();
  if (!reduced) return transition;
  // 즉시 적용 — type/spring 등 모든 키를 무시하고 duration 0 으로 덮어씀.
  // (스프링은 duration 만 0 으로 줄여도 끝까지 한 프레임에 도달.)
  return { ...transition, duration: 0, delay: 0 };
}

/**
 * 모션 비활성 여부만 알고 싶을 때 (값 자체를 분기하고 싶을 때 사용).
 * 예: 슬라이드 진입의 x 시작값을 reduced 면 0 으로 .
 */
export function useMotionEnabled(): boolean {
  return !useReducedMotion();
}
