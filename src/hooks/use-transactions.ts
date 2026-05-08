"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Expense, ExpenseCategory } from "@/types";
import { useCurrentUserId } from "@/lib/current-user";
import { ymd, parseYmd, monthBounds } from "@/lib/date-utils";

const STALE_TIME = 5 * 60 * 1000;
const GC_TIME = 24 * 60 * 60 * 1000;

export function transactionsQueryKey(
  userId: string | null | undefined,
  startDate: string,
  endExclusive: string,
) {
  return ["transactions", userId ?? "", startDate, endExclusive] as const;
}

export function expenseCategoriesQueryKey(userId: string | null | undefined) {
  return ["expense-categories", userId ?? ""] as const;
}

async function fetchTransactionsRange(
  userId: string | null | undefined,
  startDate: string,
  endExclusive: string,
): Promise<Expense[]> {
  let query = supabase
    .from("expenses")
    .select("*, category:expense_categories(*)")
    .gte("date", startDate)
    .lt("date", endExclusive)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (userId) query = query.eq("user_id", userId);
  const { data } = await query;
  return ((data as Expense[]) ?? []);
}

async function fetchExpenseCategories(
  userId: string | null | undefined,
): Promise<ExpenseCategory[]> {
  let q = supabase.from("expense_categories").select("*").order("name");
  if (userId) q = q.or(`user_id.is.null,user_id.eq.${userId}`);
  else q = q.is("user_id", null);
  const { data } = await q;
  return ((data as ExpenseCategory[]) ?? []);
}

function invalidateTransactions(
  qc: QueryClient,
  userId: string | null | undefined,
) {
  qc.invalidateQueries({ queryKey: ["transactions", userId ?? ""] });
}
function invalidateCategories(
  qc: QueryClient,
  userId: string | null | undefined,
) {
  qc.invalidateQueries({ queryKey: expenseCategoriesQueryKey(userId) });
}

/**
 * 가계부 거래 조회 훅 (TanStack Query).
 *
 * (startDate, endDate?) 시그니처:
 *  - startDate "YYYY-MM-DD" (포함)
 *  - endDate "YYYY-MM-DD" (포함, 생략 시 startDate 가 속한 달의 말일까지)
 *
 * 내부적으로 다음날 자정 미만(endExclusive)으로 변환해 PostgREST 쿼리.
 */
export function useTransactions(startDate: string, endDate?: string) {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();

  const endExclusive = useMemo(() => {
    if (endDate) {
      const d = parseYmd(endDate);
      d.setDate(d.getDate() + 1);
      return ymd(d);
    }
    const d = parseYmd(startDate);
    return monthBounds(d.getFullYear(), d.getMonth() + 2).start;
  }, [startDate, endDate]);

  const txKey = useMemo(
    () => transactionsQueryKey(userId, startDate, endExclusive),
    [userId, startDate, endExclusive],
  );
  const catKey = useMemo(() => expenseCategoriesQueryKey(userId), [userId]);

  const txQuery = useQuery<Expense[]>({
    queryKey: txKey,
    queryFn: () => fetchTransactionsRange(userId, startDate, endExclusive),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

  const catQuery = useQuery<ExpenseCategory[]>({
    queryKey: catKey,
    queryFn: () => fetchExpenseCategories(userId),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

  // 인접 월 prefetch — startDate 가 "YYYY-MM-01" 형태일 때만.
  useEffect(() => {
    if (!/^\d{4}-\d{2}-01$/.test(startDate)) return;
    const baseY = parseInt(startDate.slice(0, 4), 10);
    const baseM = parseInt(startDate.slice(5, 7), 10);
    const prefetch = (delta: number) => {
      const t = new Date(baseY, baseM - 1 + delta, 1);
      const ny = t.getFullYear();
      const nm = t.getMonth() + 1;
      const sd = monthBounds(ny, nm).start;
      const edStr = monthBounds(ny, nm + 1).start;
      const k = transactionsQueryKey(userId, sd, edStr);
      queryClient.prefetchQuery({
        queryKey: k,
        queryFn: () => fetchTransactionsRange(userId, sd, edStr),
        staleTime: STALE_TIME,
      });
    };
    prefetch(-1);
    prefetch(1);
  }, [startDate, userId, queryClient]);

  // ---------- mutations ----------
  const invalidate = useCallback(
    () => invalidateTransactions(queryClient, userId),
    [queryClient, userId],
  );
  const invalidateCats = useCallback(
    () => invalidateCategories(queryClient, userId),
    [queryClient, userId],
  );

  const addTransaction = useCallback(
    async (tx: Omit<Expense, "id" | "created_at" | "category">) => {
      const { error } = await supabase
        .from("expenses")
        .insert({ ...tx, user_id: userId });
      if (error) {
        const { title, installment_id, installment_total, ...rest } = tx;
        void title;
        void installment_id;
        void installment_total;
        const retry = await supabase.from("expenses").insert(rest);
        if (!retry.error) invalidate();
        return { error: retry.error };
      }
      invalidate();
      return { error: null };
    },
    [userId, invalidate],
  );

  /** N개월 할부 — 같은 installment_id 로 N개 행 일괄 insert. amount 는 N등분, 잔여는 마지막 행. */
  const addInstallment = useCallback(
    async (
      base: Omit<
        Expense,
        "id" | "created_at" | "category" | "installment_id" | "installment_total"
      >,
      months: number,
    ) => {
      if (months <= 1) return await addTransaction(base);
      const installmentId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `inst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const baseAmount = Math.floor(base.amount / months);
      const remainder = base.amount - baseAmount * months;
      const startDateLocal = parseYmd(base.date);

      const rows = Array.from({ length: months }, (_, i) => {
        const d = new Date(startDateLocal);
        d.setMonth(d.getMonth() + i);
        const dateStr = ymd(d);
        const amt = i === months - 1 ? baseAmount + remainder : baseAmount;
        const titledLabel = `${i + 1}/${months}`;
        const title = base.title
          ? `${base.title} (${titledLabel})`
          : `할부 ${titledLabel}`;
        return {
          ...base,
          title,
          amount: amt,
          date: dateStr,
          installment_id: installmentId,
          installment_total: months,
          user_id: userId,
        };
      });

      const { error } = await supabase.from("expenses").insert(rows);
      if (error) {
        const fallback = rows.map((r) => {
          const { installment_id, installment_total, title, ...rest } = r;
          void installment_id;
          void installment_total;
          void title;
          return rest;
        });
        const retry = await supabase.from("expenses").insert(fallback);
        if (!retry.error) invalidate();
        return { error: retry.error };
      }
      invalidate();
      return { error: null };
    },
    [userId, invalidate, addTransaction],
  );

  const updateTransaction = useCallback(
    async (
      id: string,
      updates: Partial<Omit<Expense, "id" | "created_at" | "category">>,
    ) => {
      const { error } = await supabase
        .from("expenses")
        .update(updates)
        .eq("id", id);
      if (error) {
        const { title, ...rest } = updates;
        void title;
        const retry = await supabase
          .from("expenses")
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

  const deleteTransaction = useCallback(
    async (id: string) => {
      const transactions = txQuery.data ?? [];
      const target = transactions.find((t) => t.id === id);
      if (target?.installment_id) {
        const { error } = await supabase
          .from("expenses")
          .delete()
          .eq("installment_id", target.installment_id);
        if (!error) invalidate();
        return { error };
      }
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (!error) invalidate();
      return { error };
    },
    [invalidate, txQuery.data],
  );

  const addCategory = useCallback(
    async (name: string, type: "income" | "expense", color: string) => {
      if (!userId) return { error: "로그인 후 사용 가능합니다" };
      const { error } = await supabase
        .from("expense_categories")
        .insert({ name, type, color, icon: null, user_id: userId });
      if (error) return { error: error.message || String(error) };
      invalidateCats();
      return { error: null };
    },
    [userId, invalidateCats],
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("expense_categories")
        .delete()
        .eq("id", id);
      if (error) return { error: error.message || String(error) };
      invalidateCats();
      return { error: null };
    },
    [invalidateCats],
  );

  const updateCategoryColor = useCallback(
    async (id: string, color: string) => {
      const { error } = await supabase
        .from("expense_categories")
        .update({ color })
        .eq("id", id);
      if (error) return { error: error.message || String(error) };
      invalidateCats();
      return { error: null };
    },
    [invalidateCats],
  );

  // 집계 — 단일 패스로 income/expense/by-category 산출.
  const stats = useMemo(() => {
    const transactions = txQuery.data ?? [];
    let totalIncome = 0;
    let totalExpense = 0;
    const expenseByCategory: Record<
      string,
      { amount: number; color: string }
    > = {};
    for (const t of transactions) {
      if (t.type === "income") {
        totalIncome += t.amount;
      } else {
        totalExpense += t.amount;
        if (t.category) {
          const { name, color } = t.category;
          if (!expenseByCategory[name])
            expenseByCategory[name] = { amount: 0, color };
          expenseByCategory[name].amount += t.amount;
        }
      }
    }
    return {
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
      expenseByCategory,
    };
  }, [txQuery.data]);

  return {
    transactions: txQuery.data ?? [],
    categories: catQuery.data ?? [],
    loading: txQuery.data === undefined,
    addTransaction,
    addInstallment,
    updateTransaction,
    deleteTransaction,
    addCategory,
    deleteCategory,
    updateCategoryColor,
    totalIncome: stats.totalIncome,
    totalExpense: stats.totalExpense,
    balance: stats.balance,
    expenseByCategory: stats.expenseByCategory,
    refetch: () => txQuery.refetch(),
  };
}
