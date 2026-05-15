"use client";

import { useState } from "react";
import { parseYmd } from "@/lib/date-utils";
import { AnimatePresence, motion } from "motion/react";
import { useMotionEnabled } from "@/hooks/use-safe-motion";
import { Trash2, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import DeleteRecordDescription from "@/components/ui/delete-record-description";
import { formatMoney } from "@/lib/format-money";
import type { Expense } from "@/types";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

interface TransactionListProps {
  transactions: Expense[];
  onEdit: (tx: Expense) => void;
  onDelete: (id: string) => void;
  /** 고정비 출처 거래에서 "고정비 자체 수정" 선택 시 호출. 호출자는 매니저를
   *  열고 해당 fixed_expense_id 를 편집 모드로 포커스. 미지정 시 해당 옵션 미표시. */
  onEditFixed?: (fixedExpenseId: string) => void;
}

export default function TransactionList({
  transactions,
  onEdit,
  onDelete,
  onEditFixed,
}: TransactionListProps) {
  // 삭제 확인 다이얼로그 — 실수로 영구 삭제 방지.
  const [deletingTx, setDeletingTx] = useState<Expense | null>(null);
  const motionOn = useMotionEnabled();

  // 고정비 출처 거래는 별도 분기 다이얼로그 사용. onEditFixed 가 주어졌고
  // 거래에 fixed_expense_id 가 있을 때만 분기 다이얼로그 표시.
  const isFixedSourced = !!(deletingTx?.fixed_expense_id && onEditFixed);
  // 날짜별로 그룹화
  const grouped = transactions.reduce(
    (acc, tx) => {
      if (!acc[tx.date]) acc[tx.date] = [];
      acc[tx.date].push(tx);
      return acc;
    },
    {} as Record<string, Expense[]>
  );

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="flex flex-col gap-6">
      {sortedDates.map((date) => (
        <div key={date}>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground tabular-nums">
            {format(parseYmd(date), "M월 d일 (EEEE)", {
              locale: ko,
            })}
          </h3>
          <div className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
            {grouped[date].map((tx) => (
              <motion.div
                key={tx.id}
                layout={motionOn}
                initial={motionOn ? { opacity: 0, height: 0, marginTop: 0 } : false}
                animate={{ opacity: 1, height: "auto", marginTop: 0 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                transition={motionOn
                  ? { type: "spring", stiffness: 380, damping: 32, opacity: { duration: 0.18 } }
                  : { duration: 0 }}
                role="button"
                tabIndex={0}
                onClick={() => onEdit(tx)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onEdit(tx);
                }}
                className="group flex items-center justify-between rounded-lg border p-3 cursor-pointer hover:bg-accent/50 active:bg-accent overflow-hidden"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {tx.category && (
                    <div
                      className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0"
                      style={{
                        backgroundColor: tx.category.color + "20",
                        color: tx.category.color,
                      }}
                    >
                      {tx.category.name.charAt(0)}
                    </div>
                  )}
                  {/* 제목(title) 이 제일 크게. 카테고리는 그 아래 작게.
                      title 없으면 description → 카테고리명 순으로 폴백.
                      할부 항목은 카테고리 옆에 작은 배지 추가. */}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">
                      {tx.title || tx.description || tx.category?.name || "미분류"}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {(tx.title || tx.description) && tx.category?.name && (
                        <span className="text-xs text-muted-foreground truncate">
                          {tx.category.name}
                        </span>
                      )}
                      {tx.installment_total && tx.installment_total > 1 && (
                        <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shrink-0">
                          할부 {tx.installment_total}개월
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`font-semibold text-sm tabular-nums ${
                      tx.type === "income" ? "text-finance-gain" : "text-finance-loss"
                    }`}
                  >
                    {tx.type === "income" ? "+" : "-"}
                    {formatMoney(tx.amount)}
                  </span>
                  {/* 휴지통: 연한 회색. 행 클릭으로는 편집으로 가니 삭제만 별도 버튼.
                      모바일 터치 타겟 44×44 보장 — 좁으면 인접 행 잘못 누름. */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingTx(tx);
                    }}
                    className="inline-flex h-11 w-11 md:h-8 md:w-8 shrink-0 items-center justify-center rounded text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent transition-colors duration-200"
                    aria-label="거래 삭제"
                  >
                    {/* h-11 모바일 hit area + 시각 아이콘은 4px (md+는 더 작은 3.5px). */}
                    <Trash2 className="h-4 w-4 md:h-3.5 md:w-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
            </AnimatePresence>
          </div>
        </div>
      ))}

      {/* 고정비 출처 거래 — 분기 다이얼로그 (이번 달만 / 고정비 자체 수정). */}
      <Dialog
        open={isFixedSourced}
        onOpenChange={(o) => { if (!o) setDeletingTx(null); }}
      >
        <DialogContent
          showBackButton={false}
          className="max-w-[calc(100%-3rem)] sm:max-w-sm p-0 gap-0 overflow-hidden"
        >
          <div className="px-5 pt-5 pb-4 flex flex-col gap-3">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">고정비 거래 처리</DialogTitle>
            </DialogHeader>
            {deletingTx && (
              <>
                <p className="text-[13px] text-foreground/75 leading-relaxed break-keep">
                  <span className="font-semibold text-foreground">
                    {deletingTx.title || deletingTx.description || "이 거래"}
                  </span>
                  는 고정비에서 자동 등록된 거래입니다. 어떻게 처리할까요?
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (deletingTx) await onDelete(deletingTx.id);
                      setDeletingTx(null);
                    }}
                    className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-destructive/5 tap-feedback"
                  >
                    <Trash2 className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-destructive">이번 달 거래만 삭제</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        고정비 자체는 유지. 다음 달엔 다시 자동 등록.
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (deletingTx?.fixed_expense_id && onEditFixed) {
                        onEditFixed(deletingTx.fixed_expense_id);
                      }
                      setDeletingTx(null);
                    }}
                    className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent/50 tap-feedback"
                  >
                    <Pencil className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">고정비 자체 수정</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        금액·결제일·반복 기간 변경.
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

      {/* 일반 거래 — 단순 확인 다이얼로그. */}
      <ConfirmDialog
        open={!!deletingTx && !isFixedSourced}
        onOpenChange={(o) => { if (!o) setDeletingTx(null); }}
        title={
          deletingTx
            ? `${deletingTx.title || deletingTx.description || deletingTx.category?.name || "이 거래"} 삭제`
            : "삭제"
        }
        description={
          deletingTx ? (
            <DeleteRecordDescription
              fields={[
                {
                  label: "일자",
                  value: format(parseYmd(deletingTx.date), "yyyy년 M월 d일 (EEE)", { locale: ko }),
                  valueClassName: "tabular-nums",
                },
                {
                  label: "금액",
                  value: `${deletingTx.type === "income" ? "+" : "-"}${formatMoney(deletingTx.amount)}`,
                  valueClassName: `tabular-nums ${deletingTx.type === "income" ? "text-finance-gain" : "text-finance-loss"}`,
                },
                ...(deletingTx.category?.name
                  ? [{ label: "카테고리", value: deletingTx.category.name }]
                  : []),
              ]}
              footnote={
                deletingTx.installment_id && deletingTx.installment_total && deletingTx.installment_total > 1
                  ? `${deletingTx.installment_total}개월 할부 묶음이라 모든 회차가 함께 삭제돼요.`
                  : undefined
              }
            />
          ) : null
        }
        confirmLabel="삭제"
        destructive
        onConfirm={async () => {
          if (deletingTx) await onDelete(deletingTx.id);
          setDeletingTx(null);
        }}
      />
    </div>
  );
}
