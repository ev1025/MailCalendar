"use client";

import { useCallback, useMemo } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCurrentUserId } from "@/lib/current-user";

export interface PaymentMethod {
  id: string;
  name: string;
  color: string;
  sort_order?: number;
}

const DEFAULT_SEED: { name: string; color: string; sort_order: number }[] = [
  { name: "카드", color: "#3B82F6", sort_order: 0 },
  { name: "현금", color: "#22C55E", sort_order: 1 },
  { name: "계좌이체", color: "#A855F7", sort_order: 2 },
  { name: "자동이체", color: "#F59E0B", sort_order: 3 },
  { name: "간편결제", color: "#E4D547", sort_order: 4 },
];

const STALE_TIME = 30 * 60 * 1000;
const GC_TIME = 24 * 60 * 60 * 1000;

export function paymentMethodsQueryKey(userId: string | null | undefined) {
  return ["payment-methods", userId ?? ""] as const;
}

async function fetchMethods(
  userId: string | null | undefined,
): Promise<PaymentMethod[]> {
  if (!userId) return [];
  const { data } = await supabase
    .from("payment_methods")
    .select("id, name, color, sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (!data || data.length === 0) {
    await supabase
      .from("payment_methods")
      .insert(DEFAULT_SEED.map((s) => ({ ...s, user_id: userId })));
    const retry = await supabase
      .from("payment_methods")
      .select("id, name, color, sort_order")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true });
    return ((retry.data as PaymentMethod[]) ?? []);
  }
  return data as PaymentMethod[];
}

function invalidate(qc: QueryClient, userId: string | null | undefined) {
  qc.invalidateQueries({ queryKey: paymentMethodsQueryKey(userId) });
}

export function usePaymentMethods() {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => paymentMethodsQueryKey(userId),
    [userId],
  );

  const methodsQuery = useQuery<PaymentMethod[]>({
    queryKey,
    queryFn: () => fetchMethods(userId),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

  const methods = methodsQuery.data ?? [];
  const inv = useCallback(
    () => invalidate(queryClient, userId),
    [queryClient, userId],
  );

  const addMethod = useCallback(
    async (name: string, color?: string) => {
      const trimmed = name.trim();
      if (!trimmed) return { error: "empty" };
      if (!userId) return { error: "no user" };
      if (methods.some((m) => m.name === trimmed)) return { error: null };
      const maxOrder = methods.reduce(
        (m, x) => Math.max(m, x.sort_order ?? 0),
        -1,
      );
      const { error } = await supabase.from("payment_methods").insert({
        user_id: userId,
        name: trimmed,
        color: color || "#6B7280",
        sort_order: maxOrder + 1,
      });
      if (!error) inv();
      return { error };
    },
    [userId, methods, inv],
  );

  const deleteMethod = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("payment_methods")
        .delete()
        .eq("id", id);
      if (!error) inv();
      return { error };
    },
    [inv],
  );

  const updateMethodColor = useCallback(
    async (id: string, color: string) => {
      queryClient.setQueryData<PaymentMethod[]>(queryKey, (prev) =>
        (prev ?? []).map((m) => (m.id === id ? { ...m, color } : m)),
      );
      const { error } = await supabase
        .from("payment_methods")
        .update({ color })
        .eq("id", id);
      if (error) inv();
      return { error };
    },
    [queryClient, queryKey, inv],
  );

  return { methods, addMethod, deleteMethod, updateMethodColor };
}
