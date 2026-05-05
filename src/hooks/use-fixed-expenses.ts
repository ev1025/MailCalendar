"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ExpenseCategory } from "@/types";
import { useCurrentUserId } from "@/lib/current-user";
import { generateRepeatDates } from "@/lib/calendar/repeat-helpers";
import { getSessionCache, setSessionCache } from "@/lib/session-cache";

export interface FixedExpense {
  id: string;
  /** 지출명(제목) — 목록에서 가장 크게 표시. 없으면 description/카테고리명으로 폴백. */
  title: string | null;
  amount: number;
  category_id: string;
  /** 메모 — 폼에서만 보이는 상세 내용. */
  description: string | null;
  day_of_month: number;
  type: "income" | "expense";
  payment_method: string;
  is_active: boolean;
  product_id?: string | null;
  /** 반복 등록 개월 수. 1=이번달만, -1=계속(120), N=N개월. 폼에서 그대로 표시. */
  repeat_months?: number | null;
  /** 반복 종류. NULL=monthly(default day_of_month) 호환. */
  repeat_kind?: "weekly" | "monthly" | "yearly" | null;
  weekly_interval?: number | null;
  monthly_nth_week?: number | null;
  monthly_nth_weekday?: number | null;
  /** 첫 발화일 (YYYY-MM-DD). weekly/yearly/monthly-nth 에서 필수. */
  anchor_date?: string | null;
  created_at: string;
  category?: ExpenseCategory;
}

export function useFixedExpenses() {
  const userId = useCurrentUserId();
  const cacheKey = useMemo(() => `fx:${userId ?? ""}`, [userId]);

  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>(
    () => getSessionCache<FixedExpense[]>(cacheKey) ?? [],
  );
  const [loading, setLoading] = useState(
    () => getSessionCache<FixedExpense[]>(cacheKey) === null,
  );

  const fetchFixed = useCallback(async () => {
    let query = supabase
      .from("fixed_expenses")
      .select("*, category:expense_categories(*)")
      .eq("is_active", true)
      .order("day_of_month");
    if (userId) query = query.eq("user_id", userId);
    const { data, error } = await query;
    if (error) {
      const fallback = await supabase
        .from("fixed_expenses")
        .select("*, category:expense_categories(*)")
        .eq("is_active", true)
        .order("day_of_month");
      if (fallback.data) {
        setFixedExpenses(fallback.data);
        setSessionCache(cacheKey, fallback.data);
      }
    } else if (data) {
      setFixedExpenses(data);
      setSessionCache(cacheKey, data);
    }
    setLoading(false);
  }, [userId, cacheKey]);

  // 사용자 변경 시 캐시 hydrate.
  useEffect(() => {
    const cached = getSessionCache<FixedExpense[]>(cacheKey);
    if (cached) {
      setFixedExpenses(cached);
      setLoading(false);
    } else {
      setFixedExpenses([]);
      setLoading(true);
    }
  }, [cacheKey]);

  useEffect(() => {
    fetchFixed();
  }, [fetchFixed]);

  /**
   * 고정비 추가 + 이번달부터 N개월 거래 일괄 생성.
   * - repeatMonths = 1 : 이번달만 (기본)
   * - repeatMonths = N : 이번달 포함 N개월 연속
   * - repeatMonths = -1 (계속) : 120개월(10년) 까지
   *
   * **체감 0초** 를 위해 두 단계로 분리:
   *  ① fx row INSERT 만 await (1 RTT) — 끝나면 즉시 로컬 state 에 추가(optimistic) 후 반환.
   *     호출자(폼)는 이 시점에 폼을 닫음.
   *  ② expense bulk INSERT 는 fire-and-forget — `bulkDone` Promise 로 노출해 caller 가
   *     transactions refetch 같은 후속 작업을 attach 할 수 있게 함.
   *
   * 페이지 마운트 자동 적용은 제거되어 있으므로 거래는 여기서만 생성됨 → 중복 없음.
   */
  const addFixed = async (
    item: Omit<FixedExpense, "id" | "created_at" | "category" | "is_active">,
    repeatMonths: number = 1,
  ): Promise<{ error: unknown; bulkDone?: Promise<void> }> => {
    // ── ① fx row INSERT (단일 RTT) — joined category 까지 한 번에 가져와 optimistic 에 사용 ──
    const insertPayload = { ...item, user_id: userId, repeat_months: repeatMonths };
    let inserted: FixedExpense | null = null;
    const r1 = await supabase
      .from("fixed_expenses")
      .insert(insertPayload)
      .select("*, category:expense_categories(*)")
      .single();
    if (r1.error) {
      // 신규 컬럼(repeat_kind/weekly_interval/monthly_nth_*/anchor_date) 미지원 구 DB 폴백 —
      // 모두 제거 후 재시도. 이렇게 하면 SQL 미실행 환경에서도 매월 default 모드는 동작.
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

    // Optimistic — 로컬 state 에 즉시 추가. day_of_month 정렬이 fetchFixed 와 동일하게 적용되도록 sort.
    if (inserted) {
      setFixedExpenses((prev) =>
        [...prev, inserted!].sort((a, b) => a.day_of_month - b.day_of_month),
      );
    }

    // ── ② expense bulk INSERT — fire-and-forget. caller 가 await 하지 않으면 폼이 즉시 닫힘 ──
    const fixedExpenseId = inserted?.id;
    const bulkDone = (async () => {
      // 총 발화 횟수 — repeatMonths 의 기존 의미(=총 개월수)를 일반화: weekly/yearly 도
      // "총 발화 N회" 로 해석. repeatMonths=12 + weekly = 12회 발화(약 3개월).
      const count = repeatMonths === -1 ? 120 : Math.max(1, repeatMonths);

      // 발화일 생성 — repeat_kind 분기. anchor_date 없으면 today + day_of_month(매월 default).
      const kind = item.repeat_kind ?? "monthly";
      let anchor = item.anchor_date;
      if (!anchor) {
        const today = new Date();
        if (kind === "monthly" && !item.monthly_nth_week) {
          // day_of_month 모드 — 이번 달의 day_of_month 가 anchor.
          const y = today.getFullYear();
          const m = today.getMonth();
          const lastDay = new Date(y, m + 1, 0).getDate();
          const day = Math.min(item.day_of_month, lastDay);
          anchor = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        } else {
          // weekly/yearly/monthly-nth — anchor 없으면 today.
          anchor = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        }
      }
      const dates = generateRepeatDates(anchor, count, {
        kind,
        weeklyInterval: item.weekly_interval ?? 1,
        monthlyNth:
          item.monthly_nth_week && item.monthly_nth_weekday !== null && item.monthly_nth_weekday !== undefined
            ? { week: item.monthly_nth_week, weekday: item.monthly_nth_weekday }
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
      if (txs.length === 0) return;
      const ins = await supabase.from("expenses").insert(txs);
      if (ins.error) {
        const fallback = txs.map((t) => {
          const { title, user_id, fixed_expense_id, ...rest } = t as {
            title?: unknown;
            user_id?: unknown;
            fixed_expense_id?: unknown;
          } & Record<string, unknown>;
          void title; void user_id; void fixed_expense_id;
          return rest;
        });
        await supabase.from("expenses").insert(fallback);
      }
    })();

    return { error: null, bulkDone };
  };

  const updateFixed = async (
    id: string,
    updates: Partial<Omit<FixedExpense, "id" | "created_at" | "category">>
  ) => {
    const { error } = await supabase
      .from("fixed_expenses")
      .update(updates)
      .eq("id", id);
    if (error) {
      // 신규 컬럼 미지원 구 DB 폴백 — 모두 제거 후 재시도.
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
      if (!retry.error) await fetchFixed();
      return { error: retry.error };
    }
    await fetchFixed();
    return { error: null };
  };

  const deleteFixed = async (id: string) => {
    const { error } = await supabase
      .from("fixed_expenses")
      .update({ is_active: false })
      .eq("id", id);
    if (!error) await fetchFixed();
    return { error };
  };

  /**
   * 고정비 부분 삭제 — (year, month) 의 1일부터 미래 거래만 삭제.
   * 잔존 거래 수에 따라 fx 상태를 갱신:
   *   - 잔존 = 0 → fx.is_active = false (전체 삭제와 동등)
   *   - 잔존 > 0 → fx.repeat_months = 잔존 수, active 유지. 즉 5월부터 계속 인
   *     fx 를 7월부터 삭제하면 fx 가 "매월 2회" 로 자동 축소됨 (5/6월 만 남음).
   *
   * 매칭: fixed_expense_id 우선, 없으면 amount + description fallback (legacy 호환).
   */
  const deleteFixedWithScope = async (
    id: string,
    year: number,
    month: number,
  ) => {
    const fx = fixedExpenses.find((f) => f.id === id);
    if (!fx) return { error: "고정비를 찾을 수 없습니다" };

    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;

    // 1a) FK 기반 삭제 — fixed_expense_id 가 있는 거래.
    let qFk = supabase
      .from("expenses")
      .delete()
      .gte("date", startDate)
      .eq("fixed_expense_id", id);
    if (userId) qFk = qFk.eq("user_id", userId);
    await qFk;

    // 1b) Legacy fallback — fixed_expense_id 없는 거래는 amount+description 매칭.
    let qLegacy = supabase
      .from("expenses")
      .delete()
      .gte("date", startDate)
      .is("fixed_expense_id", null)
      .eq("amount", fx.amount);
    if (fx.description === null) qLegacy = qLegacy.is("description", null);
    else qLegacy = qLegacy.eq("description", fx.description);
    if (userId) qLegacy = qLegacy.eq("user_id", userId);
    await qLegacy;

    // 2) 잔존 거래 카운트 — FK 우선 + legacy 보강.
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
    if (fx.description === null) countLegacyQ = countLegacyQ.is("description", null);
    else countLegacyQ = countLegacyQ.eq("description", fx.description);
    if (userId) countLegacyQ = countLegacyQ.eq("user_id", userId);
    const { count: countLegacy } = await countLegacyQ;

    const remaining = (countFk ?? 0) + (countLegacy ?? 0);

    // 3) fx 상태 업데이트.
    if (remaining === 0) {
      const r = await supabase
        .from("fixed_expenses")
        .update({ is_active: false })
        .eq("id", id);
      if (r.error) return { error: r.error };
    } else {
      // 잔존 수만큼 repeat_months 축소. 1 이면 "그 달만(없음)" 으로 표시됨.
      const r = await supabase
        .from("fixed_expenses")
        .update({ repeat_months: remaining })
        .eq("id", id);
      if (r.error) {
        // repeat_months 컬럼 없는 구 DB 폴백 — 컬럼 빼고 그냥 상태 유지.
        // fx 는 active 유지 (잔존 거래가 있으니 매니저에 노출).
      }
    }

    await fetchFixed();
    return { error: null };
  };

  /**
   * 고정비 수정 + 매칭되는 거래(선택한 시작 월부터 미래) 일괄 갱신.
   * (year, month) 1일부터 미래 모두 propagate. 사용자가 임의의 시작 월을 고를 수 있음.
   *
   * 전파되는 필드: amount, description, title, category_id, payment_method, day_of_month.
   * day_of_month 변경 시 매칭 tx 의 date 도 그 달의 새 day 로 갱신 (월말 클램프 포함).
   */
  const updateFixedWithScope = async (
    id: string,
    updates: Partial<Omit<FixedExpense, "id" | "created_at" | "category">>,
    year: number,
    month: number,
  ) => {
    const fx = fixedExpenses.find((f) => f.id === id);
    if (!fx) return { error: "고정비를 찾을 수 없습니다" };

    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;

    // 1+2 병렬: fixed_expense update + 매칭 거래 fetch (서로 독립).
    let txQ = supabase
      .from("expenses")
      .select("id, date")
      .gte("date", startDate)
      .eq("amount", fx.amount);
    if (fx.description === null) txQ = txQ.is("description", null);
    else txQ = txQ.eq("description", fx.description);
    if (userId) txQ = txQ.eq("user_id", userId);

    const [r1, txsRes] = await Promise.all([updateFixed(id, updates), txQ]);
    if (r1.error) return { error: r1.error };
    const txs = txsRes.data;

    if (!txs || txs.length === 0) return { error: null };

    // 3. 변경된 필드만 추려 per-tx update. day_of_month 변경 시 date 계산.
    const dayChanged =
      updates.day_of_month !== undefined && updates.day_of_month !== fx.day_of_month;
    const baseUpdate: Record<string, unknown> = {};
    if (updates.amount !== undefined && updates.amount !== fx.amount)
      baseUpdate.amount = updates.amount;
    if (updates.title !== undefined) baseUpdate.title = updates.title;
    if (updates.description !== undefined) baseUpdate.description = updates.description;
    if (updates.category_id !== undefined && updates.category_id !== fx.category_id)
      baseUpdate.category_id = updates.category_id;
    if (updates.payment_method !== undefined && updates.payment_method !== fx.payment_method)
      baseUpdate.payment_method = updates.payment_method;

    // day_of_month 가 안 바뀌었고 다른 필드 변경도 없으면 스킵.
    if (!dayChanged && Object.keys(baseUpdate).length === 0) return { error: null };

    // 최적화: dayChanged 가 없으면 baseUpdate 만 있는 단일 bulk UPDATE 한 번으로 끝.
    if (!dayChanged) {
      const ids = (txs as { id: string }[]).map((t) => t.id);
      await supabase.from("expenses").update(baseUpdate).in("id", ids);
      return { error: null };
    }

    // dayChanged: 거래마다 새 date 가 다르므로 per-tx update. Promise.all 로 병렬화.
    // 이전엔 sequential await 라 120개월 변경 시 한참 걸렸음.
    await Promise.all(
      (txs as { id: string; date: string }[]).map((tx) => {
        const u = { ...baseUpdate };
        const txYear = parseInt(tx.date.slice(0, 4));
        const txMonth = parseInt(tx.date.slice(5, 7));
        const lastDay = new Date(txYear, txMonth, 0).getDate();
        const newDay = Math.min(updates.day_of_month!, lastDay);
        u.date = `${txYear}-${String(txMonth).padStart(2, "0")}-${String(newDay).padStart(2, "0")}`;
        return supabase.from("expenses").update(u).eq("id", tx.id);
      }),
    );
    return { error: null };
  };

  const deleteFixedByProduct = async (productId: string) => {
    const { error } = await supabase
      .from("fixed_expenses")
      .update({ is_active: false })
      .eq("product_id", productId);
    if (!error) await fetchFixed();
    return { error };
  };

  const upsertFixedFromProduct = async (params: {
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
        .eq("id", existing.id);
      if (!error) await fetchFixed();
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
    if (!error) await fetchFixed();
    return { error };
  };

  const applyFixedToMonth = async (
    year: number,
    month: number,
    existingTransactions: {
      description: string | null;
      amount: number;
      date: string;
    }[]
  ) => {
    let count = 0;
    for (const fx of fixedExpenses) {
      const day = Math.min(
        fx.day_of_month,
        new Date(year, month, 0).getDate()
      );
      const date = `${year}-${String(month).padStart(2, "0")}-${String(
        day
      ).padStart(2, "0")}`;

      const exists = existingTransactions.some(
        (t) =>
          t.amount === fx.amount &&
          t.description === fx.description &&
          t.date === date
      );
      if (exists) continue;

      // 고정비의 title/description 을 각각 expenses 의 같은 필드로 전달.
      // fixed_expense_id 로 출처 추적 — 삭제 다이얼로그에서 분기 가능.
      // 컬럼 미지원 구 DB 대비 에러 시 신규 컬럼 모두 제거 후 재시도.
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
        const { title, fixed_expense_id, ...rest } = payload as typeof payload & { fixed_expense_id?: unknown };
        void title; void fixed_expense_id;
        await supabase.from("expenses").insert(rest);
      }
      count++;
    }
    return count;
  };

  /**
   * 기존 fx 의 미래 N개월 거래 일괄 보장 (중복은 dedup) — 수정 폼에서 반복 늘릴 때 사용.
   *  - fromYear/fromMonth 부터 N개월 (없으면 today 부터). N=1 → 그 달만, N=-1 → 120개월
   *  - 같은 (amount, description, date) 조합이 이미 있으면 skip
   *  - 줄이는 동작은 안 함 (이미 등록된 미래 거래는 그대로)
   *
   * 주의 1: fx 는 항상 DB 에서 fresh 로 fetch 함 — 호출자가 직전 update 후 호출하면
   *   로컬 state(fixedExpenses) 가 stale 일 수 있어 잘못된 day_of_month 로 빈 자리를
   *   채워 중복 거래가 생기는 버그가 있었음.
   * 주의 2: scope 월 (사용자가 고른 시작월) 을 넘기지 않으면 today 부터 채우는데,
   *   이 경우 사용자가 scope 외(예: 과거) 월을 보존하려 해도 today 가 그 안에 있으면
   *   오늘이 속한 달부터 새 day 로 row 가 추가되어 중복 발생. 수정 흐름에서는 항상
   *   scope (fromYear/fromMonth) 을 넘기는 것이 안전.
   */
  const ensureFixedMonths = async (
    fxId: string,
    repeatMonths: number,
    fromYear?: number,
    fromMonth?: number,
  ) => {
    const months = repeatMonths === -1 ? 120 : Math.max(1, repeatMonths);
    if (months <= 1) return { error: null }; // 그 달만이면 추가 거래 없음

    const today = new Date();
    const baseYear = fromYear ?? today.getFullYear();
    const baseMonth = fromMonth ?? today.getMonth() + 1;

    // 대상 기간 의 기존 거래 조회 → 날짜 set 으로 dedup. 이 fx 와 연결된 거래만
    // (FK 우선, legacy 는 amount+description 보조 매칭).
    const startDate = `${baseYear}-${String(baseMonth).padStart(2, "0")}-01`;
    const endT = new Date(baseYear, baseMonth - 1 + months, 1);
    const endDate = `${endT.getFullYear()}-${String(endT.getMonth() + 1).padStart(2, "0")}-01`;
    let existQ = supabase
      .from("expenses")
      .select("amount, description, date, fixed_expense_id")
      .gte("date", startDate)
      .lt("date", endDate);
    if (userId) existQ = existQ.eq("user_id", userId);

    // fx 와 existing 동시 fetch — 둘 다 필요하지만 서로 독립적.
    const [fxRes, existRes] = await Promise.all([
      supabase.from("fixed_expenses").select("*").eq("id", fxId).single(),
      existQ,
    ]);
    if (fxRes.error || !fxRes.data)
      return { error: fxRes.error || "고정비를 찾을 수 없습니다" };
    const fx = fxRes.data;
    type ExistingTx = {
      amount: number;
      description: string | null;
      date: string;
      fixed_expense_id?: string | null;
    };
    const existing = (existRes.data ?? []) as ExistingTx[];
    // 이 fx 와 매칭되는 기존 거래의 날짜만 모음 (날짜 dedup 키).
    const fxDates = new Set<string>(
      existing
        .filter((t) => {
          if (t.fixed_expense_id === fxId) return true;
          // legacy: FK 없을 때만 amount+desc 로 보조 매칭.
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
      const date = `${yi}-${String(mi).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      // 이 fx 의 동일 date 거래가 이미 있으면 skip (FK 또는 legacy amount+desc 매칭).
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
          void title; void user_id; void fixed_expense_id;
          return rest;
        });
        await supabase.from("expenses").insert(fallback);
      }
    }
    return { error: null };
  };

  return {
    fixedExpenses,
    loading,
    addFixed,
    updateFixed,
    deleteFixed,
    deleteFixedByProduct,
    deleteFixedWithScope,
    updateFixedWithScope,
    ensureFixedMonths,
    upsertFixedFromProduct,
    applyFixedToMonth,
    refetch: fetchFixed,
  };
}
