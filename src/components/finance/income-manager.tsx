"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import FormPage from "@/components/ui/form-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import DatePicker from "@/components/ui/date-picker";
import { FormField } from "@/components/ui/form-field";
import RowActionPopover from "@/components/ui/row-action-popover";
import { FORM_INPUT_PRIMARY, FORM_INPUT_COMPACT, FORM_LABEL } from "@/lib/form-classes";
import { formatMoney } from "@/lib/format-money";
import { todayYmd } from "@/lib/date-utils";
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

export default function IncomeManager({
  open,
  onOpenChange,
  transactions,
  categories,
  onAdd,
  onUpdate,
  onDelete,
}: IncomeManagerProps) {
  // 인라인 폼 state — 별도 popup 대신 페이지 상단에서 항상 보임.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(todayYmd());
  const [saving, setSaving] = useState(false);

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

  // 매니저 열릴 때마다 폼 리셋.
  useEffect(() => {
    if (!open) return;
    setEditingId(null);
    setTitle("");
    setAmount("");
    setCategoryId("");
    setDate(todayYmd());
  }, [open]);

  const selectedCategory = incomeCategories.find((c) => c.id === categoryId);

  const startEditing = (tx: Expense) => {
    setEditingId(tx.id);
    setTitle(tx.title || "");
    setAmount(String(tx.amount));
    setCategoryId(tx.category_id);
    setDate(tx.date);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setTitle("");
    setAmount("");
    setCategoryId("");
    setDate(todayYmd());
  };

  const handleSave = async () => {
    if (!amount || !categoryId) return;
    setSaving(true);
    const data: IncomeData = {
      title: title.trim() || null,
      amount: parseInt(amount, 10),
      category_id: categoryId,
      description: null,
      date,
      type: "income",
      payment_method: "계좌이체",
    };
    const result = editingId
      ? await onUpdate(editingId, data)
      : await onAdd(data);
    setSaving(false);
    if (result.error) {
      const msg =
        typeof result.error === "object" && result.error && "message" in result.error
          ? String((result.error as { message?: unknown }).message)
          : "저장 실패";
      toast.error(msg);
      return;
    }
    // 성공 — 폼 클리어, 편집 모드 해제.
    cancelEditing();
  };

  return (
    <FormPage
      open={open}
      onOpenChange={onOpenChange}
      title="수입 관리"
      hideFooter
    >
      <div className="flex flex-col gap-4">
        {/* 인라인 입력 폼 — 상단. 빈 폼 = 신규 추가, 행 탭 후 = 편집. */}
        <div className="flex flex-col gap-3">
          <FormField label="수입명" htmlFor="income-mgr-title">
            <Textarea
              id="income-mgr-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 5월 급여, 프리랜스 보수"
              rows={2}
              className="min-h-0"
            />
          </FormField>

          <FormField label="금액" required>
            <Input
              type="number"
              inputMode="numeric"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className={`${FORM_INPUT_PRIMARY} w-[8.5rem] tabular-nums`}
            />
          </FormField>

          <div className="flex items-start gap-3 flex-wrap">
            <FormField label="입금 날짜" className="w-fit">
              <DatePicker
                value={date}
                onChange={setDate}
                className={`${FORM_INPUT_COMPACT} w-fit px-3`}
              />
            </FormField>
            <FormField label="종류" required className="w-fit">
              <Select value={categoryId} onValueChange={(v) => v && setCategoryId(v)}>
                <SelectTrigger
                  hideIcon
                  className={`${FORM_INPUT_COMPACT} w-fit min-w-[5rem]`}
                >
                  {selectedCategory?.name || "선택"}
                </SelectTrigger>
                <SelectContent align="start" className="min-w-fit">
                  {incomeCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id} hideIndicator>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>

          {/* 저장 / 취소(편집 시) — 폼 하단. + 추가 버튼은 별도로 두지 않음 (요청). */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8 flex-1"
              onClick={handleSave}
              disabled={!amount || !categoryId || saving}
            >
              {editingId ? "수정 저장" : "추가"}
            </Button>
            {editingId && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8"
                onClick={cancelEditing}
              >
                취소
              </Button>
            )}
          </div>
        </div>

        {/* 구분선 */}
        <div className="border-t" />

        {/* 수입 목록 표 — 종류 | 금액 | 입금 날짜. 행 탭 → 폼으로 로드해 편집. */}
        {incomeTxs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            아직 수입 내역이 없습니다
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            <Label className={FORM_LABEL}>수입 목록</Label>
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
                onClick={() => startEditing(t)}
                className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-2 py-2 rounded-md text-left transition-colors ${
                  editingId === t.id ? "bg-accent" : "hover:bg-accent"
                }`}
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
                  +{formatMoney(t.amount)}
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
                        // 편집 중이던 행이 삭제되면 폼도 클리어.
                        if (editingId === t.id) cancelEditing();
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
  );
}
