"use client";

import { useEffect, useMemo, useState } from "react";
import { useCurrentUserId } from "@/lib/current-user";

// 캘린더/여행/여행계획이 공유하는 "보이는 사용자" 필터.
// localStorage 에 영속 → 페이지 간 이동·새로고침 시에도 유지.
const VISIBLE_KEY = "calendar_visible_user_ids";

/**
 * @param initialIds 첫 진입 시(localStorage 비어있을 때) 기본으로 켤 user_id 목록.
 *   보통 useCalendarShares().viewableUserIds (본인 + 수락된 공유 owner) 를 넘김.
 *   생략하면 본인 ID 만 기본 ON.
 *
 *   ※ 사용자가 토글한 적 있다면 localStorage 우선 — 의도 보존.
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

  // initialIds 가 변경(공유 수락 등)되어도 안정적인 의존 키.
  const initialKey = useMemo(
    () => (initialIds && initialIds.length > 0 ? [...initialIds].sort().join(",") : ""),
    [initialIds],
  );

  // 최초 1회: 저장된 값 없으면 initialIds(viewable) 또는 본인.
  // 공유 수락이 늦게 도착해 initialIds 가 나중에 채워지는 경우도 대응 — 그 시점에
  // 처음 hydrate.
  useEffect(() => {
    if (visibleUserIds.length > 0) return;
    if (initialIds && initialIds.length > 0) {
      setVisibleUserIds(initialIds);
    } else if (currentUserId) {
      setVisibleUserIds([currentUserId]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, visibleUserIds.length, initialKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (visibleUserIds.length > 0) {
      try {
        localStorage.setItem(VISIBLE_KEY, JSON.stringify(visibleUserIds));
      } catch {}
    }
  }, [visibleUserIds]);

  const toggleVisible = (uid: string) => {
    setVisibleUserIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  return { visibleUserIds, setVisibleUserIds, toggleVisible };
}
