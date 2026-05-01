"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Pencil, Plus } from "lucide-react";
import { useAppSetting } from "@/hooks/use-app-settings";

interface MonthlySummaryProps {
  totalIncome: number;
  totalExpense: number;
  /** 고정비 합계 — 부모에서 page.tsx 의 useFixedExpenses 와 동일 인스턴스를 공유.
   *  이전엔 monthly-summary 안에서 별도 훅을 호출해 변경이 즉시 반영 안 되었음. */
  totalFixed: number;
  /** 고정비 카드 우상단 ✏️ — 클릭 시 FixedExpenseManager 열기. */
  onOpenFixed?: () => void;
  /** 수입/지출 카드 우상단 + — 거래 폼을 해당 type 으로 미리 세팅한 채 열기. */
  onAddTransaction?: (type: "income" | "expense") => void;
}

function formatWon(amount: number) {
  return new Intl.NumberFormat("ko-KR").format(amount) + "원";
}

export default function MonthlySummary({
  totalIncome,
  totalExpense,
  totalFixed,
  onOpenFixed,
  onAddTransaction,
}: MonthlySummaryProps) {
  const { value: incomeStr, saveValue: saveIncome } = useAppSetting(
    "monthly_income",
    "0"
  );
  const monthlyIncome = parseInt(incomeStr) || 0;

  const [editingIncome, setEditingIncome] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setDraft(String(monthlyIncome));
  }, [monthlyIncome]);

  // 카드 우상단 액션 버튼 — 모바일 h-9 (44px 근접 hit area), 데스크탑 h-8.
  // 색상은 muted-foreground (보임) → foreground (호버) 로 actionable 명시.
  const ActionBtn = ({
    icon,
    onClick,
    label,
  }: {
    icon: React.ReactNode;
    onClick: () => void;
    label: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="-mr-1 -my-1 flex h-9 w-9 md:h-8 md:w-8 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0 tap-feedback"
    >
      {icon}
    </button>
  );

  const Cell = ({
    label,
    value,
    color,
    action,
  }: {
    label: string;
    value: React.ReactNode;
    color?: string;
    action?: React.ReactNode;
  }) => (
    // 데스크탑: 가로 2컬럼(좌 스코어카드 / 우 차트) 레이아웃에서 차트 높이에 맞추도록
    // h-full + justify-between. 폰트/패딩도 md+ 에서 키워 시각적 무게 확보.
    <div className="rounded-lg border bg-card px-2.5 py-2 md:px-4 md:py-3.5 flex flex-col gap-0.5 md:gap-1 min-w-0 md:h-full md:justify-between">
      <div className="flex items-center justify-between gap-1 min-h-[1rem] md:min-h-[1.25rem]">
        <span className="text-[10px] md:text-xs text-muted-foreground truncate">
          {label}
        </span>
        {action}
      </div>
      <div className={`text-sm md:text-xl font-semibold truncate tabular-nums ${color || "text-foreground"}`}>
        {value}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-1.5 md:gap-3 md:h-full">
      {/* 1층: 월급 | 고정비 — 각 카드 우상단에 ✏️ 액션 */}
      <div className="grid gap-1.5 md:gap-3 grid-cols-2 md:flex-1 md:min-h-0">
        <Cell
          label="월급"
          action={
            <ActionBtn
              icon={<Pencil className="h-3 w-3" />}
              onClick={() => setEditingIncome((v) => !v)}
              label="월급 편집"
            />
          }
          value={
            editingIncome ? (
              <Input
                type="number"
                inputMode="numeric"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  saveIncome(draft);
                  setEditingIncome(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    saveIncome(draft);
                    setEditingIncome(false);
                  }
                  if (e.key === "Escape") setEditingIncome(false);
                }}
                autoFocus
                className="h-7 md:h-9 text-xs md:text-base w-full min-w-0"
              />
            ) : (
              formatWon(monthlyIncome)
            )
          }
        />
        <Cell
          label="고정비"
          color="text-foreground"
          action={
            onOpenFixed ? (
              <ActionBtn
                icon={<Pencil className="h-3 w-3" />}
                onClick={onOpenFixed}
                label="고정비 관리"
              />
            ) : undefined
          }
          value={`-${formatWon(totalFixed)}`}
        />
      </div>

      {/* 2층: 이번달 수입 | 지출 — 각 카드 우상단에 + 액션 (해당 type 으로 폼 열림) */}
      <div className="grid gap-1.5 md:gap-3 grid-cols-2 md:flex-1 md:min-h-0">
        <Cell
          label="이번달 수입"
          color="text-finance-gain"
          action={
            onAddTransaction ? (
              <ActionBtn
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => onAddTransaction("income")}
                label="수입 추가"
              />
            ) : undefined
          }
          value={`+${formatWon(totalIncome)}`}
        />
        <Cell
          label="이번달 지출"
          color="text-finance-loss"
          action={
            onAddTransaction ? (
              <ActionBtn
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => onAddTransaction("expense")}
                label="지출 추가"
              />
            ) : undefined
          }
          value={`-${formatWon(totalExpense)}`}
        />
      </div>
    </div>
  );
}
