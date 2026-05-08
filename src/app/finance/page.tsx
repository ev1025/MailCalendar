import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from "@tanstack/react-query";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  expenseCategoriesQueryKey,
  transactionsQueryKey,
} from "@/hooks/use-transactions";
import { fixedExpensesQueryKey } from "@/hooks/use-fixed-expenses";
import { paymentMethodsQueryKey } from "@/hooks/use-payment-methods";
import { monthBounds } from "@/lib/date-utils";
import type { Expense, ExpenseCategory } from "@/types";
import type { FixedExpense } from "@/hooks/use-fixed-expenses";
import type { PaymentMethod } from "@/hooks/use-payment-methods";
import FinanceClient from "./finance-client";

/**
 * Finance 페이지 — RSC.
 * 본인 user_id 의 이번달 transactions / fixed_expenses / categories /
 * payment_methods 를 prefetchQuery 로 prefetch.
 */
export default async function FinancePage() {
  const supa = await createSupabaseServerClient();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 5 * 60 * 1000 } },
  });

  try {
    const {
      data: { session },
    } = await supa.auth.getSession();
    const user = session?.user ?? null;

    if (user) {
      const { data: appUser } = await supa
        .from("app_users")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      const currentUserId =
        (appUser as { id?: string | null } | null)?.id ?? null;

      if (currentUserId) {
        const now = new Date();
        const startYmd = monthBounds(
          now.getFullYear(),
          now.getMonth() + 1,
        ).start;
        const endYmdExclusive = monthBounds(
          now.getFullYear(),
          now.getMonth() + 2,
        ).start;

        // 4개 prefetch 병렬.
        await Promise.all([
          queryClient.prefetchQuery({
            queryKey: transactionsQueryKey(
              currentUserId,
              startYmd,
              endYmdExclusive,
            ),
            queryFn: async (): Promise<Expense[]> => {
              const { data } = await supa
                .from("expenses")
                .select("*, category:expense_categories(*)")
                .gte("date", startYmd)
                .lt("date", endYmdExclusive)
                .eq("user_id", currentUserId)
                .order("date", { ascending: false })
                .order("created_at", { ascending: false });
              return (data as Expense[]) ?? [];
            },
          }),
          queryClient.prefetchQuery({
            queryKey: fixedExpensesQueryKey(currentUserId),
            queryFn: async (): Promise<FixedExpense[]> => {
              const { data } = await supa
                .from("fixed_expenses")
                .select("*, category:expense_categories(*)")
                .eq("is_active", true)
                .eq("user_id", currentUserId)
                .order("day_of_month");
              return (data as FixedExpense[]) ?? [];
            },
          }),
          queryClient.prefetchQuery({
            queryKey: expenseCategoriesQueryKey(currentUserId),
            queryFn: async (): Promise<ExpenseCategory[]> => {
              const { data } = await supa
                .from("expense_categories")
                .select("*")
                .or(`user_id.is.null,user_id.eq.${currentUserId}`)
                .order("name");
              return (data as ExpenseCategory[]) ?? [];
            },
          }),
          queryClient.prefetchQuery({
            queryKey: paymentMethodsQueryKey(currentUserId),
            queryFn: async (): Promise<PaymentMethod[]> => {
              const { data } = await supa
                .from("payment_methods")
                .select("id, name, color, sort_order")
                .eq("user_id", currentUserId)
                .order("sort_order", { ascending: true })
                .order("created_at", { ascending: true });
              return (data as PaymentMethod[]) ?? [];
            },
          }),
        ]);
      }
    }
  } catch {
    // skip — 클라이언트 fetch 재시도.
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <FinanceClient />
    </HydrationBoundary>
  );
}
