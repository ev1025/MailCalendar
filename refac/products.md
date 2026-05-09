# Products — 생필품 (`/products`)

## 핵심 파일
- `src/app/products/products-client.tsx` (875줄)
- `src/components/products/*`

---

## H — 필수

### 1. ✅ ProductRow 핸들러 useCallback — `252089c`
- onEdit/onDelete/onAddFixed/onTogglePurchased 4개 → useCallback 분리. ProductRow memo 활성.

### 2. ✅ expandedGroups localStorage 영속화 — `252089c`
- 새로고침 후 펼침 상태 유지.

### 3. ⏳ DndContext 중첩 → 단일 컨텍스트
- 각 그룹마다 `<DndContext>` 재생성. 수백 제품 시 DOM 폭발.
- → 최상위 1개 + 그룹별 `<SortableContext>` 만.

### 4. ⏳ grouped 매 렌더 재계산
- `products-client.tsx:338-361` `[filtered, stats]` 의존. `stats` 가 useEffect 비동기 갱신 → 매번 새 객체.
- → stats 안정 ref 또는 grouped 의 stats 의존성 분리.

---

## M — 권장

### 5. ⏳ 검색 결과 모바일 스크롤 보존
- 검색 후 매칭 그룹 자동 펼침. 스크롤 위치 보존 안 됨.
- → IntersectionObserver 로 첫 매칭 그룹 viewport 진입 보장.

### 6. ⏳ stats 로드 실패 silent
- `products-client.tsx:301-307` 네트워크 실패 시 `-` 표시만. 재시도 버튼 또는 toast.

### 7. ⏳ 카테고리 색상 맵 deps 정합성
- `categoryColors` `useMemo([categoryTags])` 정상. 다만 `customCategorySet` 도 `customCategories` 변경마다 새 Set — deps 안정화 검토.

### 8. ⏳ 제품 순위 배지 hover 애니메이션
- 메달 정적. hover 시 scale 1.05 + rotate 살짝.

---

## L — 있으면 좋음

### 9. ⏳ 드래그 haptic feedback
- `lib/haptics.ts` 이미 있음. `onDragStart` 에서 `triggerHaptic("medium")` 호출.

### 10. ⏳ 제품 폼 가격 미설정 경고
- 월 가격 미설정 시 고정비 다이얼로그에서만 경고. 제품 폼 자체에서도 inline 검증.

---

## 적용 순서 (남은 미적용)
1. ⏳ H3 DndContext 통합 (가장 큰 성능 영향)
2. ⏳ H4 grouped 의존성 정리
3. ⏳ M6 stats 재시도
4. ⏳ M5 검색 스크롤
5. ⏳ M8 hover 애니메이션
