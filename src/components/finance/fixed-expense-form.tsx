"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import FormPage from "@/components/ui/form-page";
import { Input } from "@/components/ui/input";
import MoneyInput from "@/components/ui/money-input";
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
import DatePicker from "@/components/ui/date-picker";
import RepeatCountControls from "@/components/calendar/repeat-count-controls";
import { FORM_INPUT_PRIMARY, FORM_INPUT_COMPACT, FORM_LABEL } from "@/lib/form-classes";
import { todayYmd, ymd, nthWeekday } from "@/lib/date-utils";
import { usePaymentMethods } from "@/hooks/use-payment-methods";
import type { ExpenseCategory } from "@/types";
import type { FixedExpense } from "@/hooks/use-fixed-expenses";

// 고정비 반복 — 달력 일정 폼과 동일 5종 옵션. infinite 는 monthly + count=-1 로 매핑.
type FxRepeat = "none" | "infinite" | "weekly" | "monthly" | "yearly";
const FX_REPEAT_OPTIONS: { value: FxRepeat; label: string }[] = [
  { value: "none", label: "없음" },
  { value: "infinite", label: "계속" },
  { value: "weekly", label: "매주" },
  { value: "monthly", label: "매월" },
  { value: "yearly", label: "매년" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 기존 항목 수정이면 값 주입, 없으면 신규. */
  fixed: FixedExpense | null;
  categories: ExpenseCategory[];
  /** 신규 추가/수정 콜백. data 는 fixed_expenses 의 row 형태(=hook 의 addFixed 와 호환).
   *  repeatMonths: 1=이번달만, -1=계속(120), N=총 발화 N회. */
  onSave: (
    data: Omit<FixedExpense, "id" | "created_at" | "category" | "is_active">,
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
  /** 'income' 으로 강제하면: 수입/지출 토글 + 결제수단 입력 숨김 + 폼 제목 "수입". */
  forceType?: "income" | "expense";
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
  forceType,
}: Props) {
  const { methods: paymentMethods, addMethod, deleteMethod, updateMethodColor } =
    usePaymentMethods();

  const [type, setType] = useState<"income" | "expense">(forceType ?? "expense");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [saving, setSaving] = useState(false);

  // 반복 — UI 상태. 저장 시점에 repeatMonths(=총 발화수) + repeat_kind + 보조 필드로 변환.
  const [repeat, setRepeat] = useState<FxRepeat>("infinite");
  // 추가 반복 횟수 (RepeatCountField semantic — "1회" = 다음 발화 1번 더).
  const [repeatCount, setRepeatCount] = useState(1);

  // 매주 — 1=매주, 2=격주, 3·4=N주마다.
  const [weeklyInterval, setWeeklyInterval] = useState(1);
  // 매월 — null=같은 일자(default), 값=N째주 W요일.
  const [monthlyNth, setMonthlyNth] = useState<{ week: number; weekday: number } | null>(null);
  // 시작일 — 모든 반복 모드에서 통일된 첫 발화일 입력. day_of_month 는 anchorDate 에서 파생.
  const [anchorDate, setAnchorDate] = useState<string>(todayYmd());

  useEffect(() => {
    if (!open) return;
    if (fixed) {
      setType(forceType ?? fixed.type);
      setTitle(fixed.title || "");
      setAmount(String(fixed.amount));
      setCategoryId(fixed.category_id);
      setDescription(fixed.description || "");
      setPaymentMethod(fixed.payment_method || "");
      setWeeklyInterval(fixed.weekly_interval ?? 1);
      setMonthlyNth(
        fixed.monthly_nth_week && fixed.monthly_nth_weekday !== null && fixed.monthly_nth_weekday !== undefined
          ? { week: fixed.monthly_nth_week, weekday: fixed.monthly_nth_weekday }
          : null,
      );
      // 시작일 복원 — anchor_date 우선, 없으면 이번달 day_of_month 로 합성 (구 데이터 호환).
      if (fixed.anchor_date) {
        setAnchorDate(fixed.anchor_date);
      } else {
        const today = new Date();
        const y = today.getFullYear();
        const m = today.getMonth();
        const lastDay = new Date(y, m + 1, 0).getDate();
        const day = Math.min(fixed.day_of_month, lastDay);
        setAnchorDate(
          `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        );
      }

      // DB 의 repeat_kind + repeat_months → UI 상태 매핑.
      const rm = fixed.repeat_months ?? -1;
      const kind = fixed.repeat_kind;
      if (rm === -1) {
        setRepeat("infinite");
        setRepeatCount(1);
      } else if (rm <= 1) {
        setRepeat("none");
        setRepeatCount(1);
      } else if (kind === "weekly") {
        setRepeat("weekly");
        setRepeatCount(rm - 1);
      } else if (kind === "yearly") {
        setRepeat("yearly");
        setRepeatCount(rm - 1);
      } else {
        setRepeat("monthly");
        setRepeatCount(rm - 1);
      }
    } else {
      setType(forceType ?? "expense");
      setTitle("");
      setAmount("");
      setCategoryId("");
      setDescription("");
      setPaymentMethod("");
      setRepeat("infinite");
      setRepeatCount(1);
      setWeeklyInterval(1);
      setMonthlyNth(null);
      setAnchorDate(todayYmd());
    }
  }, [open, fixed]);

  const filteredCategories = categories.filter((c) => c.type === type);

  // 반복 종류·옵션에 따른 첫 발화일 계산 — RepeatCountField 의 startDate 로 사용.
  // 매월+nth: anchorDate 의 month 기준 N주차 W요일. 단, 그 일자가 anchor 이전이면
  // 다음 달의 N주차 W요일을 사용 (사용자 의도: anchor 이후로 시작).
  // 그 외: anchorDate 그대로.
  const repeatStartDate = (() => {
    if (repeat === "monthly" && monthlyNth) {
      const a = new Date(anchorDate + "T00:00:00");
      if (Number.isNaN(a.getTime())) return anchorDate;
      const thisMonth = nthWeekday(a.getFullYear(), a.getMonth(), monthlyNth.weekday, monthlyNth.week);
      if (thisMonth.getTime() >= a.getTime()) return ymd(thisMonth);
      const nextMonth = nthWeekday(a.getFullYear(), a.getMonth() + 1, monthlyNth.weekday, monthlyNth.week);
      return ymd(nextMonth);
    }
    return anchorDate;
  })();

  // RepeatCountField 가 받는 RepeatType ('weekly'/'monthly'/'yearly'/'none').
  const repeatTypeForField =
    repeat === "weekly" ? "weekly" : repeat === "yearly" ? "yearly" : "monthly";

  const handleSubmit = async () => {
    if (!amount || !categoryId) return;
    const parsed = parseInt(amount, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      toast.error("금액은 0보다 커야 합니다");
      return;
    }
    setSaving(true);

    // UI 반복 → DB 필드 매핑.
    let repeatMonths: number;
    let repeatKind: "weekly" | "monthly" | "yearly" | null;
    if (repeat === "none") {
      repeatMonths = 1;
      repeatKind = null;
    } else if (repeat === "infinite") {
      repeatMonths = -1;
      repeatKind = "monthly"; // infinite 는 매월 + 무한.
    } else {
      repeatMonths = Math.max(2, repeatCount + 1);
      repeatKind = repeat;
    }

    // day_of_month 는 anchorDate 에서 파생 (구 컬럼 호환). anchor_date 는 항상 저장.
    const anchorObj = new Date(anchorDate + "T00:00:00");
    const dayOfMonth = Number.isNaN(anchorObj.getTime()) ? 1 : anchorObj.getDate();

    const { error } = await onSave(
      {
        title: title.trim() || null,
        amount: parseInt(amount, 10),
        category_id: categoryId,
        description: description.trim() || null,
        day_of_month: dayOfMonth,
        type,
        payment_method: paymentMethod || "계좌이체",
        repeat_months: repeatMonths,
        repeat_kind: repeatKind,
        weekly_interval: repeatKind === "weekly" ? weeklyInterval : null,
        monthly_nth_week: repeatKind === "monthly" && monthlyNth ? monthlyNth.week : null,
        monthly_nth_weekday: repeatKind === "monthly" && monthlyNth ? monthlyNth.weekday : null,
        // monthly+nth: 실제 첫 N주차 W요일을 anchor 로 저장. 외엔 사용자가 고른 anchorDate.
        anchor_date: repeatKind === "monthly" && monthlyNth ? repeatStartDate : anchorDate,
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

  const isIncome = forceType === "income";
  const titleLabel = isIncome ? "수입명" : "지출명";
  const titlePlaceholder = isIncome ? "예: 5월 급여" : "예: 넷플릭스, 월세";
  const formTitle = isIncome
    ? (fixed ? "수입 수정" : "새 수입")
    : (fixed ? "고정비 수정" : "새 고정비");

  return (
    <FormPage
      open={open}
      onOpenChange={onOpenChange}
      title={formTitle}
      submitDisabled={!amount || parseInt(amount, 10) <= 0 || !categoryId}
      saving={saving}
      onSubmit={handleSubmit}
    >
      <div className="flex flex-col gap-4">
        {/* 지출명/수입명 */}
        <FormField label={titleLabel} htmlFor="fx-title">
          <Textarea
            id="fx-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={titlePlaceholder}
            rows={2}
            className="min-h-0"
          />
        </FormField>

        {/* 수입/지출 세그먼트 제거 — 고정비/수입 매니저가 각자 forceType 으로
            type 을 고정. 수입/지출 토글은 더 이상 폼 안에 노출되지 않음. */}

        {/* 금액 + 시작일 + 반복 — 한 행. 시작일·반복 dropdown 은 컨텐츠 폭(약간 여백). */}
        <div className="flex items-start gap-3 flex-wrap">
          <FormField label="금액" required>
            <MoneyInput
              value={amount}
              onChange={setAmount}
              placeholder="50000"
              className={`${FORM_INPUT_PRIMARY} w-[9.5rem]`}
            />
          </FormField>
          <FormField label="시작일" className="flex-1 min-w-0">
            <DatePicker
              value={anchorDate}
              onChange={setAnchorDate}
              // 금액(고정 폭) | 시작일(잉여 공간 grow) | 반복(컨텐츠 폭) 행 정렬.
              className={`${FORM_INPUT_COMPACT} w-full px-3`}
            />
          </FormField>
          <div className="flex flex-col gap-1.5 w-fit">
            <Label className={FORM_LABEL}>반복</Label>
            <Select
              value={repeat}
              onValueChange={(v) => {
                if (!v) return;
                setRepeat(v as FxRepeat);
                // 모드 전환 시 격주·N주차 초기화.
                if (v !== "weekly") setWeeklyInterval(1);
                if (v !== "monthly") setMonthlyNth(null);
              }}
            >
              <SelectTrigger className={`${FORM_INPUT_COMPACT} w-fit min-w-[4.5rem]`}>
                {FX_REPEAT_OPTIONS.find((o) => o.value === repeat)?.label || "없음"}
              </SelectTrigger>
              <SelectContent className="min-w-[4.5rem]">
                {FX_REPEAT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 반복 횟수 + 격주/N주차 — 별도 행 (없음/계속 일 땐 숨김). */}
        {repeat !== "none" && repeat !== "infinite" && (
          <div className="flex items-end gap-2 flex-wrap">
            <RepeatCountControls
              startDate={repeatStartDate}
              repeat={repeatTypeForField}
              repeatCount={repeatCount}
              setRepeatCount={setRepeatCount}
              weeklyInterval={weeklyInterval}
              setWeeklyInterval={setWeeklyInterval}
              monthlyNth={monthlyNth}
              setMonthlyNth={setMonthlyNth}
            />
          </div>
        )}
        {(repeat === "infinite" || repeat === "monthly") && !monthlyNth && (
          <p className="text-[11px] text-muted-foreground -mt-2 leading-snug">
            29~31일은 해당 일자가 없는 달(2월 등)엔 월말에 자동 반영돼요.
          </p>
        )}

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

        {/* 결제수단 — 수입(forceType="income") 폼에선 숨김. */}
        {!isIncome && (
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
        )}

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

