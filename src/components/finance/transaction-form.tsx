"use client";

import { useState, useEffect } from "react";
import FormPage from "@/components/ui/form-page";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import TagInput from "@/components/ui/tag-input";
import DatePicker from "@/components/ui/date-picker";
import NumberWheel from "@/components/ui/number-wheel";
import { FormField } from "@/components/ui/form-field";
import { usePaymentMethods } from "@/hooks/use-payment-methods";
import { FORM_INPUT_PRIMARY } from "@/lib/form-classes";
import { translateError } from "@/lib/api-errors";
import { toast } from "sonner";
import type { Expense, ExpenseCategory } from "@/types";

interface TransactionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ExpenseCategory[];
  transaction?: Expense | null;
  /** 신규 작성 시 type 초기값. 카드 +수입/+지출 버튼에서 미리 세팅. 기본 expense. */
  defaultType?: "income" | "expense";
  onAddCategory?: (
    name: string,
    type: "income" | "expense",
    color: string
  ) => Promise<{ error: unknown }>;
  onDeleteCategory?: (id: string) => Promise<{ error: unknown }>;
  onUpdateCategoryColor?: (id: string, color: string) => Promise<{ error: unknown }>;
  onSave: (
    data: {
      title: string | null;
      amount: number;
      category_id: string;
      description: string | null;
      date: string;
      type: "income" | "expense";
      payment_method: string;
    },
    /** 신규 등록 시에만 의미 있음. 2 이상이면 같은 일자에 N개월 할부로 일괄 등록. */
    installmentMonths?: number
  ) => Promise<{ error: unknown }>;
}

const PRESET_AMOUNTS: { value: number; label: string }[] = [
  { value: 5000, label: "+5천" },
  { value: 10000, label: "+1만" },
  { value: 30000, label: "+3만" },
  { value: 50000, label: "+5만" },
  { value: 100000, label: "+10만" },
];

export default function TransactionForm({
  open,
  onOpenChange,
  categories,
  transaction,
  defaultType = "expense",
  onAddCategory,
  onDeleteCategory,
  onUpdateCategoryColor,
  onSave,
}: TransactionFormProps) {
  const { methods: paymentMethods, addMethod, deleteMethod, updateMethodColor } = usePaymentMethods();
  const [type, setType] = useState<"income" | "expense">("expense");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState("");
  /** 할부 개월 수 — 1 = 일시불 (기본), 2~24 가능. 수정 모드에선 비활성. */
  const [installmentMonths, setInstallmentMonths] = useState(1);
  const [saving, setSaving] = useState(false);
  /** 사용자가 한 번이라도 제출 시도했는지 — 그 전엔 인라인 에러 숨김(첫 진입에서 빨간 표시 X). */
  const [submitted, setSubmitted] = useState(false);

  const isEdit = !!transaction;

  useEffect(() => {
    if (transaction) {
      setType(transaction.type);
      setTitle(transaction.title || "");
      setAmount(String(transaction.amount));
      setCategoryId(transaction.category_id);
      setDescription(transaction.description || "");
      setDate(transaction.date);
      setPaymentMethod(transaction.payment_method);
      setInstallmentMonths(1);
    } else {
      setType(defaultType);
      setTitle("");
      setAmount("");
      setCategoryId("");
      setDescription("");
      setDate(new Date().toISOString().split("T")[0]);
      // payment_method 는 DB CHECK 제약 ('카드','현금','계좌이체','자동이체','간편결제','기타') 에
      // 빈 문자열이 통과 못 함. 기본값 "카드" — 사용자가 폼에서 다른 값으로 덮어쓰면 됨.
      setPaymentMethod("카드");
      setInstallmentMonths(1);
    }
  }, [transaction, open, defaultType]);

  const filteredCategories = categories.filter((c) => c.type === type);

  const handleSubmit = async () => {
    setSubmitted(true);
    if (!title.trim() || !amount || !categoryId) return;
    const parsed = parseInt(amount, 10);
    // DB 무결성보다 사용자 의도 보호: 0원/음수 거래는 가계부 합계를 왜곡시키므로 차단.
    if (Number.isNaN(parsed) || parsed <= 0) {
      toast.error("금액은 0보다 커야 합니다");
      return;
    }
    setSaving(true);
    // payment_method 는 빈 문자열이면 DB CHECK 가 거부하므로 fallback "카드".
    const { error } = await onSave(
      {
        title: title.trim() || null,
        amount: parseInt(amount, 10),
        category_id: categoryId,
        description: description.trim() || null,
        date,
        type,
        payment_method: paymentMethod || "카드",
      },
      isEdit ? undefined : installmentMonths
    );
    setSaving(false);
    if (error) {
      // silent 실패 방지 — 사용자에게 한글 메시지 표시.
      const raw = typeof error === "string"
        ? error
        : (error as { message?: string })?.message ?? null;
      toast.error(`저장 실패: ${translateError(raw)}`);
      return;
    }
    onOpenChange(false);
    toast.success(isEdit ? "수정됐어요" : "저장됐어요");
  };

  const titleLabel = type === "income" ? "수입명" : "지출명";
  const headerLabel = isEdit
    ? "내역 수정"
    : type === "income"
      ? "수입 내역 추가"
      : "지출 내역 추가";

  return (
    <FormPage
      open={open}
      onOpenChange={onOpenChange}
      title={headerLabel}
      submitDisabled={!title.trim() || !amount || parseInt(amount, 10) <= 0 || !categoryId}
      saving={saving}
      onSubmit={handleSubmit}
    >
      <div className="flex flex-col gap-4">
        {/* 1. 지출명/수입명 (필수) */}
        <FormField
          label={titleLabel}
          required
          htmlFor="title"
          error={submitted && !title.trim() ? `${titleLabel}을 입력하세요` : null}
        >
          <Textarea
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 기후동행카드, 점심"
            rows={2}
            className="min-h-0"
            aria-invalid={submitted && !title.trim()}
          />
        </FormField>

        {/* 2. 금액 — type 은 카드의 +수입/+지출 버튼에서 결정되어 props 로 들어옴.
            폼 헤더에 type 표시되니 라벨 prefix 는 제거. */}
        <FormField
          label="금액 (원)"
          required
          htmlFor="amount"
          error={
            submitted && !amount
              ? "금액을 입력하세요"
              : amount && parseInt(amount, 10) <= 0
                ? "0보다 큰 금액을 입력하세요"
                : null
          }
        >
          <Input
            id="amount"
            type="number"
            inputMode="numeric"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="10000"
            aria-invalid={amount !== "" && (Number.isNaN(parseInt(amount, 10)) || parseInt(amount, 10) <= 0)}
            className={FORM_INPUT_PRIMARY}
          />
        </FormField>

        {/* 3. 프리셋 — 5천/1만/3만/5만/10만 + 클리어 */}
        <div className="flex flex-wrap gap-1 -mt-2">
          {PRESET_AMOUNTS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => {
                const cur = parseInt(amount || "0", 10) || 0;
                setAmount(String(cur + p.value));
              }}
              className="px-2.5 py-1 rounded-md border text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              {p.label}
            </button>
          ))}
          {amount && (
            <button
              type="button"
              onClick={() => setAmount("")}
              className="px-2.5 py-1 rounded-md border text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              aria-label="금액 비우기"
            >
              ×
            </button>
          )}
        </div>

        {/* 4. 날짜 | 할부 — 수정 모드에선 할부 비활성(이미 묶음 만들어진 상태) */}
        <div className="grid grid-cols-2 gap-2">
          <FormField label="날짜">
            <DatePicker
              value={date}
              onChange={setDate}
              className={`${FORM_INPUT_PRIMARY} w-full min-w-0`}
            />
          </FormField>
          <FormField label="할부">
            <div className="flex items-center gap-2 h-9">
              <NumberWheel
                value={installmentMonths}
                onChange={(v) => !isEdit && setInstallmentMonths(v)}
                min={1}
                max={36}
                className={isEdit ? "opacity-50 pointer-events-none" : ""}
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {installmentMonths === 1 ? "일시불" : `${installmentMonths}개월 할부`}
              </span>
            </div>
          </FormField>
        </div>
        {!isEdit && installmentMonths > 1 && amount && (
          <p className="text-[11px] text-muted-foreground -mt-2 leading-snug break-keep">
            매월 같은 일자에 약 {Math.floor(parseInt(amount, 10) / installmentMonths).toLocaleString()}원씩 {installmentMonths}건 자동 등록됩니다. 한 건 삭제 시 묶음 전체가 함께 삭제돼요.
          </p>
        )}

        {/* 5. 카테고리 | 결제수단 */}
        <div className="grid grid-cols-2 gap-2">
          <FormField
            label="카테고리"
            required
            error={submitted && !categoryId ? "카테고리를 선택하세요" : null}
          >
            <TagInput
              selectedTags={
                categoryId
                  ? [filteredCategories.find((c) => c.id === categoryId)?.name || ""]
                  : []
              }
              allTags={filteredCategories.map((c) => ({
                id: c.id,
                name: c.name,
                color: c.color,
              }))}
              onChange={(tags) => {
                const picked = tags[tags.length - 1];
                const match = filteredCategories.find((c) => c.name === picked);
                setCategoryId(match?.id || "");
              }}
              onAddTag={
                onAddCategory
                  ? async (name, color) => onAddCategory(name, type, color)
                  : undefined
              }
              onDeleteTag={onDeleteCategory}
              onUpdateTagColor={onUpdateCategoryColor}
              placeholder="검색·추가"
            />
          </FormField>
          <FormField label="결제수단">
            <TagInput
              selectedTags={paymentMethod ? [paymentMethod] : []}
              allTags={paymentMethods}
              onChange={(tags) => setPaymentMethod(tags[tags.length - 1] || "")}
              onAddTag={addMethod}
              onDeleteTag={deleteMethod}
              onUpdateTagColor={updateMethodColor}
              placeholder="검색·추가"
            />
          </FormField>
        </div>

        {/* 6. 메모 */}
        <FormField label="메모" htmlFor="desc">
          <Input
            id="desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="세부 내용 (선택)"
            className={FORM_INPUT_PRIMARY}
          />
        </FormField>
      </div>
    </FormPage>
  );
}
