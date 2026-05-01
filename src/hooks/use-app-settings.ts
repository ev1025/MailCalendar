"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCurrentUserId } from "@/lib/current-user";

/**
 * 사용자별 key-value 설정. PK 는 (user_id, key) 복합키.
 * userId 가 없을 동안엔 defaultValue 만 반환하고 fetch 보류.
 */
export function useAppSetting(key: string, defaultValue: string) {
  const userId = useCurrentUserId();
  const [value, setValue] = useState<string>(defaultValue);
  const [loading, setLoading] = useState(true);

  const fetchValue = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("user_id", userId)
      .eq("key", key)
      .maybeSingle();
    if (data && data.value != null) setValue(String(data.value));
    setLoading(false);
  }, [userId, key]);

  useEffect(() => {
    fetchValue();
  }, [fetchValue]);

  const saveValue = async (next: string) => {
    if (!userId) return;
    setValue(next);
    await supabase
      .from("app_settings")
      .upsert(
        { user_id: userId, key, value: next, updated_at: new Date().toISOString() },
        { onConflict: "user_id,key" },
      );
  };

  return { value, loading, saveValue, refetch: fetchValue };
}
