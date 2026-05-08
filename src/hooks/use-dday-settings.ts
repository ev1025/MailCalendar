"use client";

import { useCallback, useMemo } from "react";
import {
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCurrentUserId } from "@/lib/current-user";

/**
 * D-day 설정 훅 — DB 영속 + 공유 파트너 fallback.
 *
 * 동작:
 *  - 본인 dday_enabled 면 그것 사용. ② 아니면 calendar_shares accepted
 *    파트너(들) 중 enabled 인 첫 사람 dday 를 fallback. ③ 없으면 빈 상태.
 *  - 쓰기는 본인 row 에만.
 */

export interface DdaySettings {
  enabled: boolean;
  date: string;
  time: string;
  source: "self" | "partner" | "none";
}

const DEFAULT: DdaySettings = {
  enabled: false,
  date: "",
  time: "",
  source: "none",
};

const STALE_TIME = 10 * 60 * 1000;
const GC_TIME = 24 * 60 * 60 * 1000;

function normalizeTime(t: string | null): string {
  if (!t) return "";
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export function ddaySettingsQueryKey(userId: string | null | undefined) {
  return ["dday-settings", userId ?? ""] as const;
}

async function fetchDdaySettings(
  userId: string | null | undefined,
): Promise<DdaySettings> {
  if (!userId) return DEFAULT;
  const ownRes = await supabase
    .from("app_users")
    .select("dday_enabled, dday_date, dday_time")
    .eq("id", userId)
    .single();
  const own = ownRes.data as
    | {
        dday_enabled: boolean | null;
        dday_date: string | null;
        dday_time: string | null;
      }
    | null;
  if (own?.dday_enabled && own.dday_date && own.dday_time) {
    return {
      enabled: true,
      date: own.dday_date,
      time: normalizeTime(own.dday_time),
      source: "self",
    };
  }

  const sharesRes = await supabase
    .from("calendar_shares")
    .select("owner_id, viewer_id")
    .eq("status", "accepted")
    .or(`owner_id.eq.${userId},viewer_id.eq.${userId}`);
  const partnerIds = (sharesRes.data ?? [])
    .map((s: { owner_id: string; viewer_id: string }) =>
      s.owner_id === userId ? s.viewer_id : s.owner_id,
    )
    .filter((id) => id && id !== userId);
  if (partnerIds.length > 0) {
    const partnersRes = await supabase
      .from("app_users")
      .select("id, dday_enabled, dday_date, dday_time")
      .in("id", partnerIds);
    const validPartner = (partnersRes.data ?? []).find(
      (p: {
        dday_enabled: boolean | null;
        dday_date: string | null;
        dday_time: string | null;
      }) => p.dday_enabled && p.dday_date && p.dday_time,
    );
    if (validPartner) {
      return {
        enabled: true,
        date: validPartner.dday_date as string,
        time: normalizeTime(validPartner.dday_time as string),
        source: "partner",
      };
    }
  }

  return {
    enabled: !!own?.dday_enabled,
    date: own?.dday_date ?? "",
    time: normalizeTime(own?.dday_time ?? ""),
    source: "none",
  };
}

export function useDdaySettings() {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ddaySettingsQueryKey(userId),
    [userId],
  );

  const dQuery = useQuery<DdaySettings>({
    queryKey,
    queryFn: () => fetchDdaySettings(userId),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    enabled: !!userId,
  });

  const settings = dQuery.data ?? DEFAULT;

  const update = useCallback(
    async (
      patch: Partial<Pick<DdaySettings, "enabled" | "date" | "time">>,
    ) => {
      if (!userId) return;
      const next = { ...settings, ...patch };
      // optimistic
      queryClient.setQueryData<DdaySettings>(queryKey, {
        enabled: next.enabled,
        date: next.date,
        time: next.time,
        source:
          next.enabled && next.date && next.time
            ? "self"
            : settings.source,
      });
      await supabase
        .from("app_users")
        .update({
          dday_enabled: next.enabled,
          dday_date: next.date || null,
          dday_time: next.time || null,
        })
        .eq("id", userId);
      // partner fallback 결정 위해 재fetch.
      queryClient.invalidateQueries({ queryKey });
    },
    [userId, settings, queryClient, queryKey],
  );

  const isReady =
    settings.source !== "none" &&
    settings.date.length > 0 &&
    settings.time.length >= 4;

  return {
    settings,
    update,
    isReady,
    refetch: () => dQuery.refetch(),
  };
}
