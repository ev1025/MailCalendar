"use client";

import { Suspense, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Wallet, ShoppingBag, X, Check, Repeat } from "lucide-react";
import DateRangePicker from "@/components/layout/date-range-picker";
import PageHeader from "@/components/layout/page-header";
import { useTransactions } from "@/hooks/use-transactions";
import { useFixedExpenses } from "@/hooks/use-fixed-expenses";
import { useUrlStringParam } from "@/hooks/use-url-param";
import HeaderViewMenu from "@/components/layout/header-view-menu";
import MonthlySummary from "@/components/finance/monthly-summary";
import TransactionList from "@/components/finance/transaction-list";
import TransactionForm from "@/components/finance/transaction-form";
import CategoryChart from "@/components/finance/category-chart";
import FixedExpenseManager from "@/components/finance/fixed-expense-manager";
import { Skeleton } from "@/components/ui/skeleton";
import PullToRefresh from "@/components/ui/pull-to-refresh";
import { monthBounds, parseYmd } from "@/lib/date-utils";
import { formatMoney } from "@/lib/format-money";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Expense } from "@/types";

export default function FinancePage() {
  return (
    <Suspense fallback={null}>
      <FinancePageInner />
    </Suspense>
  );
}

function FinancePageInner() {
  const router = useRouter();
  const now = new Date();

  // 시작일/종료일 — 기본은 이번 달 1일~말일. URL 에 ?s=YYYY-MM-DD&e=YYYY-MM-DD 동기화.
  const { start: defaultStart, end: defaultEnd } = monthBounds(
    now.getFullYear(),
    now.getMonth() + 1,
  );
  const [startDate, setStartDate] = useUrlStringParam("s", defaultStart);
  const [endDate, setEndDate] = useUrlStringParam("e", defaultEnd);

  // 고정비 자동 적용 시 사용할 (year, month) — startDate 가 속한 달 기준.
  const startObj = parseYmd(startDate);
  const year = startObj.getFullYear();
  const month = startObj.getMonth() + 1;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [fixedOpen, setFixedOpen] = useState(false);
  const [incomeOpen, setIncomeOpen] = useState(false);
  /** 카드 +수입 / +지출 클릭 시 폼 type 미리 세팅용. 신규 작성 시에만 의미. */
  const [formDefaultType, setFormDefaultType] = useState<"income" | "expense">("expense");
  /** 고정비 거래 클릭 시 "이 달만 / 전체 고정비" 분기 다이얼로그 대상. */
  const [fixedTxChoice, setFixedTxChoice] = useState<Expense | null>(null);
  /** 매니저 오픈 시 자동으로 편집 폼을 띄울 fx id (전체 고정비 수정 진입). */
  const [managerInitialEditingId, setManagerInitialEditingId] = useState<string | undefined>(undefined);

  const handleRangeChange = (s: string, e: string) => {
    setStartDate(s);
    setEndDate(e);
  };

  // 모바일 좌우 스와이프 — 좌측 스와이프 = 다음 달, 우측 스와이프 = 지난 달.
  // 캘린더와 동일한 ref-기반 capture 패턴. 임계값: 가로 40px, 세로 50px 미만.
  // 스와이프 시 startDate 기준 월의 1일부터 말일까지로 범위를 강제 정규화.
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  // 월 전환 슬라이드 방향 — +1 = 다음달(오른쪽에서 들어옴), -1 = 이전달, 0 = 직접 변경(fade only).
  // 캘린더와 동일 패턴.
  const slideDirRef = useRef(0);
  const shiftMonth = (delta: number) => {
    slideDirRef.current = delta > 0 ? 1 : -1;
    const t = new Date(year, month - 1 + delta, 1);
    const { start, end } = monthBounds(t.getFullYear(), t.getMonth() + 1);
    setStartDate(start);
    setEndDate(end);
  };

  const {
    transactions, categories, loading: txLoading,
    addTransaction, addInstallment, updateTransaction, deleteTransaction,
    addCategory, deleteCategory, updateCategoryColor,
    expenseByCategory,
    refetch: refetchTransactions,
  } = useTransactions(startDate, endDate);

  const {
    fixedExpenses,
    loading: fxLoading,
    addFixed,
    updateFixed,
    deleteFixed,
    deleteFixedWithScope,
    updateFixedWithScope,
    ensureFixedMonths,
    applyFixedToMonth,
  } = useFixedExpenses();

  // 고정 지출 (=type:expense) 만 — 수입(type:income) 도 fixed_expenses 에 영속하지만
  // 별도 매니저(수입 관리) 로 분리되어 노출.
  const expenseFixedExpenses = useMemo(
    () => fixedExpenses.filter((f) => f.type !== "income"),
    [fixedExpenses],
  );
  const incomeFixedExpenses = useMemo(
    () => fixedExpenses.filter((f) => f.type === "income"),
    [fixedExpenses],
  );
  // monthly-summary 가 자체 훅 인스턴스를 쓰면 변경이 즉시 반영 안 되므로
  // 여기서 합계 계산해 prop 으로 내려보냄.
  const totalFixed = useMemo(
    () => expenseFixedExpenses.reduce((s, f) => s + f.amount, 0),
    [expenseFixedExpenses],
  );

  // FixedExpenseManager 두 인스턴스(income/expense) 가 공유하는 핸들러 묶음.
  // 이전엔 두 인스턴스가 각각 ~50줄 동일 핸들러를 인라인 정의 → -100줄 리팩토링.
  const sharedManagerProps = useMemo(
    () => ({
      categories,
      defaultYear: year,
      defaultMonth: month,
      onUpdate: async (id: string, updates: Parameters<typeof updateFixed>[1]) => {
        const r = await updateFixed(id, updates);
        if (!r.error) await refetchTransactions();
        return r;
      },
      onDelete: async (id: string) => {
        const r = await deleteFixed(id);
        if (!r.error) await refetchTransactions();
        return r;
      },
      onDeleteWithScope: async (id: string, y: number, m: number) => {
        const r = await deleteFixedWithScope(id, y, m);
        if (!r.error) await refetchTransactions();
        return r;
      },
      onUpdateWithScope: async (
        id: string,
        updates: Parameters<typeof updateFixedWithScope>[1],
        y: number,
        m: number,
      ) => {
        const r = await updateFixedWithScope(id, updates, y, m);
        if (!r.error) await refetchTransactions();
        return r;
      },
      onEnsureFixedMonths: async (
        id: string,
        repeat: number,
        fromY?: number,
        fromM?: number,
      ) => {
        const r = await ensureFixedMonths(id, repeat, fromY, fromM);
        if (!r.error) await refetchTransactions();
        return r;
      },
      onAddCategory: addCategory,
      onDeleteCategory: deleteCategory,
      onUpdateCategoryColor: updateCategoryColor,
    }),
    // 핸들러 함수 ref 들이 안정적이라 변경 빈도 낮음. category·month 변경시만 갱신.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categories, year, month],
  );

  // 수입 add — bulk insert 까지 await + 실패 시 toast. 폼이 즉시 닫혀도 거래 반영 보장.
  const incomeAdd = async (
    item: Parameters<typeof addFixed>[0],
    repeatMonths: Parameters<typeof addFixed>[1],
  ) => {
    const r = await addFixed(item, repeatMonths);
    if (r.error) return { error: r.error };
    if (r.bulkDone) {
      try {
        await r.bulkDone;
        await refetchTransactions();
      } catch (e) {
        console.error("[income recurring]", e);
        toast.error("거래 자동 등록 실패 — 가계부에 반영되지 않을 수 있어요");
        return { error: e };
      }
    }
    return { error: null };
  };

  // 지출 add — fx INSERT 만 await + bulk 는 fire-and-forget. 폼 응답 빠르게.
  const expenseAdd = async (
    item: Parameters<typeof addFixed>[0],
    repeatMonths: Parameters<typeof addFixed>[1],
  ) => {
    const r = await addFixed(item, repeatMonths);
    if (!r.error && r.bulkDone) {
      r.bulkDone
        .then(() => refetchTransactions())
        .catch((e) => {
          console.error("[fixed-expense bulk insert]", e);
        });
    }
    return { error: r.error };
  };

  // 자동 적용 useEffect 제거 — 페이지 마운트마다 트리거되어 사용자가 수동으로
  // 거래를 지워도 다음 진입 시 다시 등록되는 문제 + 고정비 삭제 후 재추가 시 중복
  // 등록되는 문제의 근본 원인이었음. 이제 사용자가 명시적으로 트리거 (고정비 추가 시
  // 다이얼로그, 또는 매니저의 "이번달 자동 적용" 버튼) 할 때만 적용됨.

  // useTransactions 가 이미 date desc + created_at desc 로 정렬해서 반환 — 재정렬 불필요.
  const allTransactions = transactions;

  // 카테고리 차트 클릭으로 설정되는 필터. null = 전체.
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  // 고정비에서 자동 등록된 거래 포함 여부 (여행 "가본곳 포함" 토글 패턴 차용).
  const [includeFixed, setIncludeFixed] = useState(true);

  // 어떤 거래가 고정비에서 자동 등록된 것인지 판별 — applyFixedToMonth 가
  // amount + description 동일하게 insert 하므로 그 조합으로 매칭.
  // (false-positive 가능성 있으나 실용상 충분.)
  const fixedSet = useMemo(() => {
    const s = new Set<string>();
    for (const fx of fixedExpenses) {
      s.add(`${fx.amount}|${fx.description ?? ""}`);
    }
    return s;
  }, [fixedExpenses]);

  const isFromFixed = (tx: Expense) => fixedSet.has(`${tx.amount}|${tx.description ?? ""}`);
  /** 거래 → 매칭되는 고정비 row. amount + description 매칭. */
  const findFixedFor = (tx: Expense) =>
    fixedExpenses.find(
      (fx) => fx.amount === tx.amount && (fx.description ?? "") === (tx.description ?? ""),
    );

  /** 거래 카드 클릭 핸들러 — 고정비 매칭이면 분기 다이얼로그, 아니면 바로 편집 폼. */
  const handleTxClick = (tx: Expense) => {
    if (isFromFixed(tx)) {
      setFixedTxChoice(tx);
      return;
    }
    setEditing(tx);
    setFormOpen(true);
  };

  // includeFixed 만 적용한 베이스 — 스코어카드(이번달 수입/지출) + 카테고리별 차트의 기준.
  // (categoryFilter 는 거래 목록에만 적용되어야 함 — 차트 자체가 카테고리 선택의 출발점이므로
  // 차트가 자기 자신에 의해 필터되면 단일 카테고리만 보이는 비정상 상태가 됨.)
  // includeFixed=false 일 때도 수입(type=income) 은 항상 유지 — 사용자는 "고정 지출만
  // 가리고 싶다"는 의도이며 수입까지 가려지면 잔액 계산이 음수로 왜곡됨.
  const baseTransactions = useMemo(() => {
    if (includeFixed) return allTransactions;
    return allTransactions.filter((tx) => tx.type === "income" || !isFromFixed(tx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTransactions, includeFixed, fixedSet]);

  const baseTotalIncome = useMemo(
    () => baseTransactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
    [baseTransactions],
  );
  const baseTotalExpense = useMemo(
    () => baseTransactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
    [baseTransactions],
  );
  const baseExpenseByCategory = useMemo(() => {
    return baseTransactions
      .filter((t) => t.type === "expense" && t.category)
      .reduce((acc, t) => {
        const catName = t.category!.name;
        const catColor = t.category!.color;
        if (!acc[catName]) acc[catName] = { amount: 0, color: catColor };
        acc[catName].amount += t.amount;
        return acc;
      }, {} as Record<string, { amount: number; color: string }>);
  }, [baseTransactions]);

  const filteredTransactions = useMemo(() => {
    return baseTransactions.filter((tx) => {
      // 수입 거래는 가계부 목록에 노출하지 않음 — 수입 관리(수입 매니저) 에서만 관리.
      // 카드 합계(수입/지출/잔액) 와 차트는 baseTotalIncome/Expense 로 별도 계산.
      if (tx.type === "income") return false;
      if (categoryFilter && tx.category?.name !== categoryFilter) return false;
      return true;
    });
  }, [baseTransactions, categoryFilter]);

  // 필터링된 거래의 합계 (UI 표시용)
  const filteredTotal = useMemo(
    () => filteredTransactions.reduce((sum, tx) => sum + (tx.type === "expense" ? tx.amount : 0), 0),
    [filteredTransactions],
  );

  const handleSave = async (
    data: {
      title: string | null;
      amount: number; category_id: string; description: string | null;
      date: string; type: "income" | "expense"; payment_method: string;
    },
    installmentMonths?: number
  ) => {
    if (editing) return await updateTransaction(editing.id, data);
    if (installmentMonths && installmentMonths >= 2) {
      return await addInstallment(data, installmentMonths);
    }
    return await addTransaction(data);
  };

  return (
    <>
      <PageHeader
        title="가계부"
        actions={
          <HeaderViewMenu
            items={[
              {
                key: "finance",
                label: "가계부",
                icon: Wallet,
                active: true,
                onSelect: () => {},
              },
              {
                key: "products",
                label: "쇼핑기록",
                icon: ShoppingBag,
                onSelect: () => router.push("/products"),
              },
            ]}
          />
        }
      />
    <div className="flex flex-col h-[calc(100%-3.5rem)]">
    <div
      className="flex-1 overflow-y-auto px-2 py-2 md:p-6 animate-page-in"
      onTouchStartCapture={(e) => {
        const t = e.touches[0];
        swipeRef.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchEndCapture={(e) => {
        const start = swipeRef.current;
        swipeRef.current = null;
        if (!start) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        // 가로 40px 이상 & 세로 이동 50px 미만 — 수직 스크롤과 분리.
        if (Math.abs(dx) < 40 || Math.abs(dy) > 50) return;
        shiftMonth(dx < 0 ? 1 : -1);
      }}
    >
      <PullToRefresh
        onRefresh={async () => { await refetchTransactions(); }}
      >
      {/* 월 전환 슬라이드 — 캘린더와 동일 방식. key 변경 시 새 motion.div 마운트 +
          enter only (exit 없음 → 레이아웃 안전). DateRangePicker 자체는 외부에 두면
          매번 같이 슬라이드되면 어색하므로 콘텐츠만 감쌈. */}
      <div className="mb-2 flex justify-center">
        <DateRangePicker startDate={startDate} endDate={endDate} onChange={handleRangeChange} />
      </div>
      <motion.div
        key={`${year}-${month}`}
        initial={{
          x: slideDirRef.current > 0 ? 40 : slideDirRef.current < 0 ? -40 : 0,
          opacity: 0,
        }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
        onAnimationComplete={() => { slideDirRef.current = 0; }}
        className="w-full md:max-w-5xl md:mx-auto"
      >

      {/* 페이지 상단의 [고정비] [+ 추가] 버튼은 제거. 액션은 MonthlySummary
          각 카드 우상단의 ✏️ / + 아이콘으로 직접 수행. */}

      {(
        <div className="flex flex-col gap-3 md:gap-4">
          {/* 데스크탑(md+): 좌 스코어카드 / 우 카테고리 차트 2단. 모바일: 세로 스택. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 md:items-stretch">
            <MonthlySummary
              totalIncome={baseTotalIncome}
              totalExpense={baseTotalExpense}
              totalFixed={totalFixed}
              onOpenFixed={() => setFixedOpen(true)}
              onOpenIncome={() => setIncomeOpen(true)}
              onAddTransaction={(t) => {
                setEditing(null);
                setFormDefaultType(t);
                setFormOpen(true);
              }}
            />
            <CategoryChart
              expenseByCategory={baseExpenseByCategory}
              totalExpense={baseTotalExpense}
              onSelectCategory={setCategoryFilter}
              activeCategory={categoryFilter}
            />
          </div>

          {/* 거래 목록 헤더 — 한 줄에 [필터 칩 + 건수·합계] | [고정비 포함 체크박스]
              항상 노출되어 정보 일관. 필터 칩은 카테고리 색을 적용해 차트와 시각 연결. */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {categoryFilter && (
                <button
                  type="button"
                  onClick={() => setCategoryFilter(null)}
                  aria-label={`${categoryFilter} 필터 해제`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors hover:opacity-80"
                  style={{
                    backgroundColor: (expenseByCategory[categoryFilter]?.color || "#6B7280") + "1A",
                    borderColor: (expenseByCategory[categoryFilter]?.color || "#6B7280") + "55",
                    color: expenseByCategory[categoryFilter]?.color || "#6B7280",
                  }}
                >
                  {categoryFilter}
                  <X className="h-3 w-3 opacity-70" />
                </button>
              )}
              <span className="text-xs text-muted-foreground tabular-nums truncate">
                총 {filteredTransactions.length}건
                {filteredTotal > 0 && (
                  <> · {formatMoney(filteredTotal)}</>
                )}
              </span>
            </div>

            {/* 고정비 포함 체크박스 — 명시적 의미. Pin 아이콘 메타포 모호함 제거. */}
            <button
              type="button"
              onClick={() => setIncludeFixed((v) => !v)}
              aria-pressed={includeFixed}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 h-7 text-xs hover:bg-accent/50 transition-colors"
            >
              <span
                className={`flex h-3.5 w-3.5 items-center justify-center rounded border-[1.5px] transition-colors ${
                  includeFixed
                    ? "bg-primary border-primary"
                    : "border-muted-foreground/40"
                }`}
              >
                {includeFixed && (
                  <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />
                )}
              </span>
              <span className={includeFixed ? "" : "text-muted-foreground"}>
                고정비 포함
              </span>
            </button>
          </div>

          {txLoading ? (
            // 빈 div 대신 거래 행 모양 skeleton 3개 — 콘텐츠 형태가 미리 보여 jank 줄임.
            <div className="flex flex-col gap-2 py-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="flex-1 flex flex-col gap-1.5">
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <p className="text-sm text-muted-foreground">
                {categoryFilter || !includeFixed
                  ? "조건에 맞는 내역이 없습니다"
                  : "이 달의 내역이 없습니다"}
              </p>
              {/* 다음 행동 유도 — 필터 활성 시 해제 버튼, 비활성 시 입력 안내. */}
              {(categoryFilter || !includeFixed) ? (
                <button
                  type="button"
                  onClick={() => {
                    if (categoryFilter) setCategoryFilter(null);
                    if (!includeFixed) setIncludeFixed(true);
                  }}
                  className="text-xs text-info hover:underline"
                >
                  필터 해제하기
                </button>
              ) : (
                <p className="text-xs text-muted-foreground/70 break-keep">
                  위 카드의 + 아이콘으로 수입·지출을 기록해보세요
                </p>
              )}
            </div>
          ) : (
            <TransactionList
              transactions={filteredTransactions}
              onEdit={handleTxClick}
              onDelete={async (id) => { await deleteTransaction(id); }}
              onEditFixed={(fixedExpenseId) => {
                // 거래 삭제 다이얼로그에서 "고정비 자체 수정" 선택 → 매니저를 해당
                // 항목 편집 모드로 열기. 매니저가 닫힐 때 initialEditingId 는 자동 reset.
                setManagerInitialEditingId(fixedExpenseId);
                setFixedOpen(true);
              }}
            />
          )}
        </div>
      )}

      <TransactionForm
        open={formOpen}
        onOpenChange={setFormOpen}
        categories={categories}
        transaction={editing}
        defaultType={formDefaultType}
        onSave={handleSave}
        onAddCategory={addCategory}
        onDeleteCategory={deleteCategory}
        onUpdateCategoryColor={updateCategoryColor}
      />
      {/* 수입(income) · 지출(expense) 두 매니저는 onAdd 를 제외한 모든 mutation/카테고리
          핸들러가 동일. variant + open 상태 + onAdd 차이만 별도 prop 으로. */}
      <FixedExpenseManager
        {...sharedManagerProps}
        open={incomeOpen}
        onOpenChange={setIncomeOpen}
        fixedExpenses={incomeFixedExpenses}
        variant="income"
        onAdd={incomeAdd}
      />
      <FixedExpenseManager
        {...sharedManagerProps}
        open={fixedOpen}
        onOpenChange={(o) => {
          setFixedOpen(o);
          // 매니저 닫힐 때 initialEditingId 도 초기화 — 다음에 일반 진입 시 자동 편집 안 되도록.
          if (!o) setManagerInitialEditingId(undefined);
        }}
        fixedExpenses={expenseFixedExpenses}
        initialEditingId={managerInitialEditingId}
        onAdd={expenseAdd}
      />

      {/* 고정비 매칭 거래 클릭 시 — "이 달만 / 전체" 분기 다이얼로그.
          전체 선택 시 매니저 열리며 그 fx 의 편집 폼이 자동으로 뜸. */}
      <Dialog
        open={!!fixedTxChoice}
        onOpenChange={(o) => { if (!o) setFixedTxChoice(null); }}
      >
        <DialogContent
          showBackButton={false}
          className="max-w-[calc(100%-3rem)] sm:max-w-sm p-0 gap-0 overflow-hidden"
        >
          <div className="px-5 pt-5 pb-3 flex flex-col items-center text-center gap-1.5">
            <DialogHeader className="contents">
              <DialogTitle className="text-base font-semibold leading-snug break-keep">
                고정비 거래 수정
              </DialogTitle>
            </DialogHeader>
            <p className="text-[13px] text-muted-foreground leading-relaxed break-keep">
              이 거래는 고정비에서 자동 등록된 항목이에요.
              <br />어떻게 수정할까요?
            </p>
          </div>

          {/* 옵션 카드 — 2개 stacked. 위가 한정적(이 달만), 아래가 광범위(전체) 순. */}
          <div className="px-3 pb-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                if (fixedTxChoice) {
                  setEditing(fixedTxChoice);
                  setFormOpen(true);
                }
                setFixedTxChoice(null);
              }}
              className="rounded-lg border-2 border-border/60 p-3 text-left transition-all hover:border-foreground/30 hover:bg-accent/40"
            >
              <div className="text-sm font-semibold">이 달의 거래만 수정</div>
              <div className="text-[11px] text-muted-foreground mt-0.5 break-keep leading-relaxed">
                다른 달과 고정비 자체에는 영향 없음
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                const fx = fixedTxChoice ? findFixedFor(fixedTxChoice) : null;
                if (fx) {
                  setManagerInitialEditingId(fx.id);
                  setFixedOpen(true);
                }
                setFixedTxChoice(null);
              }}
              className="flex items-start gap-3 rounded-lg border-2 border-primary/40 p-3 text-left transition-all hover:border-primary/70 hover:bg-primary/5"
            >
              <Repeat className="h-5 w-5 mt-0.5 shrink-0 text-primary" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-primary">고정비 전체 수정</div>
                <div className="text-[11px] text-muted-foreground mt-0.5 break-keep leading-relaxed">
                  고정비 수정 화면으로 이동 — 적용 시작 월도 선택 가능
                </div>
              </div>
            </button>
          </div>

          <div className="border-t">
            <button
              type="button"
              onClick={() => setFixedTxChoice(null)}
              className="w-full px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-accent/40"
            >
              취소
            </button>
          </div>
        </DialogContent>
      </Dialog>
      </motion.div>
      </PullToRefresh>
    </div>
    </div>
    </>
  );
}
