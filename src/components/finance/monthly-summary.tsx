"use client";

import { Pencil, Plus } from "lucide-react";

interface MonthlySummaryProps {
  totalIncome: number;
  totalExpense: number;
  /** 고정비 합계 — 부모에서 page.tsx 의 useFixedExpenses 와 동일 인스턴스를 공유.
   *  이전엔 monthly-summary 안에서 별도 훅을 호출해 변경이 즉시 반영 안 되었음. */
  totalFixed: number;
  /** 전월 같은 기간의 net (수입 - 지출). 전월 대비 카드 계산용. */
  prevNet: number;
  /** 고정비 카드 우상단 ✏️ — 클릭 시 FixedExpenseManager 열기. */
  onOpenFixed?: () => void;
  /** 수입 카드 우상단 ✏️ — 클릭 시 IncomeManager 열기. */
  onOpenIncome?: () => void;
  /** 지출 카드 우상단 + — 거래 폼을 expense type 으로 미리 세팅한 채 열기. */
  onAddTransaction?: (type: "income" | "expense") => void;
}

function formatWon(amount: number) {
  return new Intl.NumberFormat("ko-KR").format(amount) + "원";
}

export default function MonthlySummary({
  totalIncome,
  totalExpense,
  totalFixed,
  prevNet,
  onOpenFixed,
  onOpenIncome,
  onAddTransaction,
}: MonthlySummaryProps) {
  // 카드 우상단 액션 버튼 — visible 사이즈 h-7 w-7 유지, hit area 는 padding 으로 확장.
  // 이전엔 h-9 로 셀 패딩 박스를 넘어 value 행과 겹쳐 클릭이 막히는 문제 발생.
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
      className="-mr-0.5 flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0 tap-feedback"
    >
      {icon}
    </button>
  );

  const Cell = ({
    label,
    value,
    color,
    action,
    sub,
  }: {
    label: string;
    value: React.ReactNode;
    color?: string;
    action?: React.ReactNode;
    /** 메인 value 아래 작은 글씨로 한 줄 부가정보. */
    sub?: React.ReactNode;
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
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className={`text-sm md:text-xl font-semibold truncate tabular-nums ${color || "text-foreground"}`}>
          {value}
        </div>
        {sub && (
          <div className="text-[10px] md:text-xs truncate tabular-nums">{sub}</div>
        )}
      </div>
    </div>
  );

  // 이번달 net = 수입 - 지출. 전월 대비 = 이번달 net - 전월 net.
  const thisNet = totalIncome - totalExpense;
  const delta = thisNet - prevNet;
  const isUp = delta >= 0;
  const deltaColor = isUp ? "text-finance-gain" : "text-finance-loss";
  const deltaSign = isUp ? "+" : "-";

  return (
    <div className="flex flex-col gap-1.5 md:gap-3 md:h-full">
      {/* 1층: 수입 | 고정비 — 각 카드 우상단에 ✏️ 액션 */}
      <div className="grid gap-1.5 md:gap-3 grid-cols-2 md:flex-1 md:min-h-0">
        <Cell
          label="수입"
          color="text-info"
          action={
            onOpenIncome ? (
              <ActionBtn
                icon={<Pencil className="h-3 w-3" />}
                onClick={onOpenIncome}
                label="수입 관리"
              />
            ) : undefined
          }
          value={`+${formatWon(totalIncome)}`}
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

      {/* 2층: 전월 대비 | 이번달 지출 */}
      <div className="grid gap-1.5 md:gap-3 grid-cols-2 md:flex-1 md:min-h-0">
        <Cell
          label="전월 대비"
          color={deltaColor}
          value={`${deltaSign}${formatWon(Math.abs(delta))}`}
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
