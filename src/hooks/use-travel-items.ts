"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { TravelItem } from "@/types";
import { useCurrentUserId } from "@/lib/current-user";
import { useAutoRefetch } from "@/hooks/use-auto-refetch";

/**
 * visibleUserIds: 달력 탭에서 선택한 "볼 사용자들"
 *  - 전달 시 해당 사용자들의 여행 항목만 조회 (공유된 여행 포함)
 *  - 생략 시 내 항목만
 */
export function useTravelItems(visibleUserIds?: string[]) {
  const userId = useCurrentUserId();
  const [items, setItems] = useState<TravelItem[]>([]);
  const [loading, setLoading] = useState(true);

  // 의존성 안정화를 위해 join한 문자열 사용
  const visibleKey = visibleUserIds?.join(",") ?? "";

  const fetchItems = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("travel_items")
      .select("*")
      .order("visited")
      .order("created_at", { ascending: false });
    const filterIds = visibleUserIds && visibleUserIds.length > 0
      ? visibleUserIds
      : (userId ? [userId] : []);
    if (filterIds.length > 0) query = query.in("user_id", filterIds);
    const { data, error } = await query;
    if (error) {
      // user_id 컬럼이 없는 구버전 테이블 대비 fallback
      const fallback = await supabase
        .from("travel_items")
        .select("*")
        .order("visited")
        .order("created_at", { ascending: false });
      if (fallback.data) setItems(fallback.data);
    } else if (data) {
      setItems(data);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, visibleKey]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // 포그라운드 복귀·세션 refresh 시 재조회 — 공유자 변경사항 안정적 반영.
  useAutoRefetch(fetchItems);

  // month/color/visited_dates 컬럼이 없을 수 있어 fallback 처리
  const addItem = async (item: Omit<TravelItem, "id" | "created_at" | "updated_at">) => {
    // 세션 없거나 프로필 미생성 → RLS 위반 전에 명확한 에러
    if (!userId) {
      console.warn("[travel_items add] no currentUserId — session/profile not ready");
      return { error: { message: "로그인 정보가 없습니다. 새로고침 후 다시 시도하세요." } };
    }
    const { error } = await supabase
      .from("travel_items")
      .insert({ ...item, user_id: userId });
    if (!error) {
      await fetchItems();
      return { error: null };
    }
    console.warn("[travel_items add] 1차 실패:", error.message, error.code);
    // 컬럼 미존재(구버전 스키마) 대비 retry — user_id 는 반드시 유지해야 RLS 통과
    const { month, color, visited_dates, place_name, address, lat, lng, places, ...rest } = item;
    void month; void color; void visited_dates; void place_name; void address; void lat; void lng; void places;
    const { error: retry } = await supabase
      .from("travel_items")
      .insert({ ...rest, user_id: userId });
    if (retry) {
      console.warn("[travel_items add] 2차 실패:", retry.message, retry.code);
    } else {
      await fetchItems();
    }
    return { error: retry };
  };

  const updateItem = async (id: string, updates: Partial<Omit<TravelItem, "id" | "created_at">>) => {
    // 낙관적 업데이트 — 자주 쓰는 mutation 이라 round-trip 대기 없이 즉시 UI 반영.
    // 실패 시 fetchItems() 로 서버 진실값 복원.
    const now = new Date().toISOString();
    const prev = items;
    setItems((cur) => cur.map((it) => (it.id === id ? { ...it, ...updates, updated_at: now } : it)));
    const { error } = await supabase
      .from("travel_items")
      .update({ ...updates, updated_at: now })
      .eq("id", id);
    if (error) {
      console.warn("[travel_items update] 1차 실패:", error.message, error.code);
      // DB 에 아직 없을 수 있는 컬럼 모두 제거 후 재시도 (마이그레이션 빠진 환경).
      const {
        month, color, visited_dates, place_name, address, lat, lng,
        mood, price_tier, rating, couple_notes, cover_image_url,
        places,
        ...rest
      } = updates;
      void month; void color; void visited_dates; void place_name; void address; void lat; void lng;
      void mood; void price_tier; void rating; void couple_notes; void cover_image_url; void places;
      const { error: retry } = await supabase
        .from("travel_items")
        .update({ ...rest, updated_at: now })
        .eq("id", id);
      if (retry) {
        console.warn("[travel_items update] 2차 실패:", retry.message, retry.code);
        setItems(prev); // 롤백
      } else {
        await fetchItems();
      }
      return { error: retry };
    }
    return { error: null };
  };

  const deleteItem = async (id: string) => {
    // 낙관적 — 즉시 리스트에서 제거. 실패 시 복원.
    const prev = items;
    setItems((cur) => cur.filter((it) => it.id !== id));
    const { error } = await supabase.from("travel_items").delete().eq("id", id);
    if (error) {
      setItems(prev);
    }
    return { error };
  };

  /**
   * "가본 곳" 토글 — optimistic 업데이트.
   * 가장 자주 누르는 액션이라 round-trip 지연이 체감 큼. 로컬 즉시 반영 후
   * 서버 실패 시 롤백. updateItem 처럼 fetchItems 안 함.
   */
  const toggleVisited = async (id: string, visited: boolean) => {
    const next = !visited;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, visited: next, updated_at: now } : it)));
    const { error } = await supabase
      .from("travel_items")
      .update({ visited: next, updated_at: now })
      .eq("id", id);
    if (error) {
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, visited } : it)));
    }
    return { error };
  };

  return { items, loading, addItem, updateItem, deleteItem, toggleVisited, refetch: fetchItems };
}
