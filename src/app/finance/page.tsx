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
 * 본인 user_id 의 이번달 transactions / fixed_expenses / categories / payment_methods prefetch.
 */
export default async function FinancePage() {
  const supa = await createSupabaseServerClient();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 5 * 60 * 1000 } },
  });

  try {
    const {
      data: { user },
    } = await supa.auth.getUser();

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

        const [txRes, fxRes, catRes, pmRes] = await Promise.all([
          supa
            .from("expenses")
            .select("*, category:expense_categories(*)")
            .gte("date", startYmd)
            .lt("date", endYmdExclusive)
            .eq("user_id", currentUserId)
            .order("date", { ascending: false })
            .order("created_at", { ascending: false }),
          supa
            .from("fixed_expenses")
            .select("*, category:expense_categories(*)")
            .eq("is_active", true)
            .eq("user_id", currentUserId)
            .order("day_of_month"),
          supa
            .from("expense_categories")
            .select("*")
            .or(`user_id.is.null,user_id.eq.${currentUserId}`)
            .order("name"),
          supa
            .from("payment_methods")
            .select("id, name, color, sort_order")
            .eq("user_id", currentUserId)
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true }),
        ]);

        queryClient.setQueryData<Expense[]>(
          transactionsQueryKey(currentUserId, startYmd, endYmdExclusive),
          (txRes.data as Expense[]) ?? [],
        );
        queryClient.setQueryData<FixedExpense[]>(
          fixedExpensesQueryKey(currentUserId),
          (fxRes.data as FixedExpense[]) ?? [],
        );
        queryClient.setQueryData<ExpenseCategory[]>(
          expenseCategoriesQueryKey(currentUserId),
          (catRes.data as ExpenseCategory[]) ?? [],
        );
        if (pmRes.data && pmRes.data.length > 0) {
          queryClient.setQueryData<PaymentMethod[]>(
            paymentMethodsQueryKey(currentUserId),
            pmRes.data as PaymentMethod[],
          );
        }
      }
    }
  } catch {
    // skip
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <FinanceClient />
    </HydrationBoundary>
  );
}
