import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from "@tanstack/react-query";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { productsQueryKey } from "@/hooks/use-products";
import { productCategoriesQueryKey } from "@/hooks/use-product-categories";
import {
  expenseCategoriesQueryKey,
  transactionsQueryKey,
} from "@/hooks/use-transactions";
import { fixedExpensesQueryKey } from "@/hooks/use-fixed-expenses";
import { monthBounds } from "@/lib/date-utils";
import type { Product, Expense, ExpenseCategory } from "@/types";
import type { FixedExpense } from "@/hooks/use-fixed-expenses";
import ProductsClient from "./products-client";

interface ProductCategoryRow {
  id: string;
  name: string;
  color: string;
  is_builtin?: boolean;
  sort_order?: number;
}

/**
 * Products 페이지 — RSC.
 * 본인 user_id 의 products / product_categories / 이번달 transactions /
 * fixed_expenses prefetchQuery.
 */
export default async function ProductsPage() {
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

        await Promise.all([
          queryClient.prefetchQuery({
            queryKey: productsQueryKey(currentUserId),
            queryFn: async (): Promise<Product[]> => {
              const { data, error } = await supa
                .from("products")
                .select("*")
                .eq("user_id", currentUserId)
                .order("is_active", { ascending: false })
                .order("category")
                .order("sub_category")
                .order("sort_order")
                .order("name");
              if (error) {
                const fallback = await supa
                  .from("products")
                  .select("*")
                  .eq("user_id", currentUserId)
                  .order("is_active", { ascending: false })
                  .order("category")
                  .order("name");
                return (fallback.data as Product[]) ?? [];
              }
              return (data as Product[]) ?? [];
            },
          }),
          queryClient.prefetchQuery({
            queryKey: productCategoriesQueryKey(currentUserId),
            queryFn: async (): Promise<ProductCategoryRow[]> => {
              const { data } = await supa
                .from("product_categories")
                .select("id, name, color, is_builtin, sort_order")
                .eq("user_id", currentUserId)
                .order("sort_order", { ascending: true })
                .order("created_at", { ascending: true });
              return (data as ProductCategoryRow[]) ?? [];
            },
          }),
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
                .order("date", { ascending: false });
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
        ]);
      }
    }
  } catch {
    // skip
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ProductsClient />
    </HydrationBoundary>
  );
}
