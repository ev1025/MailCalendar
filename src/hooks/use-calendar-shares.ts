"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCurrentUserId, useAppUsers } from "@/lib/current-user";
import { notifyUsers } from "./use-notifications";

// 공유자 목록은 자주 안 바뀌므로 localStorage 사용 — 브라우저 재시작 후에도
// 첫 렌더부터 칩이 노출돼 캘린더가 밀리는 jank 완전 제거.
function loadShareCache(userId: string): CalendarShare[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`cal-shares:${userId}`);
    return raw ? (JSON.parse(raw) as CalendarShare[]) : null;
  } catch {
    return null;
  }
}
function saveShareCache(userId: string, shares: CalendarShare[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`cal-shares:${userId}`, JSON.stringify(shares));
  } catch {
    // ignore quota
  }
}

export interface CalendarShare {
  id: string;
  owner_id: string;
  viewer_id: string;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
}

export function useCalendarShares() {
  const currentUserId = useCurrentUserId();
  const { users } = useAppUsers();

  // localStorage 캐시 — 첫 렌더부터 즉시 hydrate → 칩 영역이 한 번에 보임.
  const [shares, setShares] = useState<CalendarShare[]>(
    () => (currentUserId ? loadShareCache(currentUserId) ?? [] : []),
  );
  const [loading, setLoading] = useState(
    () => !currentUserId || loadShareCache(currentUserId) === null,
  );

  const fetchShares = useCallback(async () => {
    if (!currentUserId) {
      setShares([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("calendar_shares")
      .select("*")
      .or(`owner_id.eq.${currentUserId},viewer_id.eq.${currentUserId}`);
    if (!error && data) {
      setShares(data as CalendarShare[]);
      saveShareCache(currentUserId, data as CalendarShare[]);
    }
    setLoading(false);
  }, [currentUserId]);

  // 사용자 변경 시 캐시 hydrate.
  useEffect(() => {
    if (!currentUserId) return;
    const cached = loadShareCache(currentUserId);
    if (cached) {
      setShares(cached);
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    fetchShares();
  }, [fetchShares]);

  // 내가 공유한 사람 목록 (내가 owner)
  const outgoing = shares.filter((s) => s.owner_id === currentUserId);
  // 나에게 공유 제안이 온 목록 (내가 viewer)
  const incoming = shares.filter((s) => s.viewer_id === currentUserId);

  // 내가 볼 수 있는 사용자 (수락된 공유자 owner들 + 나 자신)
  const viewableUserIds = Array.from(
    new Set([
      ...(currentUserId ? [currentUserId] : []),
      ...incoming
        .filter((s) => s.status === "accepted")
        .map((s) => s.owner_id),
    ])
  );

  const invite = async (viewerId: string) => {
    if (!currentUserId || viewerId === currentUserId) return { error: "self" };
    // 이미 초대됐는지 확인
    const existing = outgoing.find((s) => s.viewer_id === viewerId);
    if (existing) {
      return { error: "already invited" };
    }
    const { error } = await supabase.from("calendar_shares").insert({
      owner_id: currentUserId,
      viewer_id: viewerId,
      status: "pending",
    });
    if (error) return { error };

    const myName = users.find((u) => u.id === currentUserId)?.name || "누군가";
    await notifyUsers(
      [viewerId],
      currentUserId,
      "calendar_share_request",
      `${myName}님이 캘린더를 공유했어요`,
      "수락하면 상대 일정이 내 캘린더에 표시됩니다",
      `/calendar`
    );

    await fetchShares();
    return { error: null };
  };

  const accept = async (shareId: string) => {
    const { error } = await supabase
      .from("calendar_shares")
      .update({ status: "accepted" })
      .eq("id", shareId);
    if (!error) await fetchShares();
    return { error };
  };

  const reject = async (shareId: string) => {
    const { error } = await supabase
      .from("calendar_shares")
      .update({ status: "rejected" })
      .eq("id", shareId);
    if (!error) await fetchShares();
    return { error };
  };

  const cancel = async (shareId: string) => {
    const { error } = await supabase
      .from("calendar_shares")
      .delete()
      .eq("id", shareId);
    if (!error) await fetchShares();
    return { error };
  };

  return {
    shares,
    outgoing,
    incoming,
    viewableUserIds,
    loading,
    invite,
    accept,
    reject,
    cancel,
    refetch: fetchShares,
  };
}
