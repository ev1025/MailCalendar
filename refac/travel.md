# Travel — 여행 (`/travel`)

## 핵심 파일
- `src/app/travel/travel-client.tsx`
- `src/components/travel/travel-list.tsx`
- `src/components/travel/travel-form.tsx`

---

## 기존 10 항목

### H
1. ✅ tagColorMap/allCategories/allItemTags useMemo — `252089c`
2. ⏳ 가상화
3. ⏳ 영속성 통합 (sessionStorage + localStorage)
4. ⏳ drag 의도 시각 피드백

### M
5. ⏳ layoutId 리오더
6. ⏳ 필터 패널 transition
7. ⏳ 가본 곳 토글 spring
8. ⏳ 검색 매칭 강조

### L
9. ⏳ 행 액션 hit-target
10. ⏳ 삭제 swipe gesture

---

## 코드 효율성 (10)

### CE-1 ⏳ travel-list 컴포넌트 분리
- 행 컴포넌트 / 필터 / 검색 영역 — sub-component.

### CE-2 ⏳ visibleItems 다단계 필터 통합
- search + category + tags + visited 필터 매 변경 시 재계산. 단일 reducer.

### CE-3 ✅ TravelRow memo + 핸들러 useCallback — `e4dd33d`
- 핸들러 시그니처 (item)=>void 통일 + useCallback 으로 모든 행이 같은 reference 공유 → memo 실효.

### CE-4 ⏳ 정렬 키 안정화
- useMemo([items, sortField, sortDir]).

### CE-5 ⏳ 카테고리 색상 lookup O(1) Map
- map 으로 변환 useMemo.

### CE-6 ⏳ DnD onDragEnd useCallback
- 인라인 — 안정화.

### CE-7 ⏳ filter sessionStorage / localStorage 통합
- `persistent-cache.ts` 활용.

### CE-8 ⏳ "가본 곳 포함" 토글 deps
- 단일 상태 vs 두 상태 — 통합.

### CE-9 ⏳ 정렬 비교 함수 헬퍼
- `cmpByField` 패턴.

### CE-10 ⏳ travel-form state 초기화
- 닫을 때 reset (다른 페이지 동일 패턴).

---

## 디자인 (10)

### D-1 ⏳ 카드 디자인 (mobile vs desktop)
- 모바일 list, 데스크톱 card grid.

### D-2 ⏳ 가본 곳 시각화
- ✓ 체크마크 + opacity.

### D-3 ⏳ 카테고리 dot 일관성
- finance / products / travel 카테고리 색 dot 일관.

### D-4 ⏳ 빈 상태 일러스트
- "여행 항목 없음" + "추가" CTA.

### D-5 ⏳ 검색 input 위치
- 상단 sticky.

### D-6 ⏳ 필터 chip 디자인
- 활성·비활성 톤 차별.

### D-7 ⏳ 가격대 표시
- ₩~₩₩₩₩ 4단계. 시각화.

### D-8 ⏳ 별점 시각화
- ★★★★★ 인터랙티브.

### D-9 ⏳ 분위기 배지
- 로맨틱/캐주얼/활동적/조용 색 차별.

### D-10 ⏳ 모바일 sticky 액션 (추가 버튼)
- bottom-right FAB.

---

## 애니메이션 (10)

### A-1 ⏳ 행 enter/exit AnimatePresence
- 추가/삭제 fade slide.

### A-2 ⏳ 가본 곳 토글 spring
- ✓ 체크 fade + scale.

### A-3 ⏳ 카드 hover scale (데스크톱)
- whileHover 1.01 + shadow.

### A-4 ⏳ 검색어 매칭 highlight
- `<mark>` fade-in.

### A-5 ⏳ 별점 클릭 spring
- 1점 ★ → 5점 ★★★★★ stagger.

### A-6 ⏳ 필터 chip 추가/제거 spring
- AnimatePresence chip.

### A-7 ⏳ 카테고리 변경 시 list reorder
- layoutId.

### A-8 ⏳ 드래그 시작 즉시 scale 1.02 (Plans 패턴)
- TouchSensor delay 동안 cue.

### A-9 ⏳ 빈 상태 → 결과 있음 transition
- 일러스트 fade-out → list fade-in.

### A-10 ⏳ "달력 추가" 버튼 클릭 즉시 피드백
- whileTap + 잠깐 success ring.

---

## 적용 순서 (남은 미적용 우선)
1. CE-3 TravelRow memo + useCallback
2. A-1 row enter/exit
3. D-2 가본 곳 시각화
4. A-2 토글 spring
5. CE-7 영속성 통합
