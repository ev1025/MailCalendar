export type RepeatType = "none" | "weekly" | "monthly" | "yearly";

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  color: string;
  tag: string | null;
  repeat: RepeatType | null;
  series_id?: string | null; // 반복 일정 시리즈 묶음 ID (null이면 단일)
  sort_order?: number;
  created_at: string;
}

export interface EventTag {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  icon: string | null;
  color: string;
  type: "income" | "expense";
}

export interface Expense {
  id: string;
  /** 거래 이름(제목) — 목록에서 가장 크게 표시되는 필드. null 이면 description/카테고리명으로 폴백. */
  title: string | null;
  amount: number;
  category_id: string;
  /** 상세 메모 — 폼에서만 보이고 목록에서는 숨김. */
  description: string | null;
  date: string;
  type: "income" | "expense";
  payment_method: string;
  /** 할부 묶음 ID — 같은 묶음의 행은 동일 UUID. 한 항목 삭제 시 같은 묶음 전체 삭제. */
  installment_id?: string | null;
  /** 할부 총 개월 수 (2~24). null/1 이면 일시불. */
  installment_total?: number | null;
  /** 고정비 출처 — 자동 등록된 거래 추적용. 삭제 다이얼로그에서 "이 거래만 삭제 vs
   *  고정비 자체 수정" 분기에 사용. 고정비 row 삭제 시 ON DELETE SET NULL. */
  fixed_expense_id?: string | null;
  created_at: string;
  category?: ExpenseCategory;
}

// --- Products (생필품: 영양제 포함 통합) ---
// 사용자가 임의 추가 가능 → 기본값은 '영양제/화장품/단백질/음식/생필품/구독/기타'.
export type ProductCategory = string;

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  sub_category: string | null;
  brand: string | null;
  notes: string | null;
  is_active: boolean;
  monthly_cost: number | null;
  monthly_consumption: number;
  default_payment_day: number;
  link: string | null;
  sort_order?: number;
  created_at: string;
  updated_at: string;
}

export interface ProductPurchase {
  id: string;
  product_id: string;
  total_price: number;
  points: number;
  quantity: number;
  quantity_unit: string;
  purchased_at: string;
  store: string | null;
  link: string | null;
  notes: string | null;
  created_at: string;
}

// 기존 Supplement 유지(fallback 호환)
// --- Travel (데이트 확장) ---
export type TravelCategory =
  | "자연"
  | "숙소"
  | "식당"
  | "놀거리"
  | "데이트"
  | "공연"
  | "쇼핑";

export type TravelMood = "로맨틱" | "캐주얼" | "활동적" | "조용";

export interface TravelItem {
  id: string;
  title: string;
  in_season: boolean;
  region: string | null;
  category: TravelCategory;
  visited: boolean;
  tag: string | null;
  notes: string | null;
  month: number | null;
  color: string;
  visited_dates: string[] | null;
  mood: TravelMood | null;
  price_tier: number | null;
  rating: number | null;
  couple_notes: string | null;
  cover_image_url: string | null;
  // (구) 단일 위치 — 호환을 위해 유지, 새 코드에선 places 사용
  place_name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  // 여러 위치 태그 — 네이버 지도 검색으로 채움
  places: PlaceInfo[];
  created_at: string;
  updated_at: string;
}

export interface PlaceInfo {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

// 여행 계획 (travel_plans + travel_plan_tasks)
// taxi 는 UI 에선 '승용차' 로 car 와 통합 표시되나 하위호환 위해 타입 유지.
// transit = 도보+버스+지하철 혼합 조합 경로 (picker 대중교통 탭에서 선택).
export type TransportMode = "car" | "walk" | "bus" | "taxi" | "train" | "transit";

export interface TravelPlan {
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  user_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TravelPlanTask {
  id: string;
  plan_id: string;
  day_index: number;
  start_time: string | null;    // "HH:MM" 또는 null
  place_name: string;
  place_address: string | null;
  place_lat: number | null;
  place_lng: number | null;
  tag: string | null;       // 태그(복수, 콤마 구분)
  category?: string | null; // 분류(단일)
  content: string | null;
  stay_minutes: number;
  manual_order: number;
  transport_mode: TransportMode | null;
  transport_duration_sec: number | null;
  transport_manual: boolean;
  // 수단별 소요시간 캐시 (초). 옵셔널 유지 — 컬럼 없는 구 DB 에서도 동작.
  // 예: { car: 3900, bus: 7200, taxi: 3900, train: null }
  transport_durations?: Partial<Record<TransportMode, number | null>> | null;
  // transit 모드로 선택된 조합 경로의 상세 (도보·버스·지하철 혼합 step 배열).
  // 사용자가 picker 대중교통 탭에서 특정 경로를 고르면 여기 저장.
  transport_route?: TransportRouteStep[] | null;
  // 사용자가 "여기 다녀왔음" 체크 시 ISO timestamp. null = 미완료.
  // 옵셔널 — 구 DB 에 컬럼 없으면 그래도 동작(완료 표시는 미동작).
  completed_at?: string | null;
  // 대체 위치 후보 — 1순위(place_*)가 실패할 때 폼/드래그바에서 swap 할 수 있도록.
  // [{ name, address, lat, lng }, ...] 배열. 옵셔널 — 컬럼 없는 구 DB 에서도 동작.
  alt_places?: AltPlace[] | null;
  created_at: string;
}

export interface AltPlace {
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

/** transport_route JSONB 저장 형식 — lib/travel/providers RouteStep 과 동일. */
export interface TransportRouteStep {
  kind: "walk" | "bus" | "subway" | "train" | "tram" | "other";
  durationSec: number;
  name: string | null;
  fromStop: string | null;
  toStop: string | null;
  numStops: number | null;
  /** 집계된 대안 노선 번호들 (예: ["702A","720","705"]). 없으면 name 단독. */
  alternateNames?: string[];
}

export interface TravelTag {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

// --- Knowledge Base ---
export interface KnowledgeFolder {
  id: string;
  name: string;
  icon: string | null;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
}

export type KnowledgeItemType = "note" | "link" | "snippet" | "recipe";

export interface KnowledgeItem {
  id: string;
  folder_id: string | null;
  title: string;
  content: string | null;
  excerpt: string | null;
  tags: string[] | null;
  pinned: boolean;
  type: KnowledgeItemType;
  url: string | null;
  /** 폴더 내에서 사용자 지정 순서. 낮을수록 위. 2026-04-24 추가된 컬럼. */
  sort_order?: number;
  created_at: string;
  updated_at: string;
}

export interface WeatherData {
  date: string;
  temperature_min: number;
  temperature_max: number;
  weather_icon: string;
  weather_description: string;
}
