# Travel — 여행 (`/travel`)

## 핵심 파일
- `src/app/travel/travel-client.tsx`
- `src/components/travel/travel-list.tsx`
- `src/components/travel/travel-form.tsx`

---

## H — 필수

### 1. ✅ tagColorMap / allCategories / allItemTags useMemo — `252089c`
- 매 렌더 새 객체·배열 → 메모화.

### 2. ⏳ 가상화 부재
- 100+ 행 시 모두 DOM 렌더.
- → `@tanstack/react-virtual` 동적 카드 가상화.

### 3. ⏳ 필터 영속성 분산
- sessionStorage(filters) + localStorage(order) 혼용.
- → 통합 인터페이스. `persistent-cache.ts` 활용.

### 4. ⏳ drag 의도 시각 피드백
- TouchSensor 200ms delay — hold 중 무반응 구간.
- → drag 시작 시 즉시 약한 scale 1.02 (Plans 패턴 적용).

---

## M — 권장

### 5. ⏳ 리오더 layoutId 애니메이션
- `arrayMove` 후 framer 가 위치 이동 인식 못 함.
- → `motion.div layoutId={item.id}` + AnimatePresence.

### 6. ⏳ 필터 패널 진입/퇴출 transition
- 검색창 ↔ 필터 토글 시 layout shift.
- → `<AnimatePresence mode="wait">` + min-height reserved.

### 7. ⏳ 가본 곳 토글 spring
- 체크 시 ✓ 즉시 표시. spring + scale 0.9→1 으로 만족감.

### 8. ⏳ 검색 결과 매칭 강조
- 매칭 단어에 `<mark>` 또는 bg-yellow tint.

---

## L — 있으면 좋음

### 9. ⏳ 행 내 액션 버튼 hit-target
- 모바일 10px 트리거 작음. `p-1` 패딩 추가로 24~28px.

### 10. ⏳ 삭제 swipe gesture
- 데스크톱 우클릭 / 모바일 swipe-to-delete (Vaul 또는 커스텀).

---

## 적용 순서 (남은 미적용)
1. ⏳ M5 layoutId 리오더 (즉시 효과)
2. ⏳ M7 가본 곳 토글 spring
3. ⏳ M6 필터 패널 transition
4. ⏳ H4 drag 의도 피드백
5. ⏳ H3 영속성 통합
