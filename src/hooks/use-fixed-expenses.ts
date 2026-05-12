"use client";

import { useCallback, useMemo } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ExpenseCategory } from "@/types";
import { useCurrentUserId } from "@/lib/current-user";
import { generateRepeatDates } from "@/lib/calendar/repeat-helpers";
import { ymd, monthBounds } from "@/lib/date-utils";

export interface FixedExpense {
  id: string;
  title: string | null;
  amount: number;
  category_id: string;
  description: string | null;
  day_of_month: number;
  type: "income" | "expense";
  payment_method: string;
  is_active: boolean;
  product_id?: string | null;
  repeat_months?: number | null;
  repeat_kind?: "weekly" | "monthly" | "yearly" | null;
  weekly_interval?: number | null;
  monthly_nth_week?: number | null;
  monthly_nth_weekday?: number | null;
  anchor_date?: string | null;
  created_at: string;
  category?: ExpenseCategory;
}

const STALE_TIME = 5 * 60 * 1000;
const GC_TIME = 24 * 60 * 60 * 1000;

export function fixedExpensesQueryKey(userId: string | null | undefined) {
  return ["fixed-expenses", userId ?? ""] as const;
}

async function fetchFixedExpenses(
  userId: string | null | undefined,
): Promise<FixedExpense[]> {
  let query = supabase
    .from("fixed_expenses")
    .select("*, category:expense_categories(*)")
    .eq("is_active", true)
    .order("day_of_month");
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query;
  if (error) {
    // 1차 실패 재시도 — userId 필터는 유지(다른 사용자 데이터 노출 방지).
    let fallback = supabase
      .from("fixed_expenses")
      .select("*, category:expense_categories(*)")
      .eq("is_active", true)
      .order("day_of_month");
    if (userId) fallback = fallback.eq("user_id", userId);
    const r = await fallback;
    return ((r.data as FixedExpense[]) ?? []);
  }
  return ((data as FixedExpense[]) ?? []);
}

function invalidateFixed(qc: QueryClient, userId: string | null | undefined) {
  qc.invalidateQueries({ queryKey: fixedExpensesQueryKey(userId) });
}
function invalidateTransactions(
  qc: QueryClient,
  userId: string | null | undefined,
) {
  qc.invalidateQueries({ queryKey: ["transactions", userId ?? ""] });
}

export function useFixedExpenses() {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();

  const queryKey = useMemo(() => fixedExpensesQueryKey(userId), [userId]);

  const fxQuery = useQuery<FixedExpense[]>({
    queryKey,
    queryFn: () => fetchFixedExpenses(userId),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

  const fixedExpenses = fxQuery.data ?? [];

  const invalidate = useCallback(
    () => invalidateFixed(queryClient, userId),
    [queryClient, userId],
  );
  const invalidateTx = useCallback(
    () => invalidateTransactions(queryClient, userId),
    [queryClient, userId],
  );

  // Optimistic 추가 — 폼이 즉시 닫히도록 캐시에 단일 row 선반영.
  const optimisticAdd = useCallback(
    (row: FixedExpense) => {
      queryClient.setQueryData<FixedExpense[]>(queryKey, (prev) =>
        [...(prev ?? []), row].sort(
          (a, b) => a.day_of_month - b.day_of_month,
        ),
      );
    },
    [queryClient, queryKey],
  );

  /**
   * 고정비 추가 + 이번달부터 N개월 거래 일괄 생성.
   * 단계:
   *  ① fx row INSERT — await 후 캐시에 optimistic 반영, 호출자에게 즉시 반환.
   *  ② expense bulk INSERT — fire-and-forget. caller 가 await 하지 않으면 폼 즉시 닫힘.
   */
  const addFixed = useCallback(
    async (
      item: Omit<
        FixedExpense,
        "id" | "created_at" | "category" | "is_active"
      >,
      repeatMonths: number = 1,
    ): Promise<{ error: unknown; bulkDone?: Promise<void> }> => {
      const insertPayload = {
        ...item,
        user_id: userId,
        repeat_months: repeatMonths,
      };
      let inserted: FixedExpense | null = null;
      const r1 = await supabase
        .from("fixed_expenses")
        .insert(insertPayload)
        .select("*, category:expense_categories(*)")
        .single();
      if (r1.error) {
        const {
          title,
          repeat_months,
          repeat_kind,
          weekly_interval,
          monthly_nth_week,
          monthly_nth_weekday,
          anchor_date,
          ...rest
        } = insertPayload as typeof insertPayload & {
          repeat_months?: number;
          repeat_kind?: unknown;
          weekly_interval?: unknown;
          monthly_nth_week?: unknown;
          monthly_nth_weekday?: unknown;
          anchor_date?: unknown;
        };
        void title;
        void repeat_months;
        void repeat_kind;
        void weekly_interval;
        void monthly_nth_week;
        void monthly_nth_weekday;
        void anchor_date;
        const retry = await supabase
          .from("fixed_expenses")
          .insert(rest)
          .select("*, category:expense_categories(*)")
          .single();
        if (retry.error) return { error: retry.error };
        inserted = retry.data as FixedExpense;
      } else {
        inserted = r1.data as FixedExpense;
      }

      if (inserted) optimisticAdd(inserted);

      const fixedExpenseId = inserted?.id;
      const bulkDone = (async () => {
        const count = repeatMonths === -1 ? 120 : Math.max(1, repeatMonths);
        const kind = item.repeat_kind ?? "monthly";
        let anchor = item.anchor_date;
        if (!anchor) {
          const today = new Date();
          if (kind === "monthly" && !item.monthly_nth_week) {
            const y = today.getFullYear();
            const m = today.getMonth();
            const lastDay = new Date(y, m + 1, 0).getDate();
            const day = Math.min(item.day_of_month, lastDay);
            anchor = ymd(new Date(y, m, day));
          } else {
            anchor = ymd(today);
          }
        }
        const dates = generateRepeatDates(anchor, count, {
          kind,
          weeklyInterval: item.weekly_interval ?? 1,
          monthlyNth:
            item.monthly_nth_week &&
            item.monthly_nth_weekday !== null &&
            item.monthly_nth_weekday !== undefined
              ? {
                  week: item.monthly_nth_week,
                  weekday: item.monthly_nth_weekday,
                }
              : null,
        });

        const txs: Record<string, unknown>[] = dates.map((date) => ({
          title: item.title,
          amount: item.amount,
          category_id: item.category_id,
          description: item.description,
          date,
          type: item.type,
          payment_method: item.payment_method,
          user_id: userId,
          fixed_expense_id: fixedExpenseId,
        }));
        if (txs.length === 0) {
          invalidateTx();
          return;
        }
        const ins = await supabase.from("expenses").insert(txs);
        if (ins.error) {
          const fallback = txs.map((t) => {
            const { title, fixed_expense_id, ...rest } = t as {
              title?: unknown;
              fixed_expense_id?: unknown;
            } & Record<string, unknown>;
            void title;
            void fixed_expense_id;
            return rest;
          });
          const r2 = await supabase.from("expenses").insert(fallback);
          if (r2.error) {
            invalidateTx();
            throw r2.error;
          }
        }
        invalidateTx();
      })();

      return { error: null, bulkDone };
    },
    [userId, optimisticAdd, invalidateTx],
  );

  const updateFixed = useCallback(
    async (
      id: string,
      updates: Partial<Omit<FixedExpense, "id" | "created_at" | "category">>,
    ) => {
      const { error } = await supabase
        .from("fixed_expenses")
        .update(updates)
        .eq("id", id);
      if (error) {
        const {
          title,
          repeat_months,
          repeat_kind,
          weekly_interval,
          monthly_nth_week,
          monthly_nth_weekday,
          anchor_date,
          ...rest
        } = updates as typeof updates & {
          repeat_months?: number;
          repeat_kind?: unknown;
          weekly_interval?: unknown;
          monthly_nth_week?: unknown;
          monthly_nth_weekday?: unknown;
          anchor_date?: unknown;
        };
        void title;
        void repeat_months;
        void repeat_kind;
        void weekly_interval;
        void monthly_nth_week;
        void monthly_nth_weekday;
        void anchor_date;
        const retry = await supabase
          .from("fixed_expenses")
          .update(rest)
          .eq("id", id);
        if (!retry.error) invalidate();
        return { error: retry.error };
      }
      invalidate();
      return { error: null };
    },
    [invalidate],
  );

  const deleteFixed = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("fixed_expenses")
        .update({ is_active: false })
        .eq("id", id);
      if (!error) {
        invalidate();
        invalidateTx();
      }
      return { error };
    },
    [invalidate, invalidateTx],
  );

  const deleteFixedWithScope = useCallback(
    async (id: string, year: number, month: number) => {
      const fx = fixedExpenses.find((f) => f.id === id);
      if (!fx) return { error: "고정비를 찾을 수 없습니다" };

      const startDate = monthBounds(year, month).start;

      // 1순위: 원자적 RPC(supabase-fixed-rpc.sql). 함수 미설치(SQL 미실행) 시에만
      // 아래 다단계 폴백으로 — PGRST202(PostgREST: 함수 못 찾음) / 42883(PG: 함수 없음).
      {
        const rpc = await supabase.rpc("delete_fixed_with_scope", {
          p_fixed_id: id,
          p_start_date: startDate,
        });
        if (!rpc.error) {
          invalidate();
          invalidateTx();
          return { error: null };
        }
        const code = (rpc.error as { code?: string }).code;
        const missing =
          code === "PGRST202" ||
          code === "42883" ||
          /function .* does not exist|could not find the function/i.test(rpc.error.message ?? "");
        if (!missing) return { error: rpc.error };
        // → 함수 없음: 다단계 폴백 계속
      }

      let qFk = supabase
        .from("expenses")
        .delete()
        .gte("date", startDate)
        .eq("fixed_expense_id", id);
      if (userId) qFk = qFk.eq("user_id", userId);
      const fkDel = await qFk;
      if (fkDel.error) return { error: fkDel.error };

      let qLegacy = supabase
        .from("expenses")
        .delete()
        .gte("date", startDate)
        .is("fixed_expense_id", null)
        .eq("amount", fx.amount);
      if (fx.description === null) qLegacy = qLegacy.is("description", null);
      else qLegacy = qLegacy.eq("description", fx.description);
      if (userId) qLegacy = qLegacy.eq("user_id", userId);
      const legacyDel = await qLegacy;
      if (legacyDel.error) return { error: legacyDel.error };

      let countFkQ = supabase
        .from("expenses")
        .select("id", { count: "exact", head: true })
        .lt("date", startDate)
        .eq("fixed_expense_id", id);
      if (userId) countFkQ = countFkQ.eq("user_id", userId);
      const { count: countFk } = await countFkQ;

      let countLegacyQ = supabase
        .from("expenses")
        .select("id", { count: "exact", head: true })
        .lt("date", startDate)
        .is("fixed_expense_id", null)
        .eq("amount", fx.amount);
      if (fx.description === null)
        countLegacyQ = countLegacyQ.is("description", null);
      else countLegacyQ = countLegacyQ.eq("description", fx.description);
      if (userId) countLegacyQ = countLegacyQ.eq("user_id", userId);
      const { count: countLegacy } = await countLegacyQ;

      const remaining = (countFk ?? 0) + (countLegacy ?? 0);

      if (remaining === 0) {
        const r = await supabase
          .from("fixed_expenses")
          .update({ is_active: false })
          .eq("id", id);
        if (r.error) return { error: r.error };
      } else {
        const r = await supabase
          .from("fixed_expenses")
          .update({ repeat_months: remaining })
          .eq("id", id);
        if (r.error) return { error: r.error };
      }

      invalidate();
      invalidateTx();
      return { error: null };
    },
    [fixedExpenses, userId, invalidate, invalidateTx],
  );

  const updateFixedWithScope = useCallback(
    async (
      id: string,
      updates: Partial<Omit<FixedExpense, "id" | "created_at" | "category">>,
      year: number,
      month: number,
    ) => {
      const fx = fixedExpenses.find((f) => f.id === id);
      if (!fx) return { error: "고정비를 찾을 수 없습니다" };

      const startDate = monthBounds(year, month).start;

      // 1차: FK(fixed_expense_id) 로 정확히 매칭. 2차: FK 없던 구 거래만 amount+description
      // fallback. (이전엔 amount+description 만으로 매칭 → 같은 금액·설명의 수동 거래까지
      // 잘못 변경되던 버그. deleteFixedWithScope 와 동일한 안전 패턴.)
      let txFkQ = supabase
        .from("expenses")
        .select("id, date")
        .gte("date", startDate)
        .eq("fixed_expense_id", id);
      if (userId) txFkQ = txFkQ.eq("user_id", userId);

      let txLegacyQ = supabase
        .from("expenses")
        .select("id, date")
        .gte("date", startDate)
        .is("fixed_expense_id", null)
        .eq("amount", fx.amount);
      if (fx.description === null) txLegacyQ = txLegacyQ.is("description", null);
      else txLegacyQ = txLegacyQ.eq("description", fx.description);
      if (userId) txLegacyQ = txLegacyQ.eq("user_id", userId);

      const [r1, txFkRes, txLegacyRes] = await Promise.all([
        updateFixed(id, updates),
        txFkQ,
        txLegacyQ,
      ]);
      if (r1.error) return { error: r1.error };
      const txs = [
        ...((txFkRes.data ?? []) as { id: string; date: string }[]),
        ...((txLegacyRes.data ?? []) as { id: string; date: string }[]),
      ];

      if (!txs || txs.length === 0) {
        invalidateTx();
        return { error: null };
      }

      const dayChanged =
        updates.day_of_month !== undefined &&
        updates.day_of_month !== fx.day_of_month;
      const baseUpdate: Record<string, unknown> = {};
      if (updates.amount !== undefined && updates.amount !== fx.amount)
        baseUpdate.amount = updates.amount;
      if (updates.title !== undefined) baseUpdate.title = updates.title;
      if (updates.description !== undefined)
        baseUpdate.description = updates.description;
      if (
        updates.category_id !== undefined &&
        updates.category_id !== fx.category_id
      )
        baseUpdate.category_id = updates.category_id;
      if (
        updates.payment_method !== undefined &&
        updates.payment_method !== fx.payment_method
      )
        baseUpdate.payment_method = updates.payment_method;

      if (!dayChanged && Object.keys(baseUpdate).length === 0) {
        invalidateTx();
        return { error: null };
      }

      if (!dayChanged) {
        const ids = (txs as { id: string }[]).map((t) => t.id);
        await supabase.from("expenses").update(baseUpdate).in("id", ids);
        invalidateTx();
        return { error: null };
      }

      await Promise.all(
        (txs as { id: string; date: string }[]).map((tx) => {
          const u = { ...baseUpdate };
          const txYear = parseInt(tx.date.slice(0, 4));
          const txMonth = parseInt(tx.date.slice(5, 7));
          const lastDay = new Date(txYear, txMonth, 0).getDate();
          const newDay = Math.min(updates.day_of_month!, lastDay);
          u.date = ymd(new Date(txYear, txMonth - 1, newDay));
          return supabase.from("expenses").update(u).eq("id", tx.id);
        }),
      );
      invalidateTx();
      return { error: null };
    },
    [fixedExpenses, userId, updateFixed, invalidateTx],
  );

  const deleteFixedByProduct = useCallback(
    async (productId: string) => {
      const { error } = await supabase
        .from("fixed_expenses")
        .update({ is_active: false })
        .eq("product_id", productId);
      if (!error) {
        invalidate();
        invalidateTx();
      }
      return { error };
    },
    [invalidate, invalidateTx],
  );

  const upsertFixedFromProduct = useCallback(
    async (params: {
      productId: string;
      productName: string;
      monthlyCost: number;
      paymentDay: number;
      categoryId: string;
    }) => {
      const { data: existing } = await supabase
        .from("fixed_expenses")
        .select("id")
        .eq("product_id", params.productId)
        .eq("is_active", true)
        .maybeSingle();
      if (existing) {
        const { error } = await supabase
          .from("fixed_expenses")
          .update({
            amount: params.monthlyCost,
            day_of_month: params.paymentDay,
            description: params.productName,
          })
          .eq("id", (existing as { id: string }).id);
        if (!error) {
          invalidate();
          invalidateTx();
        }
        return { error };
      }
      const { error } = await supabase.from("fixed_expenses").insert({
        amount: params.monthlyCost,
        category_id: params.categoryId,
        description: params.productName,
        day_of_month: params.paymentDay,
        type: "expense",
        payment_method: "카드",
        is_active: true,
        product_id: params.productId,
        user_id: userId,
      });
      if (!error) {
        invalidate();
        invalidateTx();
      }
      return { error };
    },
    [userId, invalidate, invalidateTx],
  );

  const applyFixedToMonth = useCallback(
    async (
      year: number,
      month: number,
      existingTransactions: {
        description: string | null;
        amount: number;
        date: string;
      }[],
    ) => {
      let count = 0;
      for (const fx of fixedExpenses) {
        const day = Math.min(
          fx.day_of_month,
          new Date(year, month, 0).getDate(),
        );
        const date = ymd(new Date(year, month - 1, day));

        const exists = existingTransactions.some(
          (t) =>
            t.amount === fx.amount &&
            t.description === fx.description &&
            t.date === date,
        );
        if (exists) continue;

        const payload = {
          title: fx.title,
          amount: fx.amount,
          category_id: fx.category_id,
          description: fx.description,
          date,
          type: fx.type,
          payment_method: fx.payment_method,
          user_id: userId,
          fixed_expense_id: fx.id,
        };
        const { error } = await supabase.from("expenses").insert(payload);
        if (error) {
          const { title, fixed_expense_id, ...rest } = payload as typeof payload & {
            fixed_expense_id?: unknown;
          };
          void title;
          void fixed_expense_id;
          await supabase.from("expenses").insert(rest);
        }
        count++;
      }
      if (count > 0) invalidateTx();
      return count;
    },
    [fixedExpenses, userId, invalidateTx],
  );

  const ensureFixedMonths = useCallback(
    async (
      fxId: string,
      repeatMonths: number,
      fromYear?: number,
      fromMonth?: number,
    ) => {
      const months = repeatMonths === -1 ? 120 : Math.max(1, repeatMonths);
      if (months <= 1) return { error: null };

      const today = new Date();
      const baseYear = fromYear ?? today.getFullYear();
      const baseMonth = fromMonth ?? today.getMonth() + 1;

      const startDate = monthBounds(baseYear, baseMonth).start;
      const endT = new Date(baseYear, baseMonth - 1 + months, 1);
      const endDate = monthBounds(
        endT.getFullYear(),
        endT.getMonth() + 1,
      ).start;
      let existQ = supabase
        .from("expenses")
        .select("amount, description, date, fixed_expense_id")
        .gte("date", startDate)
        .lt("date", endDate);
      if (userId) existQ = existQ.eq("user_id", userId);

      const [fxRes, existRes] = await Promise.all([
        supabase.from("fixed_expenses").select("*").eq("id", fxId).single(),
        existQ,
      ]);
      if (fxRes.error || !fxRes.data)
        return { error: fxRes.error || "고정비를 찾을 수 없습니다" };
      const fx = fxRes.data as FixedExpense;
      type ExistingTx = {
        amount: number;
        description: string | null;
        date: string;
        fixed_expense_id?: string | null;
      };
      const existing = (existRes.data ?? []) as ExistingTx[];
      const fxDates = new Set<string>(
        existing
          .filter((t) => {
            if (t.fixed_expense_id === fxId) return true;
            if (t.fixed_expense_id == null) {
              if (t.amount !== fx.amount) return false;
              const tDesc = t.description ?? null;
              const fxDesc = fx.description ?? null;
              return tDesc === fxDesc;
            }
            return false;
          })
          .map((t) => t.date),
      );

      const txsToInsert: Record<string, unknown>[] = [];
      for (let i = 0; i < months; i++) {
        const t = new Date(baseYear, baseMonth - 1 + i, 1);
        const yi = t.getFullYear();
        const mi = t.getMonth() + 1;
        const lastDay = new Date(yi, mi, 0).getDate();
        const day = Math.min(fx.day_of_month, lastDay);
        const date = ymd(new Date(yi, mi - 1, day));
        if (fxDates.has(date)) continue;
        txsToInsert.push({
          title: fx.title,
          amount: fx.amount,
          category_id: fx.category_id,
          description: fx.description,
          date,
          type: fx.type,
          payment_method: fx.payment_method,
          user_id: userId,
          fixed_expense_id: fx.id,
        });
      }

      if (txsToInsert.length > 0) {
        const ins = await supabase.from("expenses").insert(txsToInsert);
        if (ins.error) {
          const fallback = txsToInsert.map((t) => {
            const { title, user_id, fixed_expense_id, ...rest } = t as {
              title?: unknown;
              user_id?: unknown;
              fixed_expense_id?: unknown;
            } & Record<string, unknown>;
            void title;
            void user_id;
            void fixed_expense_id;
            return rest;
          });
          await supabase.from("expenses").insert(fallback);
        }
        invalidateTx();
      }
      return { error: null };
    },
    [userId, invalidateTx],
  );

  return {
    fixedExpenses,
    loading: fxQuery.isPending,
    addFixed,
    updateFixed,
    deleteFixed,
    deleteFixedByProduct,
    deleteFixedWithScope,
    updateFixedWithScope,
    ensureFixedMonths,
    upsertFixedFromProduct,
    applyFixedToMonth,
    refetch: () => fxQuery.refetch(),
  };
}
