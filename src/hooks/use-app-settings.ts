"use client";

import { useCallback, useMemo } from "react";
import {
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCurrentUserId } from "@/lib/current-user";

const STALE_TIME = 30 * 60 * 1000;
const GC_TIME = 24 * 60 * 60 * 1000;

export function appSettingQueryKey(
  userId: string | null | undefined,
  key: string,
) {
  return ["app-setting", userId ?? "", key] as const;
}

async function fetchSetting(
  userId: string | null | undefined,
  key: string,
): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("user_id", userId)
    .eq("key", key)
    .maybeSingle();
  if (data && (data as { value?: unknown }).value != null) {
    return String((data as { value: unknown }).value);
  }
  return null;
}

/**
 * 사용자별 key-value 설정. PK 는 (user_id, key) 복합키.
 */
export function useAppSetting(key: string, defaultValue: string) {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => appSettingQueryKey(userId, key),
    [userId, key],
  );

  const settingQuery = useQuery<string | null>({
    queryKey,
    queryFn: () => fetchSetting(userId, key),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    enabled: !!userId,
  });

  const value = settingQuery.data ?? defaultValue;
  const loading = !!userId && settingQuery.data === undefined;

  const saveValue = useCallback(
    async (next: string) => {
      if (!userId) return;
      // optimistic
      queryClient.setQueryData<string | null>(queryKey, next);
      await supabase
        .from("app_settings")
        .upsert(
          {
            user_id: userId,
            key,
            value: next,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,key" },
        );
    },
    [userId, key, queryClient, queryKey],
  );

  return {
    value,
    loading,
    saveValue,
    refetch: () => settingQuery.refetch(),
  };
}
