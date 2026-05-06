"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCurrentUserId } from "@/lib/current-user";

/**
 * 여행 분류 — Supabase travel_categories 테이블에서 조회/관리.
 * 이전엔 localStorage 였으나 디바이스 동기화 위해 DB 로 이전.
 *
 * 빌트인 vs 사용자 추가 구분: is_builtin 컬럼.
 * 시드(자연/숙소/식당/놀거리/데이트/공연/쇼핑)는 SQL 마이그레이션에서 모든 기존 유저에게 INSERT.
 */

interface TravelCategoryRow {
  id: string;
  name: string;
  color: string;
  is_builtin: boolean;
  sort_order?: number;
}

const DEFAULT_SEED: { name: string; color: string; sort_order: number }[] = [
  { name: "자연",   color: "#22C55E", sort_order: 0 },
  { name: "숙소",   color: "#A855F7", sort_order: 1 },
  { name: "식당",   color: "#F50B0B", sort_order: 2 },
  { name: "놀거리", color: "#3B82F6", sort_order: 3 },
  { name: "데이트", color: "#EC4899", sort_order: 4 },
  { name: "공연",   color: "#E1D04E", sort_order: 5 },
  { name: "쇼핑",   color: "#06B6D4", sort_order: 6 },
];

/** 빌트인 카테고리 이름 — 컴포넌트가 builtinIds 로 전달할 때 사용. 시드와 동기화. */
export const BUILTIN_TRAVEL_CATEGORIES = DEFAULT_SEED.map((s) => s.name);

/** 빌트인 카테고리 색상 fallback 맵 — DB 미반영(첫 진입 직후) 또는 시드 변경 전 데이터에 사용.
 *  travel-list 등에서 인라인 매직 객체 대신 import 해서 사용. */
export const BUILTIN_TRAVEL_CATEGORY_COLORS: Record<string, string> = Object.fromEntries(
  DEFAULT_SEED.map((s) => [s.name, s.color]),
);

export function useTravelCategories() {
  const userId = useCurrentUserId();
  const [rows, setRows] = useState<TravelCategoryRow[]>([]);

  const fetchRows = useCallback(async () => {
    if (!userId) {
      setRows([]);
      return;
    }
    const { data } = await supabase
      .from("travel_categories")
      .select("id, name, color, is_builtin, sort_order")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (!data || data.length === 0) {
      await supabase
        .from("travel_categories")
        .insert(
          DEFAULT_SEED.map((s) => ({ ...s, user_id: userId, is_builtin: true })),
        );
      const retry = await supabase
        .from("travel_categories")
        .select("id, name, color, is_builtin, sort_order")
        .eq("user_id", userId)
        .order("sort_order", { ascending: true });
      if (retry.data) setRows(retry.data as TravelCategoryRow[]);
      return;
    }
    setRows(data as TravelCategoryRow[]);
  }, [userId]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const categories: string[] = rows.map((r) => r.name);
  const colors: Record<string, string> = Object.fromEntries(
    rows.map((r) => [r.name, r.color]),
  );

  const addCategory = useCallback(
    async (name: string, color?: string) => {
      const trimmed = name.trim();
      if (!trimmed) return { error: "empty" };
      if (!userId) return { error: "no user" };
      if (rows.some((r) => r.name === trimmed)) return { error: null };
      const maxOrder = rows.reduce((m, r) => Math.max(m, r.sort_order ?? 0), -1);
      const { error } = await supabase.from("travel_categories").insert({
        user_id: userId,
        name: trimmed,
        color: color || "#6B7280",
        is_builtin: false,
        sort_order: maxOrder + 1,
      });
      if (!error) await fetchRows();
      return { error };
    },
    [userId, rows, fetchRows],
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      // id 가 name 으로 들어올 수 있어 (legacy API) 양쪽 매칭.
      const target = rows.find((r) => r.id === id || r.name === id);
      if (!target) return { error: "not found" };
      if (target.is_builtin) return { error: "builtin" };
      const { error } = await supabase
        .from("travel_categories")
        .delete()
        .eq("id", target.id);
      if (!error) await fetchRows();
      return { error };
    },
    [rows, fetchRows],
  );

  const updateCategoryColor = useCallback(
    async (id: string, color: string) => {
      const target = rows.find((r) => r.id === id || r.name === id);
      if (!target) return { error: "not found" };
      setRows((prev) => prev.map((r) => (r.id === target.id ? { ...r, color } : r)));
      const { error } = await supabase
        .from("travel_categories")
        .update({ color })
        .eq("id", target.id);
      if (error) await fetchRows();
      return { error };
    },
    [rows, fetchRows],
  );

  const updateCategoryName = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return { error: "empty" };
      const target = rows.find((r) => r.id === id || r.name === id);
      if (!target) return { error: "not found" };
      if (trimmed === target.name) return { error: null };
      if (target.is_builtin) return { error: "builtin" };
      const { error } = await supabase
        .from("travel_categories")
        .update({ name: trimmed })
        .eq("id", target.id);
      if (!error) await fetchRows();
      return { error };
    },
    [rows, fetchRows],
  );

  return { categories, colors, addCategory, deleteCategory, updateCategoryColor, updateCategoryName };
}
