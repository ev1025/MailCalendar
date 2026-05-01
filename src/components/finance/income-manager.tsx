"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import FormPage from "@/components/ui/form-page";
import { Button } from "@/components/ui/button";
import RowActionPopover from "@/components/ui/row-action-popover";
import IncomeForm from "@/components/finance/income-form";
import type { Expense, ExpenseCategory } from "@/types";

type IncomeData = {
  title: string | null;
  amount: number;
  category_id: string;
  description: string | null;
  date: string;
  type: "income" | "expense";
  payment_method: string;
};

interface IncomeManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 현재 가계부 페이지 기간(주로 이번 달)의 모든 거래. 내부에서 type='income' 만 필터. */
  transactions: Expense[];
  /** 전체 카테고리 — 폼에 type='income' 만 필터해서 전달. */
  categories: ExpenseCategory[];
  onAdd: (data: IncomeData) => Promise<{ error: unknown }>;
  onUpdate: (id: string, updates: Partial<IncomeData>) => Promise<{ error: unknown }>;
  onDelete: (id: string) => Promise<{ error: unknown } | void>;
}

function formatWon(amount: number) {
  return new Intl.NumberFormat("ko-KR").format(amount) + "원";
}

export default function IncomeManager({
  open,
  onOpenChange,
  transactions,
  categories,
  onAdd,
  onUpdate,
  onDelete,
}: IncomeManagerProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);

  // 편집 ↔ 신규 분기 — IncomeForm 은 단일 onSave 만 받으므로 매니저에서 디스패치.
  const handleFormSave = async (data: IncomeData) => {
    if (editing) return await onUpdate(editing.id, data);
    return await onAdd(data);
  };

  const incomeTxs = useMemo(
    () =>
      transactions
        .filter((t) => t.type === "income")
        .sort((a, b) => b.date.localeCompare(a.date)),
    [transactions],
  );
  const incomeCategories = useMemo(
    () => categories.filter((c) => c.type === "income"),
    [categories],
  );

  return (
    <>
      <FormPage
        open={open}
        onOpenChange={onOpenChange}
        title="수입 관리"
        hideFooter
      >
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground leading-relaxed break-keep">
            이 기간에 입금된 수입을 종류별로 관리. 항목 탭 → 수정.
          </p>

          {/* + 수입 추가 — 우상단 버튼 (FixedExpenseManager 와 같은 패턴). */}
          <div className="flex justify-end">
            <Button
              size="sm"
              className="h-8"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              수입 추가
            </Button>
          </div>

          {/* 수입 목록 표 — 종류 | 금액 | 입금 날짜 */}
          {incomeTxs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              아직 수입 내역이 없습니다
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-2 py-1 text-[11px] text-muted-foreground border-b">
                <span>종류</span>
                <span className="text-right">금액</span>
                <span className="text-right">입금 날짜</span>
                <span className="w-6" />
              </div>
              {incomeTxs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setEditing(t);
                    setFormOpen(true);
                  }}
                  className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-2 py-2 rounded-md hover:bg-accent text-left transition-colors"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    {t.category?.color && (
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: t.category.color }}
                      />
                    )}
                    <span className="truncate text-sm">
                      {t.category?.name || "기타"}
                    </span>
                    {t.title && (
                      <span className="truncate text-xs text-muted-foreground">
                        · {t.title}
                      </span>
                    )}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-finance-gain shrink-0">
                    +{formatWon(t.amount)}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {t.date.slice(5).replace("-", "/")}
                  </span>
                  <RowActionPopover
                    trigger="more-h"
                    triggerLabel="수입 메뉴"
                    side="bottom"
                    align="end"
                    items={[
                      {
                        icon: <Trash2 className="h-3.5 w-3.5" />,
                        label: "삭제",
                        destructive: true,
                        onClick: async () => {
                          await onDelete(t.id);
                        },
                      },
                    ]}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </FormPage>

      <IncomeForm
        open={formOpen}
        onOpenChange={setFormOpen}
        categories={incomeCategories}
        income={editing}
        onSave={handleFormSave}
      />
    </>
  );
}
