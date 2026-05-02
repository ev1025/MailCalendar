"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2, CalendarX } from "lucide-react";
import { toast } from "sonner";
import FormPage from "@/components/ui/form-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import DatePicker from "@/components/ui/date-picker";
import TagInput from "@/components/ui/tag-input";
import { FormField } from "@/components/ui/form-field";
import RowActionPopover from "@/components/ui/row-action-popover";
import { FORM_INPUT_PRIMARY, FORM_INPUT_COMPACT } from "@/lib/form-classes";
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

/** 급여 category 등록 시 호출 — fixed_expense(매월 반복 income) 으로 영속. */
type RecurringIncomeData = {
  title: string | null;
  amount: number;
  category_id: string;
  description: string | null;
  day_of_month: number;
  type: "income";
  payment_method: string;
  repeat_months: number;
  repeat_kind: "monthly";
  weekly_interval: null;
  monthly_nth_week: null;
  monthly_nth_weekday: null;
  anchor_date: string;
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
  /** 급여 등 매월 반복 수입을 fixed_expenses 에 영속. 미지정 시 일반 onAdd 로 폴백. */
  onAddRecurring?: (data: RecurringIncomeData) => Promise<{ error: unknown }>;
  /** 급여(fixed_expense_id 가진 거래) "이후 모두 삭제" — fx 비활성 + 그 달부터 미래 거래 삭제. */
  onDeleteFixedFromMonth?: (
    fixedExpenseId: string,
    year: number,
    month: number,
  ) => Promise<{ error: unknown }>;
}

export default function IncomeManager({
  open,
  onOpenChange,
  transactions,
  categories,
  onAdd,
  onUpdate,
  onDelete,
  onAddRecurring,
  onDeleteFixedFromMonth,
}: IncomeManagerProps) {
  // 인라인 폼 state — 별도 popup 대신 페이지 상단에서 항상 보임.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(todayYmd());
  const [saving, setSaving] = useState(false);
  // 급여(fixed_expense_id 가진 거래) 삭제 분기 다이얼로그 — null 이면 닫힘.
  const [deletingTx, setDeletingTx] = useState<Expense | null>(null);

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

    // 신규 추가 + category 가 "급여" 이면 fixed_expense (매월 반복) 으로 영속.
    // 편집 모드는 일반 거래로만 처리 (이미 저장된 row 의 모드 변경은 복잡 → 명시적 흐름 별도).
    const isSalary =
      !editingId && selectedCategory?.name === "급여" && !!onAddRecurring;

    let result: { error: unknown };
    if (isSalary && onAddRecurring) {
      const dayOfMonth = parseInt(date.slice(8, 10), 10) || 1;
      result = await onAddRecurring({
        title: title.trim() || null,
        amount: parseInt(amount, 10),
        category_id: categoryId,
        description: null,
        day_of_month: dayOfMonth,
        type: "income",
        payment_method: "계좌이체",
        repeat_months: -1, // 계속 (=120개월 bulk insert)
        repeat_kind: "monthly",
        weekly_interval: null,
        monthly_nth_week: null,
        monthly_nth_weekday: null,
        anchor_date: date,
      });
    } else {
      const data: IncomeData = {
        title: title.trim() || null,
        amount: parseInt(amount, 10),
        category_id: categoryId,
        description: null,
        date,
        type: "income",
        payment_method: "계좌이체",
      };
      result = editingId
        ? await onUpdate(editingId, data)
        : await onAdd(data);
    }

    setSaving(false);
    if (result.error) {
      const msg =
        typeof result.error === "object" && result.error && "message" in result.error
          ? String((result.error as { message?: unknown }).message)
          : "저장 실패";
      toast.error(msg);
      return;
    }
    if (isSalary) {
      toast.success("매월 반복 수입으로 등록되었습니다");
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

          {/* 금액 | 입금 날짜 — 한 행. */}
          <div className="flex items-start gap-3 flex-wrap">
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
            <FormField label="입금 날짜" className="w-fit">
              <DatePicker
                value={date}
                onChange={setDate}
                className={`${FORM_INPUT_COMPACT} w-fit px-3`}
              />
            </FormField>
          </div>

          {/* 종류 — 별도 행. TagInput (모바일 바텀시트 / 데스크탑 Popover). */}
          <FormField label="종류" required>
            <TagInput
              selectedTags={selectedCategory ? [selectedCategory.name] : []}
              allTags={incomeCategories.map((c) => ({
                id: c.id,
                name: c.name,
                color: c.color,
              }))}
              onChange={(tags) => {
                const picked = tags[tags.length - 1];
                const match = incomeCategories.find((c) => c.name === picked);
                setCategoryId(match?.id || "");
              }}
              placeholder="종류 선택"
            />
          </FormField>

          {/* 급여 안내 — 매월 반복 등록됨을 알림. */}
          {selectedCategory?.name === "급여" && !editingId && (
            <p className="text-[11px] text-muted-foreground -mt-1 leading-snug">
              급여 수입은 매월 같은 일자에 자동으로 반복 등록됩니다.
            </p>
          )}

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

        {/* 구분선 + 목록을 한 그룹으로 — 둘 사이 여백 없음. */}
        <div className="flex flex-col">
          <div className="border-t" />

          {/* 수입 목록 표 — 수입명 | 금액 | 입금 날짜. 행 탭 → 폼으로 로드해 편집. */}
          {incomeTxs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              아직 수입 내역이 없습니다
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-2 py-1 text-[11px] text-muted-foreground border-b">
              <span>수입명</span>
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
                <span className="flex items-baseline gap-1.5 min-w-0">
                  {t.title ? (
                    <>
                      {/* 수입명(주) text-sm + 종류(부) text-[11px]. 색상원은 제거. */}
                      <span className="truncate text-sm font-medium">{t.title}</span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        · {t.category?.name || "기타"}
                      </span>
                    </>
                  ) : (
                    // 수입명 미입력 → 종류만 주 표시.
                    <span className="truncate text-sm font-medium">
                      {t.category?.name || "기타"}
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
                        // 급여 등 fixed_expense 출처 거래 → 분기 다이얼로그.
                        if (t.fixed_expense_id && onDeleteFixedFromMonth) {
                          setDeletingTx(t);
                          return;
                        }
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
      </div>

      {/* 급여 거래 삭제 분기 다이얼로그 — fixed_expense_id 있는 거래만. */}
      <Dialog
        open={!!deletingTx}
        onOpenChange={(o) => { if (!o) setDeletingTx(null); }}
      >
        <DialogContent
          showBackButton={false}
          className="max-w-[calc(100%-3rem)] sm:max-w-sm p-0 gap-0 overflow-hidden"
        >
          <div className="px-5 pt-5 pb-4 flex flex-col gap-3">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">급여 거래 삭제</DialogTitle>
            </DialogHeader>
            {deletingTx && (
              <>
                <p className="text-[13px] text-foreground/75 leading-relaxed break-keep">
                  <span className="font-semibold text-foreground">
                    {deletingTx.title || deletingTx.category?.name || "이 급여"}
                  </span>
                  는 매월 반복 수입입니다. 어떻게 삭제할까요?
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const tx = deletingTx;
                      setDeletingTx(null);
                      await onDelete(tx.id);
                    }}
                    className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-destructive/5 tap-feedback"
                  >
                    <Trash2 className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-destructive">이번 달 급여만 삭제</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        매월 반복은 유지. 다음 달엔 다시 자동 등록.
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const tx = deletingTx;
                      setDeletingTx(null);
                      if (tx.fixed_expense_id && onDeleteFixedFromMonth) {
                        const y = parseInt(tx.date.slice(0, 4), 10);
                        const m = parseInt(tx.date.slice(5, 7), 10);
                        await onDeleteFixedFromMonth(tx.fixed_expense_id, y, m);
                      }
                    }}
                    className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-destructive/5 tap-feedback"
                  >
                    <CalendarX className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-destructive">이번 달 이후 모두 삭제</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        매월 반복 자체 비활성화 + 이번 달부터 미래 거래 모두 삭제.
                      </p>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => setDeletingTx(null)}
            className="h-11 border-t text-sm font-medium text-muted-foreground hover:bg-accent/40 transition-colors"
          >
            취소
          </button>
        </DialogContent>
      </Dialog>
    </FormPage>
  );
}
