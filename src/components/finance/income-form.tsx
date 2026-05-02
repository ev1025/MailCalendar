"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import FormPage from "@/components/ui/form-page";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import DatePicker from "@/components/ui/date-picker";
import { FormField } from "@/components/ui/form-field";
import {
  FORM_INPUT_PRIMARY,
  FORM_INPUT_COMPACT,
} from "@/lib/form-classes";
import { todayYmd } from "@/lib/date-utils";
import type { Expense, ExpenseCategory } from "@/types";

interface IncomeFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** type='income' 필터된 카테고리. */
  categories: ExpenseCategory[];
  /** 편집 모드면 기존 거래, 신규면 null. */
  income?: Expense | null;
  onSave: (data: {
    title: string | null;
    amount: number;
    category_id: string;
    description: string | null;
    date: string;
    type: "income" | "expense";
    payment_method: string;
  }) => Promise<{ error: unknown }>;
}

export default function IncomeForm({
  open,
  onOpenChange,
  categories,
  income,
  onSave,
}: IncomeFormProps) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(todayYmd());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (income) {
      setTitle(income.title || "");
      setAmount(String(income.amount));
      setCategoryId(income.category_id);
      setDate(income.date);
    } else {
      setTitle("");
      setAmount("");
      setCategoryId("");
      setDate(todayYmd());
    }
  }, [open, income]);

  const handleSubmit = async () => {
    if (!amount || !categoryId) return;
    setSaving(true);
    const { error } = await onSave({
      title: title.trim() || null,
      amount: parseInt(amount, 10),
      category_id: categoryId,
      description: null,
      date,
      type: "income",
      // 수입은 보통 계좌 입금. payment_method 는 DB CHECK 제약을 통과해야 함.
      payment_method: "계좌이체",
    });
    setSaving(false);
    if (error) {
      const msg =
        typeof error === "object" && error && "message" in error
          ? String((error as { message?: unknown }).message)
          : "저장 실패";
      toast.error(msg);
      return;
    }
    onOpenChange(false);
  };

  const selectedCategory = categories.find((c) => c.id === categoryId);

  return (
    <FormPage
      open={open}
      onOpenChange={onOpenChange}
      title={income ? "수입 수정" : "수입 추가"}
      submitDisabled={!amount || !categoryId}
      saving={saving}
      onSubmit={handleSubmit}
    >
      <div className="flex flex-col gap-4">
        {/* 수입명 — 옵션. 비워도 됨. */}
        <FormField label="수입명" htmlFor="income-title">
          <Textarea
            id="income-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 5월 급여, 프리랜스 보수"
            rows={2}
            className="min-h-0"
          />
        </FormField>

        {/* 금액 */}
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

        {/* 입금 날짜 + 종류 — 한 행. 컨텐츠 폭. */}
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
              <SelectTrigger className={`${FORM_INPUT_COMPACT} w-fit min-w-[5rem]`}>
                {selectedCategory?.name || "선택"}
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>
      </div>
    </FormPage>
  );
}
