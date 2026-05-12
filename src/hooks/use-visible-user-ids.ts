"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCurrentUserId } from "@/lib/current-user";

// 캘린더/여행/여행계획이 공유하는 "보이는 사용자" 필터.
// localStorage 에 영속 → 페이지 간 이동·새로고침 시에도 유지.
const VISIBLE_KEY = "calendar_visible_user_ids";

/**
 * @param initialIds 보통 useCalendarShares().viewableUserIds (본인 + 양방향
 *   accepted 공유자). 기본값 + 자동 추가 둘 다에 사용됨.
 *
 * 동작:
 *  1. localStorage 비어 있음 → initialIds(있으면) 또는 [본인] 로 초기화.
 *  2. initialIds 가 변경되어 새로운 user_id 가 등장하면 자동으로 visibleUserIds 에
 *     추가 (= 새 share 수락 시 즉시 그 사람 일정 노출).
 *  3. 사용자가 토글로 끈 user 는 다시 자동 ON 안 됨 — 토글 의도 보존.
 *     (동작 2/3 동시 만족: 처음 본 user 만 자동 추가, "끈 user 기억"은 별도 set.)
 */
export function useVisibleUserIds(initialIds?: string[]) {
  const currentUserId = useCurrentUserId();

  const [visibleUserIds, setVisibleUserIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(VISIBLE_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  // 사용자가 명시적으로 토글로 끈 user 들 — 자동 ON 대상에서 제외.
  // (탭 닫으면 잊힘. 영속화 안 함 — 너무 보수적이면 신규 share 자동 노출이 무용.)
  const explicitlyOffRef = useRef<Set<string>>(new Set());

  // initialIds 의 안정적 직렬화 키.
  const initialKey = useMemo(
    () =>
      initialIds && initialIds.length > 0
        ? [...initialIds].sort().join(",")
        : "",
    [initialIds],
  );

  // 첫 hydrate + initialIds 변동 시 새로운 user 자동 추가.
  useEffect(() => {
    setVisibleUserIds((prev) => {
      // 첫 hydrate.
      if (prev.length === 0) {
        if (initialIds && initialIds.length > 0) return initialIds;
        if (currentUserId) return [currentUserId];
        return prev;
      }
      // initialIds 의 새 user 자동 추가 — 단 explicitlyOff 에 든 건 제외.
      const offSet = explicitlyOffRef.current;
      const next = [...prev];
      let changed = false;
      for (const id of initialIds ?? []) {
        if (!next.includes(id) && !offSet.has(id)) {
          next.push(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, initialKey]);

  // localStorage persist. (useEffect 는 브라우저에서만 실행 → typeof window 가드 불필요.)
  useEffect(() => {
    if (visibleUserIds.length === 0) return;
    try {
      localStorage.setItem(VISIBLE_KEY, JSON.stringify(visibleUserIds));
    } catch {}
  }, [visibleUserIds]);

  const toggleVisible = (uid: string) => {
    setVisibleUserIds((prev) => {
      if (prev.includes(uid)) {
        // 사용자가 끔 → "explicitlyOff" 에 기록 → 자동 ON 안 됨.
        explicitlyOffRef.current.add(uid);
        return prev.filter((id) => id !== uid);
      }
      // 다시 켬 → off set 에서 제거.
      explicitlyOffRef.current.delete(uid);
      return [...prev, uid];
    });
  };

  return { visibleUserIds, setVisibleUserIds, toggleVisible };
}
