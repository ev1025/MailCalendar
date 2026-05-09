# Travel Plans — 여행 계획 (`/travel/plans`)

## 핵심 파일
- `src/app/travel/plans/plans-client.tsx`
- `src/components/travel/plan-list.tsx`
- `src/components/travel/plan-detail.tsx`

---

## H — 필수

### 1. ✅ autoScroll silent fail 방어 — `252089c`
- querySelector null 시 80ms backoff × 3회 재시도.

### 2. ✅ PlanCard 드래그 시각 피드백 — `252089c`
- opacity 0.85 + scale 1.03 + box-shadow + zIndex 50.

### 3. ⏳ plan list 가상화 부재
- 50+ 카드 grid 렌더 시 jank.
- → `@tanstack/react-virtual` 동적 높이.

### 4. ⏳ tasksByDay / days 의존성 순환 가능성
- `plan-detail.tsx:179-189` `[days, sorted]` 둘 다 의존. days 가 sorted 포함 → 잠재 순환.
- → 단일 useMemo 로 통합. `Map<dayIndex, tasks[]>`.

---

## M — 권장

### 5. ⏳ plan task drag-end 핸들러 재생성
- `plan-detail.tsx:172-175` `createPlanDragEndHandler` deps `[sorted, updateTask]`. sorted 변경마다 새 함수.
- → useCallback + 커링 (deps 최소화).

### 6. ⏳ PlanDateRange layout shift
- start → end 순서 강제 없음. start 변경 시 rerender.
- → `min-h` reserved 영역.

### 7. ⏳ legPaths 캐시 키 안정화
- visibleLegs 변경 시마다 새 fetch. 좌표 동일이면 캐시 재사용 패턴 검증.

### 8. ⏳ 자동 스크롤 ease 커스텀
- `scrollIntoView({ behavior: "smooth" })` 브라우저 기본. 240ms ease-out 커스텀.

---

## L — 있으면 좋음

### 9. ⏳ completed task 체크마크 fade-in
- 현재 opacity-60 만. ✓ 아이콘 fade-in / scale-in.

### 10. ⏳ 카드 삭제 confirm 위치
- 현재 ConfirmDialog 별도 modal. inline 슬라이드 액션으로 단계 줄임 (옵션).

---

## 적용 순서 (남은 미적용)
1. ⏳ H4 tasksByDay 단순화
2. ⏳ M5 dragEnd 핸들러 useCallback
3. ⏳ L9 체크마크 fade-in
4. ⏳ M6 PlanDateRange reserved
5. ⏳ H3 가상화
