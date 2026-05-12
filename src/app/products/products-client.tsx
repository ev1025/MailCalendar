"use client";

import { Suspense, memo, useCallback, useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  Plus,
  ChevronDown,
  Wallet,
  ShoppingBag,
  Trash2,
  Repeat,
  Copy,
  X,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import SearchInput from "@/components/ui/search-input";
import RowActionPopover from "@/components/ui/row-action-popover";
import { useUrlStringParam } from "@/hooks/use-url-param";
import { todayYmd } from "@/lib/date-utils";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { toDragProps } from "@/lib/dnd-types";
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useProducts } from "@/hooks/use-products";
import { useProductCategories } from "@/hooks/use-product-categories";
import { useFixedExpenses } from "@/hooks/use-fixed-expenses";
import { useTransactions } from "@/hooks/use-transactions";
import { useCurrentUserId } from "@/lib/current-user";
import ProductForm from "@/components/products/product-form";
import type { Product } from "@/types";
import PageHeader from "@/components/layout/page-header";
import HeaderViewMenu from "@/components/layout/header-view-menu";
import PromptDialog from "@/components/ui/prompt-dialog";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import NumberWheel from "@/components/ui/number-wheel";
import { PAGE_ACTION_BUTTON, FORM_INPUT_COMPACT } from "@/lib/form-classes";

interface ProductStat {
  minPrice: number | null;
}

// 행 한 줄 — 좌측 드래그바(메뉴: 구매 토글·고정비 추가·삭제), 본문 탭 = 편집.
// 드래그=정렬, 탭=메뉴. 구매 표시(지갑) 는 product.is_active 토글.
const ProductRow = memo(function ProductRow({
  p,
  idx,
  stat,
  onEdit,
  onDelete,
  onAddFixed,
  onTogglePurchased,
  onDuplicate,
}: {
  p: Product;
  idx: number;
  stat?: ProductStat;
  onEdit: (p: Product) => void;
  onDelete: (p: Product) => void;
  onAddFixed: (p: Product) => void;
  onTogglePurchased: (p: Product) => void;
  onDuplicate: (p: Product) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: p.id });
  const dragProps = toDragProps<HTMLElement>({ attributes, listeners });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-t cursor-pointer group transition-colors ${
        p.is_active
          ? "bg-finance-gain/5 hover:bg-finance-gain/10"
          : "hover:bg-accent/50"
      }`}
      onClick={() => onEdit(p)}
    >
      {/* 드래그바 메뉴 — 탭하면 메뉴, 드래그(마우스 5px / 터치 200ms) 하면 정렬. */}
      <td className="px-0.5 py-1 w-7" onClick={(e) => e.stopPropagation()}>
        <RowActionPopover
          triggerLabel="제품 메뉴"
          dragAttributes={dragProps.attributes}
          dragListeners={dragProps.listeners}
          items={[
            {
              icon: <Wallet className="h-3.5 w-3.5 text-amber-500" />,
              label: p.is_active ? "구매 취소" : "구매",
              onClick: () => onTogglePurchased(p),
            },
            {
              icon: <Repeat className="h-3.5 w-3.5 text-blue-600" />,
              label: "고정비에 추가",
              onClick: () => onAddFixed(p),
            },
            {
              icon: <Copy className="h-3.5 w-3.5" />,
              label: "복제",
              onClick: () => onDuplicate(p),
            },
            {
              icon: <Trash2 className="h-3.5 w-3.5" />,
              label: "삭제",
              destructive: true,
              onClick: () => onDelete(p),
            },
          ]}
        />
      </td>
      {/* 순위 배지 — 1·2·3 위는 메달 색. h-5 w-5 로 가독성 향상. */}
      <td className="text-center px-1 py-1.5 whitespace-nowrap w-8">
        <span
          aria-label={`${idx + 1}위`}
          className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
            idx === 0
              ? "bg-yellow-100 text-yellow-700 ring-1 ring-yellow-300"
              : idx === 1
                ? "bg-gray-100 text-gray-700 ring-1 ring-gray-300"
                : idx === 2
                  ? "bg-orange-100 text-orange-700 ring-1 ring-orange-300"
                  : "text-muted-foreground"
          }`}
        >
          {idx + 1}
        </span>
      </td>
      {/* 제품명 + 브랜드 + (구매 표시 시) 지갑 + (link 있으면) 외부 링크 아이콘. */}
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1 min-w-0">
          <span className="font-medium text-xs truncate">{p.name}</span>
          {p.brand && (
            <span className="text-[10px] text-muted-foreground shrink-0">· {p.brand}</span>
          )}
          {p.is_active && (
            <Wallet
              className="h-3 w-3 text-amber-500 shrink-0"
              aria-label="구매됨"
            />
          )}
          {p.link && (() => {
            const trimmed = p.link.trim();
            const looksLikeUrl =
              /^https?:\/\//i.test(trimmed) || /^[\w-]+(\.[\w-]+)+/.test(trimmed);
            if (!looksLikeUrl) return null;
            const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-accent transition-colors"
                aria-label="구매처 열기"
                title="구매처 열기"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            );
          })()}
        </div>
      </td>
      {/* 최저가 */}
      <td className="px-2 py-1.5 text-right whitespace-nowrap text-xs font-semibold tabular-nums">
        {stat?.minPrice ? `₩${stat.minPrice.toLocaleString()}` : "-"}
      </td>
    </tr>
  );
});

export default function ProductsClient() {
  return (
    <Suspense fallback={null}>
      <ProductsPageInner />
    </Suspense>
  );
}

function ProductsPageInner() {
  const {
    products,
    loading,
    addProduct,
    updateProduct,
    deleteProduct,
    batchUpdateSortOrder,
  } = useProducts();
  const {
    categories: midCategories,
    tags: categoryTags,
    customCategories,
    addCategory,
    deleteCategory: deleteMidCategory,
  } = useProductCategories();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  // 목록 드래그바 탭 → 삭제 메뉴 → 확인 다이얼로그 대상
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  // 드래그바 메뉴 "고정비에 추가" → 결제일·반복 다이얼로그 대상
  const [fixedProduct, setFixedProduct] = useState<Product | null>(null);
  const [fixedDay, setFixedDay] = useState("11");
  const [fixedRepeat, setFixedRepeat] = useState(1);
  const [fixedSaving, setFixedSaving] = useState(false);

  // fixedProduct 가 바뀌면 기본값(제품의 default_payment_day) 으로 초기화.
  useEffect(() => {
    if (fixedProduct) {
      setFixedDay(String(fixedProduct.default_payment_day ?? 11));
      setFixedRepeat(1);
    }
  }, [fixedProduct]);

  const { addFixed } = useFixedExpenses();
  const userId = useCurrentUserId();

  // expense_categories 룩업 (분류 → 가계부 카테고리 매핑).
  const todayIso = todayYmd();
  const { categories: expCategories } = useTransactions(todayIso, todayIso);
  const [statsTick, setStatsTick] = useState(0);
  const [search, setSearch] = useState("");
  const router = useRouter();
  // category 필터 — URL 동기화 (useUrlStringParam 헬퍼로 통일).
  const [categoryFilter, setCategoryFilter] = useUrlStringParam("category", "전체");
  const [stats, setStats] = useState<Record<string, ProductStat>>({});
  // 그룹 확장 상태 영속화 — 새로고침/탭 재진입 시 마지막 펼침 상태 유지.
  const EXPANDED_KEY = "products-expanded-groups-v1";
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(EXPANDED_KEY);
      if (!raw) return new Set();
      const arr = JSON.parse(raw) as string[];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        EXPANDED_KEY,
        JSON.stringify(Array.from(expandedGroups)),
      );
    } catch {
      // quota / private mode — 무시.
    }
  }, [expandedGroups]);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [pendingDeleteCategory, setPendingDeleteCategory] = useState<string | null>(null);

  // 카테고리 색상 — DB 의 product_categories.color 가 단일 source of truth.
  // (이전엔 페이지 안에 하드코딩 맵이 있어 사용자가 색을 바꿔도 칩/섹션 헤더가 안 따라갔음.)
  const categoryColors = useMemo(
    () => Object.fromEntries(categoryTags.map((t) => [t.name, t.color])) as Record<string, string>,
    [categoryTags],
  );
  const customCategorySet = useMemo(() => new Set(customCategories), [customCategories]);

  // 제품 ID별 최저 가격
  useEffect(() => {
    if (products.length === 0) {
      setStats({});
      return;
    }
    const productIds = products.map((p) => p.id);
    supabase
      .from("product_purchases")
      .select("product_id, total_price")
      .in("product_id", productIds)
      .then(({ data, error }) => {
        if (error) {
          // 최저가 조회 실패해도 페이지는 동작 — 카드만 stats 없는 상태로.
          // 사용자에게 silent — 비치명적 부가 정보라 toast 까지는 과함.
          console.warn("[product stats]", error.message);
          setStats({});
          return;
        }
        if (!data) return;
        const map: Record<string, ProductStat> = {};
        for (const p of data as { product_id: string; total_price: number }[]) {
          const s = map[p.product_id] || { minPrice: null };
          if (s.minPrice === null || p.total_price < s.minPrice) {
            s.minPrice = p.total_price;
          }
          map[p.product_id] = s;
        }
        setStats(map);
      });
  }, [products, statsTick]);

  // ProductRow 의 인라인 핸들러를 useCallback 으로 안정화 — ProductRow 가
  // memo() 인데 매 렌더 새 함수면 memo 무용지물.
  const handleProductEdit = useCallback((prod: Product) => {
    setEditing(prod);
    setFormOpen(true);
  }, []);
  const handleProductDelete = useCallback((prod: Product) => {
    setDeletingProduct(prod);
  }, []);
  const handleProductAddFixed = useCallback((prod: Product) => {
    setFixedProduct(prod);
  }, []);
  const handleProductTogglePurchased = useCallback(
    async (prod: Product) => {
      await updateProduct(prod.id, { is_active: !prod.is_active });
    },
    [updateProduct],
  );
  // 행 메뉴의 "복제" — 제품 + 구매기록 모두 복사. 이름은 그대로 두고 사용자가 필요 시 수정.
  // (suffix 자동 부여하면 매번 "(복제)" 가 붙어 검색·정렬 지저분해짐.)
  const handleDuplicate = useCallback(
    async (p: Product) => {
      const { id, created_at, updated_at, sort_order, ...rest } = p;
      void id; void created_at; void updated_at; void sort_order;
      const { data: newProduct, error } = await addProduct(rest);
      if (error || !newProduct) {
        toast.error("복제 실패");
        return;
      }
      // 구매기록도 함께 복제 — 최저가 표시·가격 추이가 의미 있게 남도록.
      const { data: purchases } = await supabase
        .from("product_purchases")
        .select("total_price, points, quantity, quantity_unit, purchased_at, store, link, notes")
        .eq("product_id", p.id);
      if (purchases && purchases.length > 0) {
        await supabase.from("product_purchases").insert(
          purchases.map((row) => ({
            ...row,
            product_id: newProduct.id,
            ...(userId ? { user_id: userId } : {}),
          })),
        );
      }
      setStatsTick((t) => t + 1);
      toast.success("복제됨");
    },
    [addProduct, userId],
  );

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (categoryFilter !== "전체" && p.category !== categoryFilter)
        return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          (p.brand || "").toLowerCase().includes(q) ||
          (p.sub_category || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [products, categoryFilter, search]);

  // 카테고리 → 소분류 → 제품들
  const grouped = useMemo(() => {
    const g: Record<string, Record<string, Product[]>> = {};
    for (const p of filtered) {
      const cat = p.category;
      const sub = p.sub_category || "기타";
      if (!g[cat]) g[cat] = {};
      if (!g[cat][sub]) g[cat][sub] = [];
      g[cat][sub].push(p);
    }
    // 정렬: sort_order 오름차순 (사용자 드래그 결과). 동률이면 최저가 오름차순.
    for (const cat of Object.keys(g)) {
      for (const sub of Object.keys(g[cat])) {
        g[cat][sub].sort((a, b) => {
          const ao = a.sort_order ?? 0;
          const bo = b.sort_order ?? 0;
          if (ao !== bo) return ao - bo;
          const ap = stats[a.id]?.minPrice ?? Infinity;
          const bp = stats[b.id]?.minPrice ?? Infinity;
          return ap - bp;
        });
      }
    }
    return g;
  }, [filtered, stats]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 그룹 펼침 정책:
  //  - 첫 로드 시 모든 그룹 펼침 (사용자가 검색 안 하고 둘러볼 때 기본 노출)
  //  - 검색어 변경 시 매칭 그룹 모두 펼침 (결과 강조)
  //  - 카테고리 필터 변경은 기존 펼침 상태 보존 — 사용자가 닫아둔 그룹 유지.
  const expansionInitialized = useRef(false);
  useEffect(() => {
    if (expansionInitialized.current) return;
    if (Object.keys(grouped).length === 0) return;
    const keys = new Set<string>();
    for (const cat of Object.keys(grouped)) {
      for (const sub of Object.keys(grouped[cat])) keys.add(`${cat}::${sub}`);
    }
    setExpandedGroups(keys);
    expansionInitialized.current = true;
  }, [grouped]);
  useEffect(() => {
    if (!expansionInitialized.current) return;
    const keys = new Set<string>();
    for (const cat of Object.keys(grouped)) {
      for (const sub of Object.keys(grouped[cat])) keys.add(`${cat}::${sub}`);
    }
    setExpandedGroups(keys);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleSave = async (
    data: Omit<Product, "id" | "created_at" | "updated_at">
  ) => {
    if (editing) {
      const result = await updateProduct(editing.id, data);
      return { error: result.error, data: { ...editing, ...data } as Product };
    } else {
      const result = await addProduct(data);
      return result;
    }
  };

  // 데스크탑(마우스): 5px 움직이면 드래그. 모바일(터치): 200ms 길게 누르면 드래그.
  // PointerSensor 단독 시 모바일에서 vertical 스크롤도 5px 임계로 드래그 시작 → 탭/스크롤
  // 구분 어색했음. 분리.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const handleDragEnd = async (e: DragEndEvent, groupKey: string) => {
    if (!e.over || e.active.id === e.over.id) return;
    const [cat, sub] = groupKey.split("::");
    const list = grouped[cat][sub];
    const oldIdx = list.findIndex((p) => p.id === e.active.id);
    const newIdx = list.findIndex((p) => p.id === e.over!.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(list, oldIdx, newIdx);
    // sort_order 0..n 으로 DB 영속화. fetchProducts() 호출되며 재정렬 반영.
    await batchUpdateSortOrder(reordered.map((p) => p.id));
  };

  return (
    <>
      <PageHeader
        title="쇼핑기록"
        actions={
          <HeaderViewMenu
            items={[
              {
                key: "finance",
                label: "가계부",
                icon: Wallet,
                onSelect: () => router.push("/finance"),
              },
              {
                key: "products",
                label: "쇼핑기록",
                icon: ShoppingBag,
                active: true,
                onSelect: () => {},
              },
            ]}
          />
        }
      />
    <div className="flex flex-col h-[calc(100%-3.5rem)]">
    <div className="flex-1 overflow-y-auto p-4 md:p-6 animate-page-in">
      <div className="w-full md:max-w-5xl md:mx-auto">

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="제품명/브랜드/소분류 검색"
            size="md"
            className="md:max-w-sm"
          />
          <Button
            size="sm"
            className={`${PAGE_ACTION_BUTTON} shrink-0`}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            추가
          </Button>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
          {/* 순서: 전체 → 빌트인 분류 → 사용자 추가 분류 → +추가 (표준 패턴: 추가 액션은 끝) */}
          {(["전체", ...midCategories.filter((c) => c !== "전체"), "__add__"] as string[]).map((c) => {
            if (c === "__add__") {
              return (
                <button
                  key="__add__"
                  type="button"
                  onClick={() => setAddCategoryOpen(true)}
                  className="shrink-0 rounded-full border border-dashed px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
                  aria-label="분류 추가"
                >
                  <Plus className="h-3 w-3" />
                </button>
              );
            }
            const active = categoryFilter === c;
            const color = c === "전체" ? "#6B7280" : categoryColors[c] || "#6B7280";
            const canDelete = c !== "전체" && customCategorySet.has(c);
            return (
              <div
                key={c}
                role="button"
                tabIndex={0}
                onClick={() => setCategoryFilter(c)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setCategoryFilter(c);
                  }
                }}
                className={`group/cat inline-flex shrink-0 items-center gap-1 rounded-full border py-1.5 text-xs transition-all cursor-pointer select-none ${
                  canDelete ? "pl-3 pr-1.5" : "px-3"
                }`}
                style={
                  active
                    ? {
                        borderColor: color,
                        backgroundColor: color + "20",
                        color,
                        fontWeight: 600,
                      }
                    : { color: "#6B7280" }
                }
              >
                <span>{c}</span>
                {canDelete && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDeleteCategory(c);
                    }}
                    className="flex h-4 w-4 items-center justify-center rounded-full opacity-60 hover:opacity-100 hover:bg-black/10"
                    aria-label={`${c} 삭제`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">불러오는 중...</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
          <p className="text-sm text-muted-foreground">
            {products.length === 0
              ? "등록된 제품이 없습니다"
              : "검색 결과가 없습니다"}
          </p>
          {products.length === 0 && (
            <p className="text-xs text-muted-foreground/70">
              + 버튼으로 제품을 추가하고 구매 가격을 기록해보세요
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {Object.keys(grouped).map((cat) => {
            const catColor = categoryColors[cat] || "#6B7280";
            const subCats = Object.keys(grouped[cat]);
            return (
              <section key={cat} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: catColor }}
                  />
                  <h3
                    className="text-sm font-bold"
                    style={{ color: catColor }}
                  >
                    {cat}
                  </h3>
                </div>

                {subCats.map((sub) => {
                  const groupKey = `${cat}::${sub}`;
                  const expanded = expandedGroups.has(groupKey);
                  const list = grouped[cat][sub];
                  return (
                    <div
                      key={groupKey}
                      className="rounded-lg border bg-card overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() => toggleGroup(groupKey)}
                        className="w-full flex items-center gap-1.5 px-2.5 py-2 hover:bg-accent/50 transition-colors"
                      >
                        <ChevronDown
                          className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${
                            expanded ? "rotate-0" : "-rotate-90"
                          }`}
                        />
                        <span className="text-xs font-semibold">{sub}</span>
                      </button>
                      <AnimatePresence initial={false}>
                        {expanded && (
                          <motion.div
                            key="content"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                            style={{ overflow: "hidden" }}
                            className="border-t"
                          >
                            <div className="overflow-x-auto">
                              <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={(e) => handleDragEnd(e, groupKey)}
                              >
                                <table className="w-full text-xs" style={{ tableLayout: "auto" }}>
                                  <colgroup>
                                    <col style={{ width: "1.75rem" }} />
                                    <col style={{ width: "2rem" }} />
                                    <col />
                                    <col style={{ width: "1%" }} />
                                  </colgroup>
                                  <thead className="sr-only">
                                    <tr>
                                      <th scope="col">메뉴</th>
                                      <th scope="col">순위</th>
                                      <th scope="col">제품 정보</th>
                                      <th scope="col">최저가</th>
                                    </tr>
                                  </thead>
                                  <SortableContext
                                    items={list.map((p) => p.id)}
                                    strategy={verticalListSortingStrategy}
                                  >
                                    <tbody>
                                      {list.map((p, idx) => (
                                        <ProductRow
                                          key={p.id}
                                          p={p}
                                          idx={idx}
                                          stat={stats[p.id]}
                                          onEdit={handleProductEdit}
                                          onDelete={handleProductDelete}
                                          onAddFixed={handleProductAddFixed}
                                          onTogglePurchased={handleProductTogglePurchased}
                                          onDuplicate={handleDuplicate}
                                        />
                                      ))}
                                    </tbody>
                                  </SortableContext>
                                </table>
                              </DndContext>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}

      <ProductForm
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setStatsTick((t) => t + 1);
        }}
        product={editing}
        onSave={handleSave}
      />

      {/* 제품 삭제 확인 — 목록 드래그바 → 삭제 경로 */}
      <ConfirmDialog
        open={!!deletingProduct}
        onOpenChange={(o) => { if (!o) setDeletingProduct(null); }}
        title={deletingProduct ? `${deletingProduct.name} 삭제` : "제품 삭제"}
        description={
          deletingProduct ? (
            <span className="block text-foreground">
              {deletingProduct.category}
              {deletingProduct.sub_category ? ` · ${deletingProduct.sub_category}` : ""}
              {deletingProduct.brand ? ` · ${deletingProduct.brand}` : ""}
            </span>
          ) : (
            "삭제하면 되돌릴 수 없어요."
          )
        }
        confirmLabel="삭제"
        destructive
        onConfirm={async () => {
          if (deletingProduct) {
            const res = await deleteProduct(deletingProduct.id);
            if (res?.error) {
              const msg =
                typeof res.error === "object" && res.error && "message" in res.error
                  ? String((res.error as { message?: unknown }).message)
                  : "삭제 실패";
              toast.error(msg);
            } else {
              setStatsTick((t) => t + 1);
              // 폼 안에서 삭제했을 수 있으니 폼도 닫음.
              setFormOpen(false);
              setEditing(null);
            }
          }
          setDeletingProduct(null);
        }}
      />

      <PromptDialog
        open={addCategoryOpen}
        onOpenChange={setAddCategoryOpen}
        title="새 분류 추가"
        placeholder="예: 비타민"
        confirmLabel="추가"
        onConfirm={async (name) => {
          await addCategory(name);
          setCategoryFilter(name);
        }}
      />

      <ConfirmDialog
        open={!!pendingDeleteCategory}
        onOpenChange={(o) => { if (!o) setPendingDeleteCategory(null); }}
        title={pendingDeleteCategory ? `${pendingDeleteCategory} 분류 삭제` : "분류 삭제"}
        description="이 분류에 속한 제품은 분류 없음으로 이동합니다."
        confirmLabel="삭제"
        destructive
        onConfirm={async () => {
          const name = pendingDeleteCategory;
          if (!name) return;
          if (categoryFilter === name) setCategoryFilter("전체");
          await deleteMidCategory(name);
          setPendingDeleteCategory(null);
        }}
      />

      {/* 드래그바 "고정비에 추가" 다이얼로그 — 결제일 + 반복 개월 수 입력. */}
      <Dialog
        open={!!fixedProduct}
        onOpenChange={(o) => {
          if (!o && !fixedSaving) setFixedProduct(null);
        }}
      >
        <DialogContent
          showBackButton={false}
          className="max-w-[calc(100%-3rem)] sm:max-w-sm p-0 gap-0 overflow-hidden"
        >
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="text-base font-semibold">
              고정비 추가
            </DialogTitle>
            {fixedProduct && (
              <p className="text-[13px] text-foreground/75 mt-1 break-keep">
                <span className="font-medium text-foreground/90">{fixedProduct.name}</span>
                {fixedProduct.monthly_cost ? (
                  <> · 월 <span className="tabular-nums">{new Intl.NumberFormat("ko-KR").format(fixedProduct.monthly_cost)}원</span></>
                ) : (
                  <span className="text-warning"> · ⚠ 가격 미설정</span>
                )}
              </p>
            )}
          </DialogHeader>
          <div className="px-5 pb-4 flex flex-col gap-3">
            {/* 가격 미설정 사전 경고 — submit 후 toast 가 아닌 입력 시점에 표시. */}
            {fixedProduct && (!fixedProduct.monthly_cost || fixedProduct.monthly_cost <= 0) && (
              <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-bg/60 px-2.5 py-2 text-[11px] text-warning leading-relaxed">
                <span aria-hidden>⚠</span>
                <span>이 제품에 가격이 설정되어 있지 않습니다. 제품 폼에서 월 가격을 먼저 입력해주세요.</span>
              </div>
            )}
            {/* 결제일 + 반복 — 라벨을 위로 끌어올려 명확화. */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="fixed-day" className="text-xs font-semibold text-foreground/85">결제일</label>
              <div className="flex items-center gap-2">
                <Input
                  id="fixed-day"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={31}
                  value={fixedDay}
                  onChange={(e) => setFixedDay(e.target.value)}
                  className={`${FORM_INPUT_COMPACT} w-20 text-center shrink-0`}
                />
                <span className="text-xs text-muted-foreground">일</span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-foreground/85">반복 기간</span>
              <div className="flex items-center gap-2">
                <NumberWheel
                  value={fixedRepeat}
                  onChange={setFixedRepeat}
                  min={1}
                  max={120}
                  allowInfinity
                />
                <span className="text-xs text-muted-foreground">개월</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 border-t divide-x">
            <Button
              variant="ghost"
              onClick={() => setFixedProduct(null)}
              disabled={fixedSaving}
              className="h-11 rounded-none font-medium"
            >
              취소
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                if (!fixedProduct) return;
                const price = fixedProduct.monthly_cost;
                if (!price || price <= 0) {
                  toast.error("이 제품의 가격이 설정되어 있지 않아요. 폼에서 가격을 입력해주세요.");
                  return;
                }
                const day = Math.min(31, Math.max(1, parseInt(fixedDay) || 11));
                // 분류 → 가계부 카테고리 매핑 (없으면 "기타지출", 그것도 없으면 첫 번째).
                const expCat =
                  expCategories.find((c) => c.type === "expense" && c.name === fixedProduct.category) ||
                  expCategories.find((c) => c.name === "기타지출") ||
                  expCategories.find((c) => c.type === "expense");
                if (!expCat) {
                  toast.error("가계부 카테고리를 찾을 수 없습니다.");
                  return;
                }
                setFixedSaving(true);
                const r = await addFixed(
                  {
                    title: fixedProduct.name,
                    amount: price,
                    category_id: expCat.id,
                    description: fixedProduct.name,
                    day_of_month: day,
                    type: "expense",
                    payment_method: "카드",
                    product_id: fixedProduct.id,
                  },
                  fixedRepeat,
                );
                if (!r.error) {
                  // 제품도 is_active=true 로 표시.
                  await updateProduct(fixedProduct.id, { is_active: true });
                  // bulkDone 은 fire-and-forget — 실패 시 silent 였던 것을 catch 로 감지.
                  r.bulkDone?.catch((e) => {
                    console.error("[product → fixed bulk insert]", e);
                    toast.error("일부 거래가 등록되지 않았을 수 있습니다");
                  });
                  toast.success("고정비에 추가되었습니다");
                } else {
                  toast.error("추가 실패");
                }
                setFixedSaving(false);
                setFixedProduct(null);
              }}
              disabled={fixedSaving || !fixedProduct?.monthly_cost || fixedProduct.monthly_cost <= 0}
              className="h-11 rounded-none font-semibold text-primary"
            >
              {fixedSaving ? "추가 중..." : "추가"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </div>
    </div>
    </>
  );
}
