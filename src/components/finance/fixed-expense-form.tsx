"use client";

import { useEffect, useRef, useState } from "react";
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
import TagInput from "@/components/ui/tag-input";
import { Label } from "@/components/ui/label";
import { FormField } from "@/components/ui/form-field";
import RepeatCountField from "@/components/calendar/repeat-count-field";
import { FORM_INPUT_PRIMARY, FORM_INPUT_COMPACT, FORM_LABEL } from "@/lib/form-classes";
import { usePaymentMethods } from "@/hooks/use-payment-methods";
import type { ExpenseCategory } from "@/types";
import type { FixedExpense } from "@/hooks/use-fixed-expenses";

// 고정비 반복 — 달력 일정과 동일 UI(없음/계속/매월) + 횟수 picker.
// 고정비는 day_of_month 기반 monthly 단일이라 매주/매년/격주/N주차는 미지원.
type FxRepeat = "none" | "infinite" | "monthly";
const FX_REPEAT_OPTIONS: { value: FxRepeat; label: string }[] = [
  { value: "none", label: "없음" },
  { value: "infinite", label: "계속" },
  { value: "monthly", label: "매월" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 기존 항목 수정이면 값 주입, 없으면 신규. */
  fixed: FixedExpense | null;
  categories: ExpenseCategory[];
  /** 신규 추가 시: 두 번째 인자로 반복 개월 수 (1=이번달만, -1=계속/120). 수정 시엔 무시. */
  onSave: (
    data: {
      title: string | null;
      amount: number;
      category_id: string;
      description: string | null;
      day_of_month: number;
      type: "income" | "expense";
      payment_method: string;
    },
    repeatMonths?: number,
  ) => Promise<{ error: unknown }>;
  /** 카테고리 TagInput mutation */
  onAddCategory?: (
    name: string,
    type: "income" | "expense",
    color: string
  ) => Promise<{ error: unknown }>;
  onDeleteCategory?: (id: string) => Promise<{ error: unknown }>;
  onUpdateCategoryColor?: (id: string, color: string) => Promise<{ error: unknown }>;
}

export default function FixedExpenseForm({
  open,
  onOpenChange,
  fixed,
  categories,
  onSave,
  onAddCategory,
  onDeleteCategory,
  onUpdateCategoryColor,
}: Props) {
  const { methods: paymentMethods, addMethod, deleteMethod, updateMethodColor } =
    usePaymentMethods();

  const [type, setType] = useState<"income" | "expense">("expense");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [saving, setSaving] = useState(false);
  // 반복 — UI 상태. 저장 시점에 repeatMonths(숫자) 로 변환.
  //  - none → 1 (이번달만)
  //  - infinite → -1 (계속)
  //  - monthly + count(=추가 반복 횟수) → count + 1 (총 개월수)
  //    e.g. "1회 - 다음달" = 이번달 + 다음달 = 2개월.
  const [repeat, setRepeat] = useState<FxRepeat>("infinite");
  const [repeatCount, setRepeatCount] = useState(1); // 추가 반복 횟수
  const [repeatCountOpen, setRepeatCountOpen] = useState(false);
  const [customDigits, setCustomDigits] = useState("");
  const repeatInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (fixed) {
      setType(fixed.type);
      setTitle(fixed.title || "");
      setAmount(String(fixed.amount));
      setCategoryId(fixed.category_id);
      setDescription(fixed.description || "");
      setDayOfMonth(String(fixed.day_of_month));
      setPaymentMethod(fixed.payment_method || "");
      // DB 의 repeat_months(=총 개월) → UI 상태 매핑.
      // monthly 의 count 는 "추가 반복 횟수" 이므로 rm-1.
      const rm = fixed.repeat_months ?? -1;
      if (rm === -1) {
        setRepeat("infinite");
        setRepeatCount(1);
      } else if (rm <= 1) {
        setRepeat("none");
        setRepeatCount(1);
      } else {
        setRepeat("monthly");
        setRepeatCount(rm - 1);
      }
    } else {
      setType("expense");
      setTitle("");
      setAmount("");
      setCategoryId("");
      setDescription("");
      setDayOfMonth("1");
      setPaymentMethod("");
      setRepeat("infinite");
      setRepeatCount(1);
    }
    setCustomDigits("");
    setRepeatCountOpen(false);
  }, [open, fixed]);

  const filteredCategories = categories.filter((c) => c.type === type);

  // RepeatCountField 가 사용할 시작일 — 첫 발화 월의 day_of_month.
  // 오늘이 day_of_month 이전이면 이번 달, 이후면 다음 달부터 시작.
  const repeatStartDate = (() => {
    const day = parseInt(dayOfMonth, 10) || 1;
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();
    const lastThis = new Date(y, m + 1, 0).getDate();
    const dayThis = Math.min(day, lastThis);
    const startThis = new Date(y, m, dayThis);
    let target: Date;
    if (today.getDate() <= day) {
      target = startThis;
    } else {
      const lastNext = new Date(y, m + 2, 0).getDate();
      target = new Date(y, m + 1, Math.min(day, lastNext));
    }
    return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
  })();

  const handleSubmit = async () => {
    if (!amount || !categoryId) return;
    setSaving(true);
    // UI 반복 → repeatMonths(=총 개월) 매핑. monthly 의 count 는 추가 횟수라 +1.
    const repeatMonths =
      repeat === "none" ? 1 : repeat === "infinite" ? -1 : Math.max(2, repeatCount + 1);
    const { error } = await onSave(
      {
        title: title.trim() || null,
        amount: parseInt(amount, 10),
        category_id: categoryId,
        description: description.trim() || null,
        day_of_month: parseInt(dayOfMonth, 10) || 1,
        type,
        payment_method: paymentMethod || "계좌이체",
      },
      repeatMonths,
    );
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

  return (
    <FormPage
      open={open}
      onOpenChange={onOpenChange}
      title={fixed ? "고정비 수정" : "새 고정비"}
      submitDisabled={!amount || !categoryId}
      saving={saving}
      onSubmit={handleSubmit}
    >
      <div className="flex flex-col gap-4">
        {/* 지출명 — 목록에서 제일 크게 보이는 제목 필드 (DB 컬럼: title). */}
        <FormField label="지출명" htmlFor="fx-title">
          <Textarea
            id="fx-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 넷플릭스, 월세"
            rows={2}
            className="min-h-0"
          />
        </FormField>

        {/* 수입/지출 세그먼트 — finance 시멘틱 토큰 사용. opacity 단계로 라이트/다크 자동 대응. */}
        <div className="flex gap-2">
          <button
            type="button"
            className={`flex-1 h-9 rounded-md text-sm font-medium transition-colors border ${
              type === "expense"
                ? "border-finance-loss/30 bg-finance-loss/10 text-finance-loss"
                : "text-muted-foreground hover:bg-accent"
            }`}
            onClick={() => {
              setType("expense");
              setCategoryId("");
            }}
          >
            지출
          </button>
          <button
            type="button"
            className={`flex-1 h-9 rounded-md text-sm font-medium transition-colors border ${
              type === "income"
                ? "border-finance-gain/30 bg-finance-gain/10 text-finance-gain"
                : "text-muted-foreground hover:bg-accent"
            }`}
            onClick={() => {
              setType("income");
              setCategoryId("");
            }}
          >
            수입
          </button>
        </div>

        {/* 금액 + 결제일 — 한 행. 컨텐츠 폭에 맞춰 잉여 공간 제거. */}
        <div className="flex items-start gap-3 flex-wrap">
          <FormField label="금액" required>
            <Input
              type="number"
              inputMode="numeric"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="50000"
              // 100만 단위 (7자리: "1000000") 까지 보이는 폭. tabular-nums 로 자릿수 안정.
              className={`${FORM_INPUT_PRIMARY} w-[8.5rem] tabular-nums`}
            />
          </FormField>
          <FormField label="결제일">
            <Input
              type="number"
              inputMode="numeric"
              min="1"
              max="31"
              value={dayOfMonth}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") { setDayOfMonth(""); return; }
                const n = parseInt(v, 10);
                if (isNaN(n)) return;
                setDayOfMonth(String(Math.min(31, Math.max(1, n))));
              }}
              // 두 자리 숫자 (~"31") 만 보이는 폭.
              className={`${FORM_INPUT_PRIMARY} w-[4rem] text-center tabular-nums`}
            />
          </FormField>
        </div>

        {/* 반복 / 반복 횟수 — 달력 일정 폼과 동일 패턴. */}
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex flex-col gap-1.5">
            <Label className={FORM_LABEL}>반복</Label>
            <Select
              value={repeat}
              onValueChange={(v) => {
                if (!v) return;
                setRepeat(v as FxRepeat);
                setRepeatCountOpen(false);
                setCustomDigits("");
              }}
            >
              <SelectTrigger className={`${FORM_INPUT_COMPACT} w-fit min-w-[4.5rem]`}>
                {FX_REPEAT_OPTIONS.find((o) => o.value === repeat)?.label || "없음"}
              </SelectTrigger>
              <SelectContent className="min-w-[5rem]">
                {FX_REPEAT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {repeat === "monthly" && (
            <div className="flex flex-col gap-1.5 min-w-0">
              <Label className={FORM_LABEL}>반복 횟수</Label>
              <RepeatCountField
                startDate={repeatStartDate}
                repeat="monthly"
                repeatCount={repeatCount}
                setRepeatCount={setRepeatCount}
                customDigits={customDigits}
                setCustomDigits={setCustomDigits}
                open={repeatCountOpen}
                setOpen={setRepeatCountOpen}
                inputRef={repeatInputRef}
              />
            </div>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground -mt-2 leading-snug">
          29~31일은 해당 일자가 없는 달(2월 등)엔 월말에 자동 반영돼요.
        </p>

        {/* 카테고리 */}
        <FormField label="카테고리" required>
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

        {/* 결제수단 */}
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

        {/* 메모 */}
        <FormField label="메모">
          <Input
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
