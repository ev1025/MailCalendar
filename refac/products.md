# Products — 생필품 (`/products`)

## 핵심 파일
- `src/app/products/products-client.tsx` (875줄)
- `src/components/products/*`

---

## 기존 10 항목

### H — 필수
1. ✅ ProductRow 핸들러 useCallback — `252089c`
2. ✅ expandedGroups localStorage 영속 — `252089c`
3. ⏳ DndContext 중첩 → 단일 컨텍스트
4. ⏳ grouped 매 렌더 재계산

### M — 권장
5. ⏳ 검색 결과 모바일 스크롤 보존
6. ⏳ stats 로드 실패 silent
7. ⏳ 카테고리 색상 맵 deps
8. ⏳ 제품 순위 배지 hover

### L
9. ⏳ 드래그 haptic
10. ⏳ 제품 폼 가격 inline 검증

---

## 코드 효율성 (10)

### CE-1 ⏳ `products-client.tsx` 875줄 분할
- 카테고리 manager / row / stats / form 영역 sub-component 추출.

### CE-2 ⏳ supabase product_purchases stats fetch 로직 → 별도 hook
- `useProductStats(productIds)` 로 분리.

### CE-3 ⏳ filtered 다단계 useMemo 의존성 정합
- search + category + sub_category 단일 reducer 로 통합.

### CE-4 ⏳ ProductRow memo prop equality
- `p` reference 가 안정적인지 검증. shallow 변경 시 새 reference면 memo 무효.

### CE-5 ⏳ categoryColors 매 렌더 reduce
- 이미 useMemo. categoryTags reference 안정성 검증.

### CE-6 ⏳ DnD onDragEnd 핸들러 useCallback
- 그룹별 dragEnd 인라인. 안정화.

### CE-7 ⏳ statsTick 패턴 재검토
- `useState` tick → invalidate 로 대체 (TanStack 정석).

### CE-8 ⏳ 정렬 비교 함수 외부 헬퍼
- `cmpByField` 패턴 도입.

### CE-9 ⏳ AddCategoryDialog state 분리
- 페이지 내부에서 state 관리. 별도 컴포넌트.

### CE-10 ⏳ ProductForm 폼 state 초기화
- 닫힐 때 reset.

---

## 디자인 (10)

### D-1 ⏳ 그룹 헤더 색
- 카테고리별 dot + 이름. 현재 색 정합 검토.

### D-2 ⏳ 제품 카드 vs row 디자인
- 모바일은 카드, 데스크톱은 table row 형태.

### D-3 ✅ 활성 상태 시각화 — `e4dd33d`
- `is_active` 행 finance-gain/5 톤 + hover finance-gain/10 — 다크 모드 대비.

### D-4 ⏳ 최저가 배지 디자인
- 메달 → 더 명확한 1/2/3 ranking.

### D-5 ⏳ 빈 상태 (제품 없음)
- 일러스트 + "제품 추가" CTA.

### D-6 ⏳ 검색 결과 매칭 highlight
- `<mark>` 또는 bg-yellow tint.

### D-7 ⏳ 카테고리 chip 디자인 일관성
- finance 의 카테고리 chip 과 시각 일관.

### D-8 ✅ 그룹 펼침 아이콘 transition — `e4dd33d`
- ChevronDown rotate 0/-90° duration-200 transition.

### D-9 ⏳ 모바일 그룹 헤더 sticky
- 스크롤 시 그룹 헤더 sticky top.

### D-10 ⏳ 제품 폼 다이얼로그 디자인
- 입력 필드 정렬 + label 위치.

---

## 애니메이션 (10)

### A-1 ✅ 그룹 펼침/접힘 height transition — `e4dd33d`
- AnimatePresence + motion.div height 0 ↔ auto 로 부드러운 collapse.

### A-2 ⏳ ProductRow enter/exit AnimatePresence
- 추가/삭제 fade slide.

### A-3 ⏳ 드래그 시작 즉시 scale (Plans 패턴 적용)
- TouchSensor delay 동안 시각 cue.

### A-4 ⏳ 활성 토글 spring
- ✓ 체크 fade-in.

### A-5 ⏳ 검색 결과 fade
- 검색어 변경 → 결과 fade.

### A-6 ⏳ 그룹 헤더 hover
- 카테고리 dot 약한 scale.

### A-7 ⏳ 메달 배지 진입 spring
- 1위 / 2위 / 3위 등장 시 spring scale.

### A-8 ⏳ 카테고리 추가 시 chip enter
- AnimatePresence chip scale 0→1.

### A-9 ⏳ 폼 저장 성공 toast
- success toast slide-in (sonner default — 검증).

### A-10 ⏳ 드래그 drop 위치 시각 cue
- 드롭 가능 위치 highlight.

---

## 적용 순서 (남은 미적용 우선)
1. CE-1 파일 분할
2. A-1 그룹 펼침 height transition
3. D-3 활성 시각화
4. A-2 row enter/exit
5. CE-3 filtered 통합
