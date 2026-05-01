"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Expense, ExpenseCategory } from "@/types";
import { useCurrentUserId } from "@/lib/current-user";

/**
 * 가계부 거래 조회 훅.
 *
 * 호환성: 기존엔 (year, month) 시그니처였으나 시작일/종료일 범위 픽커 도입에 따라
 * (startDate, endDate?) 시그니처로 변경.
 *  - startDate: "YYYY-MM-DD" (포함)
 *  - endDate: "YYYY-MM-DD" (포함). 생략 시 startDate 가 속한 달의 말일로 간주.
 *
 * 내부 쿼리는 inclusive end 를 위해 다음날 자정 미만으로 변환.
 */
export function useTransactions(startDate: string, endDate?: string) {
  const userId = useCurrentUserId();
  const [transactions, setTransactions] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // endDate 가 주어지면 그 다음날 (exclusive 상한). 없으면 startDate 의 다음 달 1일.
  const endExclusive = (() => {
    if (endDate) {
      const d = new Date(endDate + "T00:00:00");
      d.setDate(d.getDate() + 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    const d = new Date(startDate + "T00:00:00");
    return `${d.getFullYear()}-${String(d.getMonth() + 2).padStart(2, "0")}-01`;
  })();

  // 카테고리는 글로벌 시드(user_id IS NULL) + 본인 추가분만 조회.
  // 다른 사용자가 만든 커스텀 카테고리는 보이지 않음.
  const fetchCategories = useCallback(async () => {
    let q = supabase.from("expense_categories").select("*").order("name");
    if (userId) q = q.or(`user_id.is.null,user_id.eq.${userId}`);
    else q = q.is("user_id", null);
    const { data } = await q;
    if (data) setCategories(data);
  }, [userId]);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("expenses")
      .select("*, category:expense_categories(*)")
      .gte("date", startDate)
      .lt("date", endExclusive)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });
    if (userId) query = query.eq("user_id", userId);
    const { data, error } = await query;

    if (error) {
      const fallback = await supabase
        .from("expenses")
        .select("*, category:expense_categories(*)")
        .gte("date", startDate)
        .lt("date", endDate)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      if (fallback.data) setTransactions(fallback.data);
    } else if (data) {
      setTransactions(data);
    }
    setLoading(false);
  }, [startDate, endExclusive, userId]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const addTransaction = async (
    tx: Omit<Expense, "id" | "created_at" | "category">
  ) => {
    const { error } = await supabase
      .from("expenses")
      .insert({ ...tx, user_id: userId });
    if (error) {
      // title/installment_*/user_id 컬럼이 아직 없는 DB 대비 — 모두 제거하고 재시도.
      const { title, installment_id, installment_total, ...rest } = tx;
      void title;
      void installment_id;
      void installment_total;
      const retry = await supabase.from("expenses").insert(rest);
      if (!retry.error) await fetchTransactions();
      return { error: retry.error };
    }
    await fetchTransactions();
    return { error: null };
  };

  /** N개월 할부 — 같은 installment_id 로 N개 행 일괄 insert. 시작 날짜 기준 +1개월씩.
   *  amount 는 N등분, 잔액(rounding remainder)은 마지막 행에 합산. title 에 (k/N) 표기. */
  const addInstallment = async (
    base: Omit<Expense, "id" | "created_at" | "category" | "installment_id" | "installment_total">,
    months: number
  ) => {
    if (months <= 1) return await addTransaction(base);
    const installmentId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `inst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const baseAmount = Math.floor(base.amount / months);
    const remainder = base.amount - baseAmount * months;
    const startDate = new Date(base.date + "T00:00:00");

    const rows = Array.from({ length: months }, (_, i) => {
      const d = new Date(startDate);
      d.setMonth(d.getMonth() + i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const amt = i === months - 1 ? baseAmount + remainder : baseAmount;
      const titledLabel = `${i + 1}/${months}`;
      const title = base.title ? `${base.title} (${titledLabel})` : `할부 ${titledLabel}`;
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
      // installment_*/title/user_id 컬럼 없는 DB 대비
      const fallback = rows.map((r) => {
        const { installment_id, installment_total, title, ...rest } = r;
        void installment_id;
        void installment_total;
        void title;
        return rest;
      });
      const retry = await supabase.from("expenses").insert(fallback);
      if (!retry.error) await fetchTransactions();
      return { error: retry.error };
    }
    await fetchTransactions();
    return { error: null };
  };

  const updateTransaction = async (
    id: string,
    updates: Partial<Omit<Expense, "id" | "created_at" | "category">>
  ) => {
    const { error } = await supabase
      .from("expenses")
      .update(updates)
      .eq("id", id);
    if (error) {
      // title 컬럼 없는 DB 대비 재시도.
      const { title, ...rest } = updates;
      void title;
      const retry = await supabase
        .from("expenses")
        .update(rest)
        .eq("id", id);
      if (!retry.error) await fetchTransactions();
      return { error: retry.error };
    }
    await fetchTransactions();
    return { error: null };
  };

  /** 단일 또는 할부 묶음 삭제 — installment_id 가 있으면 같은 묶음 전체 삭제. */
  const deleteTransaction = async (id: string) => {
    const target = transactions.find((t) => t.id === id);
    if (target?.installment_id) {
      const { error } = await supabase
        .from("expenses")
        .delete()
        .eq("installment_id", target.installment_id);
      if (!error) await fetchTransactions();
      return { error };
    }
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (!error) await fetchTransactions();
    return { error };
  };

  const addCategory = async (
    name: string,
    type: "income" | "expense",
    color: string
  ) => {
    if (!userId) return { error: "로그인 후 사용 가능합니다" };
    const { error } = await supabase
      .from("expense_categories")
      .insert({ name, type, color, icon: null, user_id: userId });
    if (error) return { error: error.message || String(error) };
    await fetchCategories();
    return { error: null };
  };

  const deleteCategory = async (id: string) => {
    const { error } = await supabase
      .from("expense_categories")
      .delete()
      .eq("id", id);
    if (error) return { error: error.message || String(error) };
    await fetchCategories();
    return { error: null };
  };

  const updateCategoryColor = async (id: string, color: string) => {
    const { error } = await supabase
      .from("expense_categories")
      .update({ color })
      .eq("id", id);
    if (error) return { error: error.message || String(error) };
    await fetchCategories();
    return { error: null };
  };

  // 집계는 transactions 가 변할 때만 재계산. 매 렌더 O(n) 회피.
  // 단일 반복으로 income/expense/by-category 한 번에 산출.
  const stats = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    const expenseByCategory: Record<string, { amount: number; color: string }> = {};
    for (const t of transactions) {
      if (t.type === "income") {
        totalIncome += t.amount;
      } else {
        totalExpense += t.amount;
        if (t.category) {
          const { name, color } = t.category;
          if (!expenseByCategory[name]) expenseByCategory[name] = { amount: 0, color };
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
  }, [transactions]);
  const { totalIncome, totalExpense, balance, expenseByCategory } = stats;

  return {
    transactions,
    categories,
    loading,
    addTransaction,
    addInstallment,
    updateTransaction,
    deleteTransaction,
    addCategory,
    deleteCategory,
    updateCategoryColor,
    totalIncome,
    totalExpense,
    balance,
    expenseByCategory,
    refetch: fetchTransactions,
  };
}
