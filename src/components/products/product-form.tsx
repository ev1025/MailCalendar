"use client";

import { useState, useEffect } from "react";
import FormPage from "@/components/ui/form-page";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import DatePicker from "@/components/ui/date-picker";
import { supabase } from "@/lib/supabase";
import { useCurrentUserId } from "@/lib/current-user";
import { useProductCategories } from "@/hooks/use-product-categories";
import { useProductSubTags } from "@/hooks/use-product-subtags";
import TagInput from "@/components/ui/tag-input";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { Product, ProductCategory } from "@/types";
import {
  FORM_INPUT_PRIMARY,
  FORM_INPUT_COMPACT,
} from "@/lib/form-classes";
import { todayYmd as todayIsoDate } from "@/lib/date-utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
  onSave: (
    data: Omit<Product, "id" | "created_at" | "updated_at">
  ) => Promise<{ error: unknown; data?: Product | null }>;
}

/**
 * 쇼핑기록 제품 폼.
 *
 * 레이아웃:
 *   제품명
 *   브랜드 │ 구매일
 *   분류 │ 세부분류 │ 가격
 *   URL
 *   메모
 *   [고정비에 추가] (체크 시 결제일 + 반복 개월 수)
 *
 * 가격은 단일 값(목록 기능 제거). product_purchases 에 1행만 유지 (저장 시 기존 삭제 + 1개 insert).
 * "고정비에 추가" 시 가계부 카테고리는 product.category 와 같은 이름의 expense_categories 행을 매칭,
 * 없으면 "기타지출" 폴백. 월 비용은 입력한 가격을 그대로 사용.
 */
export default function ProductForm({
  open,
  onOpenChange,
  product,
  onSave,
}: Props) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ProductCategory>("영양제");
  const {
    tags: categoryTags,
    addCategory: addMidCategory,
    deleteCategory: deleteMidCategory,
    updateCategoryColor: updateMidCategoryColor,
  } = useProductCategories();
  const [subCategory, setSubCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [notes, setNotes] = useState("");
  // 단일 가격 + 구매일 + URL.
  const [price, setPrice] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(todayIsoDate());
  const [siteUrl, setSiteUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const userId = useCurrentUserId();

  const { tags: subTags, addTag, deleteTag, updateTagColor } = useProductSubTags(category);

  // 폼 열릴 때 product 값으로 초기화 + 가격 1행 로드.
  useEffect(() => {
    if (!open) return;
    if (product) {
      setName(product.name);
      setCategory(product.category);
      setSubCategory(product.sub_category || "");
      setBrand(product.brand || "");
      setNotes(product.notes || "");
      setPrice(product.monthly_cost ? String(product.monthly_cost) : "");
      // 가격 이력 → 가장 최근 1행만 사용
      supabase
        .from("product_purchases")
        .select("total_price, link, purchased_at")
        .eq("product_id", product.id)
        .order("purchased_at", { ascending: false })
        .limit(1)
        .then(({ data }) => {
          if (data && data.length > 0) {
            const p = data[0] as { total_price: number; link: string | null; purchased_at: string | null };
            setPrice(String(p.total_price));
            setSiteUrl(p.link || "");
            setPurchasedAt(p.purchased_at || todayIsoDate());
          } else {
            setSiteUrl(product.link || "");
            setPurchasedAt(todayIsoDate());
          }
        });
    } else {
      setName("");
      setCategory("영양제");
      setSubCategory("");
      setBrand("");
      setNotes("");
      setPrice("");
      setSiteUrl("");
      setPurchasedAt(todayIsoDate());
    }
  }, [product, open]);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);

    const priceNum = parseInt(price) || null;

    // 1. 제품 저장 — 고정비 관련 필드는 기존 값 유지 (드래그바 메뉴에서 별도 관리).
    const { error, data } = await onSave({
      name: name.trim(),
      category,
      sub_category: subCategory.trim() || null,
      brand: brand.trim() || null,
      notes: notes.trim() || null,
      link: siteUrl.trim() || null,
      is_active: product?.is_active ?? false,
      monthly_cost: priceNum,
      monthly_consumption: product?.monthly_consumption ?? 1,
      default_payment_day: product?.default_payment_day ?? 11,
    });
    if (error || !data) {
      setSaving(false);
      toast.error("저장 실패");
      return;
    }
    const productId = data.id;

    // 2. 가격 1행 — 기존 모두 삭제 후 1행 삽입 (있을 때만).
    await supabase.from("product_purchases").delete().eq("product_id", productId);
    if (priceNum && userId) {
      await supabase.from("product_purchases").insert({
        product_id: productId,
        total_price: priceNum,
        points: 0,
        quantity: 1,
        quantity_unit: "개",
        purchased_at: purchasedAt || todayIsoDate(),
        store: null,
        link: siteUrl.trim() || null,
        notes: null,
        user_id: userId,
      });
    }

    setSaving(false);
    onOpenChange(false);
  };

  return (
    <FormPage
      open={open}
      onOpenChange={onOpenChange}
      title={product ? "제품 수정" : "제품 추가"}
      // 분류·세부분류·가격 3-col 행이 들어가므로 데스크탑에서 더 넓은 max-width.
      // 기본 lg(512px) 에선 TagInput 트리거가 좁아져 chip + 입력 wrap → 높이 변동(찌그러짐).
      desktopMaxWidth="md:max-w-2xl"
      submitDisabled={!name.trim()}
      saving={saving}
      onSubmit={handleSubmit}
    >
      <div className="flex flex-col gap-4">
        {/* 1행: 제품명 */}
        <FormField label="제품명" required htmlFor="product-name">
          <Input
            id="product-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 오메가3"
            className={FORM_INPUT_PRIMARY}
          />
        </FormField>

        {/* 2행: 브랜드 │ 구매일 */}
        <div className="grid grid-cols-2 gap-2">
          <FormField label="브랜드">
            <Input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="브랜드명"
              className={FORM_INPUT_COMPACT}
            />
          </FormField>
          <FormField label="구매일">
            <DatePicker
              value={purchasedAt}
              onChange={setPurchasedAt}
              className={`${FORM_INPUT_COMPACT} w-full min-w-0`}
            />
          </FormField>
        </div>

        {/* 3행: 분류 │ 세부분류 │ 가격 — TagInput 두 컬럼은 넓게, 가격은 fixed 7rem.
            분류/세부분류 컬럼이 좁으면 chip + 입력 폭 부족으로 wrap → 트리거 높이 변동. */}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem] gap-2">
          <FormField label="분류">
            <TagInput
              selectedTags={category ? [category] : []}
              allTags={categoryTags}
              onChange={(tags) => setCategory((tags[tags.length - 1] || "") as ProductCategory)}
              onAddTag={addMidCategory}
              onDeleteTag={deleteMidCategory}
              onUpdateTagColor={updateMidCategoryColor}
              placeholder="검색·추가"
            />
          </FormField>
          <FormField label="세부분류">
            <TagInput
              selectedTags={subCategory ? [subCategory] : []}
              allTags={subTags}
              onChange={(tags) => setSubCategory(tags[tags.length - 1] || "")}
              onAddTag={addTag}
              onDeleteTag={deleteTag}
              onUpdateTagColor={updateTagColor}
              placeholder="검색·추가"
            />
          </FormField>
          <FormField label="가격">
            <Input
              type="number"
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="35000"
              className={FORM_INPUT_COMPACT}
            />
          </FormField>
        </div>

        {/* 4행: URL — 입력은 자유, 유효한 http(s)/도메인 패턴이면 우측 외부링크
            아이콘이 활성화돼 새 탭 열기. https:// 없이 도메인만 입력해도 자동 보정. */}
        <FormField label="URL">
          <div className="relative">
            <Input
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder="https://..."
              className={`${FORM_INPUT_COMPACT} pr-10`}
            />
            {(() => {
              const trimmed = siteUrl.trim();
              if (!trimmed) return null;
              // 도메인 비슷하게 보이면 활성. 그 외(메모성 텍스트) 비활성.
              const looksLikeUrl =
                /^https?:\/\//i.test(trimmed) || /^[\w-]+(\.[\w-]+)+/.test(trimmed);
              if (!looksLikeUrl) return null;
              const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title="새 탭에서 열기"
                  aria-label="URL 열기"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              );
            })()}
          </div>
        </FormField>

        {/* 5행: 메모 */}
        <FormField label="메모">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="성분·특이사항 등"
          />
        </FormField>

        {/* 고정비 등록은 행 드래그바 메뉴 "고정비에 추가" 에서 처리. 폼에는 노출 안 함. */}
      </div>
    </FormPage>
  );
}
