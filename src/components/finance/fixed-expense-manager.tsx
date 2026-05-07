"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import FormPage from "@/components/ui/form-page";
import { Button } from "@/components/ui/button";
import { Trash2, Plus, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import MonthPicker from "@/components/layout/month-picker";
import FixedExpenseForm from "@/components/finance/fixed-expense-form";
import { formatMoney } from "@/lib/format-money";
import type { ExpenseCategory } from "@/types";
import type { FixedExpense } from "@/hooks/use-fixed-expenses";

interface FixedExpenseManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fixedExpenses: FixedExpense[];
  categories: ExpenseCategory[];
  /** 다이얼로그의 기본 시작 월 — 보통 가계부에서 현재 보고 있는 월. */
  defaultYear?: number;
  defaultMonth?: number;
  /** 매니저 오픈 시 자동으로 편집 폼을 띄울 fx id — "고정비 거래 클릭 → 전체 수정" 진입 경로. */
  initialEditingId?: string;
  onAdd: (
    item: Omit<FixedExpense, "id" | "created_at" | "category" | "is_active">,
    repeatMonths?: number,
  ) => Promise<{ error: unknown }>;
  onUpdate?: (
    id: string,
    updates: Partial<Omit<FixedExpense, "id" | "created_at" | "category">>
  ) => Promise<{ error: unknown }>;
  onDelete: (id: string) => Promise<{ error: unknown }>;
  /** 사용자가 고른 (year, month) 1일부터 미래 거래까지 함께 삭제 + 고정비 비활성화. */
  onDeleteWithScope?: (
    id: string,
    year: number,
    month: number,
  ) => Promise<{ error: unknown }>;
  /** 사용자가 고른 (year, month) 1일부터 미래 거래까지 함께 갱신 + 고정비 row 갱신. */
  onUpdateWithScope?: (
    id: string,
    updates: Partial<Omit<FixedExpense, "id" | "created_at" | "category">>,
    year: number,
    month: number,
  ) => Promise<{ error: unknown }>;
  /** 수정 시 반복 N개월에 미래 거래가 부족하면 채워주는 콜백. dedup 포함.
   *  fromYear/fromMonth 미지정 시 today 부터 채움. 수정 시엔 scope 월을 넘겨
   *  scope 이전 월은 건드리지 않게 해야 함 (안 그러면 보존 월에 새 day 로 중복 추가). */
  onEnsureFixedMonths?: (
    id: string,
    repeatMonths: number,
    fromYear?: number,
    fromMonth?: number,
  ) => Promise<{ error: unknown }>;
  onAddCategory?: (
    name: string,
    type: "income" | "expense",
    color: string
  ) => Promise<{ error: unknown }>;
  onDeleteCategory?: (id: string) => Promise<{ error: unknown }>;
  onUpdateCategoryColor?: (id: string, color: string) => Promise<{ error: unknown }>;
  /** "income" 이면 매니저 라벨/색상이 수입 컨텍스트로 전환. fixedExpenses 는 호출자에서
   *  type='income' 만 필터해 전달하는 것을 가정. 폼은 forceType='income' 으로 렌더. */
  variant?: "expense" | "income";
}

export default function FixedExpenseManager({
  open,
  onOpenChange,
  fixedExpenses,
  categories,
  defaultYear,
  defaultMonth,
  initialEditingId,
  onAdd,
  onUpdate,
  onDelete,
  onDeleteWithScope,
  onUpdateWithScope,
  onEnsureFixedMonths,
  onAddCategory,
  onDeleteCategory,
  onUpdateCategoryColor,
  variant = "expense",
}: FixedExpenseManagerProps) {
  const isIncome = variant === "income";
  const labels = {
    title: isIncome ? "수입 관리" : "고정비 관리",
    description: isIncome ? "매월 자동 반영되는 수입 항목" : "매월 자동 반영되는 고정 항목",
    empty: isIncome ? "등록된 수입이 없습니다" : "등록된 고정비가 없습니다",
    addBtn: isIncome ? "수입 추가" : "고정비 추가",
    deleteAria: isIncome ? "수입 삭제" : "고정비 삭제",
  };
  const totalColor = isIncome ? "text-finance-gain" : "text-finance-loss";
  const totalSign = isIncome ? "+" : "-";
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FixedExpense | null>(null);
  const [deletingFx, setDeletingFx] = useState<FixedExpense | null>(null);
  // 금액 변경 적용 시점 다이얼로그 — editing 이 있고 amount 가 바뀌었을 때 트리거.
  const [pendingUpdate, setPendingUpdate] = useState<{
    oldFx: FixedExpense;
    newData: Parameters<NonNullable<FixedExpenseManagerProps["onUpdate"]>>[1];
    repeatMonths?: number;
  } | null>(null);
  // 카테고리별 펼침 상태 — 기본 닫힘. 펼친 그룹 id 만 Set 에 보관.
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  // 다이얼로그 default 월 — 페이지에서 보고 있는 월(없으면 today).
  const today = new Date();
  const baseYear = defaultYear ?? today.getFullYear();
  const baseMonth = defaultMonth ?? today.getMonth() + 1;

  // "고정비 거래 클릭 → 전체 수정" 진입 시 자동으로 그 fx 편집 폼 오픈.
  // open 전이 시점에만 트리거되도록 (open 동안 fx 목록 변경에 반응하지 않게).
  useEffect(() => {
    if (!open || !initialEditingId) return;
    const fx = fixedExpenses.find((f) => f.id === initialEditingId);
    if (fx) {
      setEditing(fx);
      setFormOpen(true);
      // 카테고리 그룹도 펼쳐 두면 편집 폼 닫은 후 컨텍스트 보임.
      if (fx.category?.name) {
        setExpandedCats((p) => new Set(p).add(fx.category!.name));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialEditingId]);

  // 카테고리별 그룹화. 카테고리명 → 항목 배열. 미분류는 "(미분류)" 키.
  // total 은 절대 합계 — 부호는 variant 컨텍스트(totalSign) 로 prefix 처리.
  // (이전엔 income 타입에 음수를 더해 totalSign + "-" 가 결합되어 "+-..." 로 표시되던 버그.)
  const grouped = useMemo(() => {
    const g: Record<string, { color: string; items: FixedExpense[]; total: number }> = {};
    for (const fx of fixedExpenses) {
      const key = fx.category?.name || "(미분류)";
      const color = fx.category?.color || "#6B7280";
      if (!g[key]) g[key] = { color, items: [], total: 0 };
      g[key].items.push(fx);
      g[key].total += fx.amount;
    }
    return g;
  }, [fixedExpenses]);

  // 정렬: 합계 큰 카테고리 위로.
  const sortedCats = useMemo(
    () => Object.entries(grouped).sort(([, a], [, b]) => b.total - a.total),
    [grouped],
  );

  const toggleCat = (name: string) => {
    setExpandedCats((p) => {
      const n = new Set(p);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });
  };

  const handleOpenNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (fx: FixedExpense) => {
    setEditing(fx);
    setFormOpen(true);
  };

  const handleSave = async (
    data: Omit<FixedExpense, "id" | "created_at" | "category" | "is_active">,
    repeatMonths?: number,
  ) => {
    if (editing && onUpdate) {
      // 금액 또는 결제일이 바뀌면 scope 다이얼로그 (이번달/다음달부터). 미래 거래에도 전파됨.
      // repeatMonths 는 dialog 응답 후에도 ensureFixedMonths 호출에 사용.
      const txAffectingChange =
        data.amount !== editing.amount || data.day_of_month !== editing.day_of_month;
      if (onUpdateWithScope && txAffectingChange) {
        setPendingUpdate({ oldFx: editing, newData: data, repeatMonths });
        return { error: null };
      }
      // repeat_months 도 함께 갱신.
      const updateData = repeatMonths !== undefined
        ? { ...data, repeat_months: repeatMonths }
        : data;
      const r = await onUpdate(editing.id, updateData);
      // 반복이 1보다 크면 미래 거래 보장 (dedup 포함).
      if (
        !r.error &&
        repeatMonths !== undefined &&
        (repeatMonths > 1 || repeatMonths === -1) &&
        onEnsureFixedMonths
      ) {
        await onEnsureFixedMonths(editing.id, repeatMonths);
      }
      return r;
    }
    return await onAdd(data, repeatMonths);
  };

  const applyDelete = async (year: number, month: number) => {
    if (!deletingFx) return;
    if (onDeleteWithScope) {
      await onDeleteWithScope(deletingFx.id, year, month);
    } else {
      // 폴백: 기존 deleteFixed (이번달 자동 거래는 안 건드림)
      await onDelete(deletingFx.id);
    }
    setDeletingFx(null);
  };

  const applyUpdate = async (year: number, month: number) => {
    if (!pendingUpdate || !onUpdateWithScope) return;
    // repeat_months 도 함께 보존.
    const newData = pendingUpdate.repeatMonths !== undefined
      ? { ...pendingUpdate.newData, repeat_months: pendingUpdate.repeatMonths }
      : pendingUpdate.newData;
    await onUpdateWithScope(pendingUpdate.oldFx.id, newData, year, month);
    // 반복 N 이 있으면 미래 거래도 보장 — 단, scope 이전 월은 건드리면 안 되므로
    // 사용자가 고른 (year, month) 부터 채움.
    if (
      pendingUpdate.repeatMonths !== undefined &&
      (pendingUpdate.repeatMonths > 1 || pendingUpdate.repeatMonths === -1) &&
      onEnsureFixedMonths
    ) {
      await onEnsureFixedMonths(pendingUpdate.oldFx.id, pendingUpdate.repeatMonths, year, month);
    }
    setPendingUpdate(null);
  };

  return (
    <>
      <FormPage
        open={open}
        onOpenChange={onOpenChange}
        title={labels.title}
        hideFooter
      >
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground leading-relaxed break-keep">
            {labels.description}
          </p>

          {fixedExpenses.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              {labels.empty}
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {sortedCats.map(([catName, group]) => {
                const isOpen = expandedCats.has(catName);
                return (
                  <div
                    key={catName}
                    className={`rounded-lg border bg-card overflow-hidden transition-colors ${
                      isOpen ? "border-primary/40" : ""
                    }`}
                  >
                    {/* 카테고리 헤더 — 행 전체가 토글. ChevronDown 회전 애니메이션으로
                        펼침 상태 시각화 (이전엔 시각적 단서 약했음). */}
                    <button
                      type="button"
                      onClick={() => toggleCat(catName)}
                      aria-expanded={isOpen}
                      className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-accent/50 transition-colors text-left tap-feedback"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: group.color }}
                      />
                      <span className="text-sm font-semibold flex-1 truncate">{catName}</span>
                      <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                        {group.items.length}건
                      </span>
                      <span className={`text-sm font-semibold tabular-nums shrink-0 ${totalColor}`}>
                        {totalSign}{formatMoney(group.total)}
                      </span>
                      <ChevronDown
                        className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200 ${isOpen ? "rotate-0" : "-rotate-90"}`}
                      />
                    </button>

                    {/* 카테고리 내부 항목들 — 펼쳐진 경우만.
                        height + opacity 슬라이드 — 한꺼번에 팝하지 않고 부드럽게 열림. */}
                    <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.ul
                        key="content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        className="border-t divide-y divide-border/60 overflow-hidden"
                      >
                        {group.items.map((fx) => (
                          <li
                            key={fx.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => handleOpenEdit(fx)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleOpenEdit(fx);
                            }}
                            className="group flex items-center justify-between gap-2 px-3 py-2 cursor-pointer transition-colors hover:bg-accent/40"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-[13px] truncate">
                                {fx.title || fx.description || fx.category?.name || "미분류"}
                              </p>
                              <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                                <span>매월 {fx.day_of_month}일</span>
                                {fx.payment_method && <span>· {fx.payment_method}</span>}
                              </div>
                            </div>
                            <span
                              className={`text-sm font-semibold tabular-nums shrink-0 ${
                                fx.type === "income" ? "text-finance-gain" : "text-finance-loss"
                              }`}
                            >
                              {fx.type === "income" ? "+" : "-"}
                              {formatMoney(fx.amount)}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingFx(fx);
                              }}
                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent transition-colors"
                              aria-label={labels.deleteAria}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </motion.ul>
                    )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}

          <Button variant="outline" onClick={handleOpenNew}>
            <Plus className="mr-1 h-4 w-4" />
            {labels.addBtn}
          </Button>
        </div>
      </FormPage>

      <FixedExpenseForm
        open={formOpen}
        onOpenChange={setFormOpen}
        fixed={editing}
        categories={categories}
        onSave={handleSave}
        onAddCategory={onAddCategory}
        onDeleteCategory={onDeleteCategory}
        onUpdateCategoryColor={onUpdateCategoryColor}
        forceType={isIncome ? "income" : "expense"}
      />

      {/* 삭제 — 사용자가 시작 월(year/month) 을 자유롭게 골라 그 월부터 미래 매칭 거래
          모두 삭제 + 고정비 비활성화. 캘린더에서 쓰는 MonthPicker 재사용. */}
      <MonthChoiceDialog
        open={!!deletingFx}
        onOpenChange={(o) => {
          if (!o) setDeletingFx(null);
        }}
        title={
          deletingFx
            ? `${deletingFx.title || deletingFx.description || (isIncome ? "수입" : "고정비")} 삭제`
            : labels.deleteAria
        }
        info={
          deletingFx ? (
            <>
              <span className="block">매월 {deletingFx.day_of_month}일 · {formatMoney(deletingFx.amount)}</span>
              {deletingFx.category?.name && (
                <span className="block text-muted-foreground/70">{deletingFx.category.name}</span>
              )}
            </>
          ) : null
        }
        question="어느 월부터 삭제할까요?"
        confirmLabel="삭제"
        defaultYear={baseYear}
        defaultMonth={baseMonth}
        destructive
        onConfirm={applyDelete}
      />

      {/* 수정 — 변경 종류(금액/결제일/둘 다) 에 따라 문구 분기 + 사용자 임의 시작 월 선택. */}
      {(() => {
        const u = pendingUpdate;
        const name = u
          ? u.oldFx.title || u.oldFx.description || "고정비"
          : "고정비";
        const amountChanged = !!u && u.newData.amount !== undefined && u.newData.amount !== u.oldFx.amount;
        const dayChanged = !!u && u.newData.day_of_month !== undefined && u.newData.day_of_month !== u.oldFx.day_of_month;

        let title = `${name} 수정`;
        let question = "어느 월부터 적용할까요?";
        let info: React.ReactNode = null;

        if (u) {
          if (amountChanged && dayChanged) {
            title = `${name} 금액·결제일 변경`;
            question = "변경된 값을 어느 월부터 적용할까요?";
            info = (
              <>
                <span className="block tabular-nums">
                  {formatMoney(u.oldFx.amount)} → {formatMoney(u.newData.amount ?? 0)}
                </span>
                <span className="block tabular-nums">
                  매월 {u.oldFx.day_of_month}일 → {u.newData.day_of_month}일
                </span>
              </>
            );
          } else if (amountChanged) {
            title = `${name} 금액 변경`;
            question = "변경된 금액을 어느 월부터 적용할까요?";
            info = (
              <span className="block tabular-nums">
                {formatMoney(u.oldFx.amount)} → {formatMoney(u.newData.amount ?? 0)}
              </span>
            );
          } else if (dayChanged) {
            title = `${name} 결제일 변경`;
            question = "변경된 결제일을 어느 월부터 적용할까요?";
            info = (
              <span className="block tabular-nums">
                매월 {u.oldFx.day_of_month}일 → {u.newData.day_of_month}일
              </span>
            );
          }
        }

        return (
          <MonthChoiceDialog
            open={!!pendingUpdate}
            onOpenChange={(o) => {
              if (!o) setPendingUpdate(null);
            }}
            title={title}
            info={info}
            question={question}
            confirmLabel="적용"
            defaultYear={baseYear}
            defaultMonth={baseMonth}
            onConfirm={applyUpdate}
          />
        );
      })()}
    </>
  );
}

/* ── 시작 월 선택 다이얼로그 ──
   사용자가 (year, month) 를 자유롭게 골라 "그 월부터 적용/삭제" — 이전 "이번달/다음달"
   2지선다보다 자유도 높음. MonthPicker 는 캘린더 페이지에서 사용 중인 동일 컴포넌트.
   파괴적(삭제) = destructive 톤, 일반(수정) = primary 톤. */
interface MonthChoiceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  info?: React.ReactNode;
  question: string;
  confirmLabel: string;
  defaultYear: number;
  defaultMonth: number;
  destructive?: boolean;
  onConfirm: (year: number, month: number) => void | Promise<void>;
}

function MonthChoiceDialog({
  open,
  onOpenChange,
  title,
  info,
  question,
  confirmLabel,
  defaultYear,
  defaultMonth,
  destructive,
  onConfirm,
}: MonthChoiceProps) {
  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);
  const [busy, setBusy] = useState(false);

  // 다이얼로그 오픈 시점에 default 로 리셋 — 이전 선택값이 남아있지 않도록.
  // (open 동안 defaultYear/Month 가 바뀌어도 유저 선택은 보존하므로 deps 는 open 만.)
  useEffect(() => {
    if (open) {
      setYear(defaultYear);
      setMonth(defaultMonth);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handle = async () => {
    setBusy(true);
    try {
      await onConfirm(year, month);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const accent = destructive
    ? "bg-destructive text-white hover:bg-destructive/90"
    : "bg-primary text-primary-foreground hover:bg-primary/90";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showBackButton={false}
        className="max-w-[calc(100%-3rem)] sm:max-w-md p-0 gap-0 overflow-hidden z-[80]"
      >
        {/* Header: 제목 + 정보 + 질문 */}
        <div className="px-5 pt-5 pb-3 flex flex-col items-center text-center gap-1.5">
          <DialogHeader className="contents">
            <DialogTitle className="text-base font-semibold leading-snug break-keep">
              {title}
            </DialogTitle>
          </DialogHeader>
          {info && <div className="text-[13px] text-foreground/80 leading-relaxed">{info}</div>}
          <p className="text-xs text-muted-foreground mt-1.5 font-medium">{question}</p>
        </div>

        {/* MonthPicker — 캘린더 페이지와 동일 UI */}
        <div className="px-3 pb-3 flex flex-col items-center gap-2">
          <div className="flex justify-center">
            <MonthPicker
              year={year}
              month={month}
              onYearChange={setYear}
              onMonthChange={setMonth}
              // Dialog z-[80] 위로 띄움 — 안 그러면 popover 가 다이얼로그 뒤로 깔려 클릭 불가.
              popoverPositionerClassName="z-[90]"
            />
          </div>
          <p className="text-[11px] text-muted-foreground break-keep leading-relaxed text-center">
            {year}년 {month}월 1일부터 미래 모든 매칭 거래에 적용됩니다.
          </p>
        </div>

        {/* 액션 푸터 — 좌:취소 / 우:확정 */}
        <div className="border-t flex">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="flex-1 px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-accent/40 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handle}
            disabled={busy}
            className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-50 ${accent}`}
          >
            {confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
